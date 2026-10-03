-- KAISSE PRO v1.2 — suivi du stock d'unités téléphoniques par session et opérateur.
-- Pré-requis : 202610030001_kaisse_pro_v1.sql et 202610030002_essai_14_jours.sql.
-- Migration additive : aucune ligne historique n'est réécrite ni supprimée.
-- Les stocks sont exprimés en valeur faciale FCFA, séparément du float électronique.

begin;

-- Deux nouveaux types : l'approvisionnement augmente le stock; le transfert client le diminue.
alter table public.transactions
  add column if not exists mode_paiement_unites text,
  add column if not exists operateur_paiement_code text references public.operateurs(code) on delete restrict;

alter table public.transactions
  drop constraint if exists transactions_type_operation_check;
alter table public.transactions
  add constraint transactions_type_operation_check
  check (type_operation in (
    'depot', 'retrait', 'transfert', 'achat_credit',
    'approvisionnement_unites', 'transfert_unites'
  ));

alter table public.transactions
  drop constraint if exists transactions_reglement_unites_check;
alter table public.transactions
  add constraint transactions_reglement_unites_check
  check (
    (
      type_operation in ('approvisionnement_unites', 'transfert_unites')
      and (
        (mode_paiement_unites = 'especes' and operateur_paiement_code is null)
        or (mode_paiement_unites = 'wallet' and operateur_paiement_code is not null)
      )
    )
    or (
      type_operation not in ('approvisionnement_unites', 'transfert_unites')
      and mode_paiement_unites is null
      and operateur_paiement_code is null
    )
  );

alter table public.transactions
  drop constraint if exists transactions_approvisionnement_commission_check;
alter table public.transactions
  add constraint transactions_approvisionnement_commission_check
  check (
    type_operation <> 'approvisionnement_unites'
    or (commission_estimee = 0 and coalesce(commission_reelle, 0) = 0)
  );

alter table public.commission_baremes
  drop constraint if exists commission_baremes_type_operation_check;
alter table public.commission_baremes
  add constraint commission_baremes_type_operation_check
  check (type_operation in ('depot', 'retrait', 'transfert', 'achat_credit', 'transfert_unites'));

create table if not exists public.soldes_session_unites (
  session_id uuid not null references public.sessions_caisse(id) on delete cascade,
  operateur_code text not null references public.operateurs(code) on delete restrict,
  unites_ouverture bigint not null default 0 check (unites_ouverture >= 0),
  unites_cloture_declare bigint check (unites_cloture_declare is null or unites_cloture_declare >= 0),
  stock_initial_non_saisi boolean not null default false,
  primary key (session_id, operateur_code)
);
alter table public.soldes_session_unites
  add column if not exists stock_initial_non_saisi boolean not null default false;

comment on table public.soldes_session_unites is
  'Stock téléphonique par opérateur et session, exprimé en valeur faciale FCFA, distinct du float.';
comment on column public.transactions.mode_paiement_unites is
  'Règlement de l''approvisionnement ou du transfert client : espèces ou wallet.';
comment on column public.transactions.operateur_paiement_code is
  'Wallet débité lors d''un approvisionnement ou crédité lors d''un transfert client; NULL si espèces.';
comment on column public.soldes_session_unites.stock_initial_non_saisi is
  'Signale une session historique sans stock d''ouverture connu; aucun écart d''unités ne doit alors être calculé.';

alter table public.soldes_session_unites enable row level security;
drop policy if exists soldes_unites_lire_son_journal_ou_manager on public.soldes_session_unites;
create policy soldes_unites_lire_son_journal_ou_manager on public.soldes_session_unites
  for select to authenticated using (
    exists (
      select 1
      from public.sessions_caisse s
      where s.id = soldes_session_unites.session_id
        and s.agence_id = public.agence_courante_id()
        and (s.agent_id = (select auth.uid()) or public.peut_gerer_agence(s.agence_id))
    )
  );

revoke all on public.soldes_session_unites from public, anon, authenticated;
grant select on public.soldes_session_unites to authenticated;

-- Toute nouvelle session reçoit ses lignes de stock à zéro avant l'enregistrement
-- atomique des valeurs saisies par son propre utilisateur.
create or replace function public.initialiser_stock_unites_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.soldes_session_unites (session_id, operateur_code, unites_ouverture)
  select new.id, o.code, 0
  from public.operateurs o
  on conflict (session_id, operateur_code) do nothing;
  return new;
end;
$$;

revoke all on function public.initialiser_stock_unites_session() from public, anon, authenticated;
drop trigger if exists sessions_caisse_initialiser_stock_unites on public.sessions_caisse;
create trigger sessions_caisse_initialiser_stock_unites
after insert on public.sessions_caisse
for each row execute function public.initialiser_stock_unites_session();

-- Vérification atomique du stock disponible avant un transfert au client.
-- Le verrou de session sérialise deux ventes simultanées sur la même session.
create or replace function public.valider_mouvement_stock_unites()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions_caisse%rowtype;
  v_ouverture bigint;
  v_stock_disponible bigint;
  v_stock_initial_non_saisi boolean;
begin
  if new.type_operation not in ('approvisionnement_unites', 'transfert_unites') then
    return new;
  end if;

  select * into v_session
  from public.sessions_caisse s
  where s.id = new.session_id
  for update;
  if not found then raise exception 'Session de caisse introuvable.'; end if;
  if v_session.statut <> 'ouverte' then raise exception 'La session de caisse est clôturée.'; end if;
  if v_session.agent_id <> (select auth.uid()) or new.agent_id <> (select auth.uid()) then
    raise exception 'Les mouvements d''unités doivent être saisis dans votre propre session.';
  end if;
  if new.agence_id <> v_session.agence_id or new.point_id <> v_session.point_id then
    raise exception 'La session, le point et l''agence de l''opération ne correspondent pas.';
  end if;

  select su.unites_ouverture, su.stock_initial_non_saisi
  into v_ouverture, v_stock_initial_non_saisi
  from public.soldes_session_unites su
  where su.session_id = new.session_id and su.operateur_code = new.operateur_code;
  if not found or v_stock_initial_non_saisi then
    raise exception 'Le stock initial n''a pas été saisi à l''ouverture. Clôturez cette ancienne session, puis ouvrez-en une nouvelle pour suivre les unités.';
  end if;

  if new.type_operation = 'transfert_unites' then
    select v_ouverture + coalesce(sum(
      case
        when t.type_operation = 'approvisionnement_unites' then t.montant
        when t.type_operation = 'transfert_unites' then -t.montant
        else 0
      end
    ), 0)
    into v_stock_disponible
    from public.transactions t
    where t.session_id = new.session_id
      and t.operateur_code = new.operateur_code
      and t.annulee_le is null
      and t.type_operation in ('approvisionnement_unites', 'transfert_unites');

    if new.montant > v_stock_disponible then
      raise exception 'Stock d''unités insuffisant : disponible % FCFA, demandé % FCFA.', v_stock_disponible, new.montant;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.valider_mouvement_stock_unites() from public, anon, authenticated;
drop trigger if exists transactions_valider_mouvement_stock_unites on public.transactions;
create trigger transactions_valider_mouvement_stock_unites
before insert on public.transactions
for each row execute function public.valider_mouvement_stock_unites();

-- Ajout des champs de règlement à la protection d'immutabilité existante.
create or replace function public.proteger_transaction_annulee()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.annulee_le is not null then
    raise exception 'Une transaction annulée ne peut plus être modifiée.';
  end if;
  if new.id is distinct from old.id
    or new.agence_id is distinct from old.agence_id
    or new.point_id is distinct from old.point_id
    or new.session_id is distinct from old.session_id
    or new.agent_id is distinct from old.agent_id
    or new.operateur_code is distinct from old.operateur_code
    or new.operateur_destination_code is distinct from old.operateur_destination_code
    or new.type_operation is distinct from old.type_operation
    or new.montant is distinct from old.montant
    or new.commission_estimee is distinct from old.commission_estimee
    or new.commission_reelle is distinct from old.commission_reelle
    or new.mode_paiement_unites is distinct from old.mode_paiement_unites
    or new.operateur_paiement_code is distinct from old.operateur_paiement_code
    or new.reference is distinct from old.reference
    or new.note is distinct from old.note then
    raise exception 'Les données d''une transaction sont immuables. Annulez-la avec un motif.';
  end if;
  if new.annulee_le is not null and old.annulee_le is null then
    new.annulee_par := (select auth.uid());
  end if;
  if new.annulee_le is null or new.annulee_par is null or length(btrim(coalesce(new.motif_annulation, ''))) = 0 then
    raise exception 'Un motif est obligatoire pour annuler une transaction.';
  end if;
  return new;
end;
$$;

-- Une annulation d'approvisionnement ne peut pas rendre le stock reconstitué négatif.
create or replace function public.verifier_annulation_approvisionnement_unites()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ouverture bigint;
  v_restant bigint;
begin
  if old.annulee_le is not null
    or new.annulee_le is null
    or old.type_operation <> 'approvisionnement_unites' then
    return new;
  end if;

  perform 1 from public.sessions_caisse s where s.id = old.session_id for update;

  select su.unites_ouverture into v_ouverture
  from public.soldes_session_unites su
  where su.session_id = old.session_id and su.operateur_code = old.operateur_code;
  v_ouverture := coalesce(v_ouverture, 0);

  select v_ouverture + coalesce(sum(
    case
      when t.type_operation = 'approvisionnement_unites' then t.montant
      when t.type_operation = 'transfert_unites' then -t.montant
      else 0
    end
  ), 0)
  into v_restant
  from public.transactions t
  where t.session_id = old.session_id
    and t.operateur_code = old.operateur_code
    and t.id <> old.id
    and t.annulee_le is null
    and t.type_operation in ('approvisionnement_unites', 'transfert_unites');

  if v_restant < 0 then
    raise exception 'Annulation impossible : les unités déjà transférées dépassent le stock restant.';
  end if;
  return new;
end;
$$;

revoke all on function public.verifier_annulation_approvisionnement_unites() from public, anon, authenticated;
drop trigger if exists transactions_annulation_stock_unites on public.transactions;
create trigger transactions_annulation_stock_unites
before update on public.transactions
for each row execute function public.verifier_annulation_approvisionnement_unites();

-- Ouverture/fermeture enrichies : l'utilisateur saisit uniquement son propre stock.
create or replace function public.ouvrir_session_avec_unites(
  p_point_id uuid,
  p_date_caisse date,
  p_caisse_ouverture bigint,
  p_soldes jsonb,
  p_unites jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
  v_operateur record;
  v_stock bigint;
begin
  if auth.uid() is null then raise exception 'Authentification requise.'; end if;
  if p_unites is null or jsonb_typeof(p_unites) <> 'object' then
    raise exception 'Les stocks initiaux par opérateur sont requis.';
  end if;

  for v_operateur in select o.code from public.operateurs o loop
    if not (p_unites ? v_operateur.code) then
      raise exception 'Stock initial manquant pour %.', v_operateur.code;
    end if;
    v_stock := (p_unites ->> v_operateur.code)::bigint;
    if v_stock is null or v_stock < 0 then raise exception 'Stock initial invalide pour %.', v_operateur.code; end if;
  end loop;

  v_session_id := public.ouvrir_session(p_point_id, p_date_caisse, p_caisse_ouverture, p_soldes);
  for v_operateur in select o.code from public.operateurs o loop
    update public.soldes_session_unites
    set unites_ouverture = (p_unites ->> v_operateur.code)::bigint
    where session_id = v_session_id and operateur_code = v_operateur.code;
  end loop;
  return v_session_id;
end;
$$;

create or replace function public.cloturer_session_avec_unites(
  p_session_id uuid,
  p_caisse_declaree bigint,
  p_soldes jsonb,
  p_unites jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions_caisse%rowtype;
  v_operateur record;
  v_stock bigint;
begin
  if auth.uid() is null then raise exception 'Authentification requise.'; end if;
  if p_unites is null or jsonb_typeof(p_unites) <> 'object' then
    raise exception 'Les stocks de clôture par opérateur sont requis.';
  end if;

  select * into v_session from public.sessions_caisse s where s.id = p_session_id for update;
  if not found then raise exception 'Session introuvable.'; end if;
  if v_session.agent_id <> (select auth.uid()) then
    raise exception 'Vous ne pouvez clôturer et compter que votre propre session.';
  end if;
  if v_session.statut <> 'ouverte' then raise exception 'Cette session est déjà clôturée.'; end if;

  for v_operateur in select o.code from public.operateurs o loop
    if not (p_unites ? v_operateur.code) then
      raise exception 'Stock déclaré manquant pour %.', v_operateur.code;
    end if;
    v_stock := (p_unites ->> v_operateur.code)::bigint;
    if v_stock is null or v_stock < 0 then raise exception 'Stock déclaré invalide pour %.', v_operateur.code; end if;
  end loop;

  perform public.cloturer_session(p_session_id, p_caisse_declaree, p_soldes);

  for v_operateur in select o.code from public.operateurs o loop
    insert into public.soldes_session_unites (session_id, operateur_code, unites_ouverture, unites_cloture_declare, stock_initial_non_saisi)
    values (p_session_id, v_operateur.code, (p_unites ->> v_operateur.code)::bigint, (p_unites ->> v_operateur.code)::bigint, true)
    on conflict (session_id, operateur_code) do update
      set unites_cloture_declare = excluded.unites_cloture_declare;
  end loop;
end;
$$;

-- Les anciennes RPC ne doivent pas permettre de contourner la saisie du stock.
-- Les nouvelles fonctions SECURITY DEFINER les appellent en interne.
revoke all on function public.ouvrir_session(uuid, date, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.cloturer_session(uuid, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.ouvrir_session_avec_unites(uuid, date, bigint, jsonb, jsonb) from public, anon;
revoke all on function public.cloturer_session_avec_unites(uuid, bigint, jsonb, jsonb) from public, anon;
grant execute on function public.ouvrir_session_avec_unites(uuid, date, bigint, jsonb, jsonb) to authenticated;
grant execute on function public.cloturer_session_avec_unites(uuid, bigint, jsonb, jsonb) to authenticated;

commit;
