-- KAISSE v2.0 — modules concurrentiels : crédit client, mouvements de caisse,
-- encaissements marchands, relevés de commissions, barèmes de vente d'unités,
-- ajustements de stock, messages préparés et journal d'audit.
--
-- Pré-requis : 001 → 002 → 003 → 004.
-- Migration strictement additive : aucune ligne existante n'est supprimée,
-- mise à jour ou backfillée. 100 % idempotente (CREATE ... IF NOT EXISTS).

begin;

-- ---------------------------------------------------------------------------
-- 1. Réglage de montants réglés et ajustements de stock
-- ---------------------------------------------------------------------------

alter table public.transactions
  add column if not exists montant_reglement bigint;

alter table public.transactions
  add column if not exists ajustement_sens text;

alter table public.transactions
  drop constraint if exists transactions_montant_reglement_check;
alter table public.transactions
  add constraint transactions_montant_reglement_check
  check (montant_reglement is null or montant_reglement >= 0) not valid;

-- Nouveau type d'opération : ajustement de stock (entrée ou sortie manuelle).
alter table public.transactions
  drop constraint if exists transactions_type_operation_check;
alter table public.transactions
  add constraint transactions_type_operation_check
  check (type_operation in (
    'depot', 'retrait', 'transfert', 'achat_credit',
    'approvisionnement_unites', 'transfert_unites', 'ajustement_unites'
  ));

alter table public.transactions
  drop constraint if exists transactions_ajustement_check;
alter table public.transactions
  add constraint transactions_ajustement_check
  check (
    (
      type_operation = 'ajustement_unites'
      and ajustement_sens in ('entree', 'sortie')
      and length(btrim(coalesce(note, ''))) >= 3
      and mode_paiement_unites is null
      and operateur_paiement_code is null
      and montant_reglement is null
      and commission_estimee = 0
      and coalesce(commission_reelle, 0) = 0
    )
    or (type_operation <> 'ajustement_unites' and ajustement_sens is null)
  );

-- Le règlement réel n'a de sens que sur les mouvements d'unités et les flux d'argent.
alter table public.transactions
  drop constraint if exists transactions_montant_reglement_scope_check;
alter table public.transactions
  add constraint transactions_montant_reglement_scope_check
  check (montant_reglement is null or type_operation in (
    'depot', 'retrait', 'transfert', 'achat_credit', 'approvisionnement_unites', 'transfert_unites'
  )) not valid;

create index if not exists transactions_ajustements_idx
  on public.transactions (session_id, operateur_code, created_at desc)
  where type_operation = 'ajustement_unites';

-- Le trigger 003 doit accepter les ajustements sans contrôle de règlement.
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
  if new.type_operation not in ('approvisionnement_unites', 'transfert_unites', 'ajustement_unites') then
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

  if new.type_operation = 'transfert_unites'
    or (new.type_operation = 'ajustement_unites' and new.ajustement_sens = 'sortie') then
    select v_ouverture + coalesce(sum(
      case
        when t.type_operation = 'approvisionnement_unites' then t.montant
        when t.type_operation = 'transfert_unites' then -t.montant
        when t.type_operation = 'ajustement_unites' and t.ajustement_sens = 'entree' then t.montant
        when t.type_operation = 'ajustement_unites' and t.ajustement_sens = 'sortie' then -t.montant
        else 0
      end
    ), 0)
    into v_stock_disponible
    from public.transactions t
    where t.session_id = new.session_id
      and t.operateur_code = new.operateur_code
      and t.annulee_le is null
      and t.type_operation in ('approvisionnement_unites', 'transfert_unites', 'ajustement_unites');

    if new.montant > v_stock_disponible then
      raise exception 'Stock d''unités insuffisant : disponible % FCFA, demandé % FCFA.', v_stock_disponible, new.montant;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.valider_mouvement_stock_unites() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Carnet de crédit client
-- ---------------------------------------------------------------------------

create table if not exists public.mouvements_credits_client (
  id uuid primary key default gen_random_uuid(),
  agence_id uuid not null references public.agences(id) on delete cascade,
  point_id uuid references public.points(id) on delete set null,
  agent_id uuid references public.profils(id) on delete set null,
  client_nom text not null check (length(btrim(client_nom)) between 2 and 60),
  client_telephone text,
  sens text not null check (sens in ('credit', 'remboursement')),
  source text check (source is null or source in ('unites', 'float', 'marchandise', 'autre')),
  montant bigint not null check (montant > 0),
  echeance date,
  note text,
  created_at timestamptz not null default now()
);

comment on table public.mouvements_credits_client is
  'Carnet de crédit du comptoir : avances accordées (sens = credit) et remboursements (sens = remboursement).';
comment on column public.mouvements_credits_client.client_telephone is
  'Numéro volontairement masqué par l''application (ex. « 07 ** ** 12 »).';

create index if not exists mouvements_credits_client_agence_idx
  on public.mouvements_credits_client (agence_id, created_at desc);

alter table public.mouvements_credits_client enable row level security;

drop policy if exists credits_lire_agence on public.mouvements_credits_client;
create policy credits_lire_agence on public.mouvements_credits_client
  for select to authenticated using (agence_id = public.agence_courante_id());

drop policy if exists credits_ecrire_son_agence on public.mouvements_credits_client;
create policy credits_ecrire_son_agence on public.mouvements_credits_client
  for insert to authenticated with check (
    agence_id = public.agence_courante_id()
    and agent_id = (select auth.uid())
    and public.agence_peut_ecrire(agence_id)
  );

revoke update, delete on public.mouvements_credits_client from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Mouvements de caisse (banque, coffre, fonds de caisse)
-- ---------------------------------------------------------------------------

create table if not exists public.mouvements_caisse (
  id uuid primary key default gen_random_uuid(),
  agence_id uuid not null references public.agences(id) on delete cascade,
  point_id uuid not null references public.points(id) on delete cascade,
  session_id uuid not null references public.sessions_caisse(id) on delete cascade,
  agent_id uuid not null references public.profils(id) on delete restrict,
  sens text not null check (sens in ('entree', 'sortie')),
  source text not null check (source in ('banque', 'coffre', 'fond_caisse', 'super_agent', 'autre')),
  montant bigint not null check (montant > 0),
  motif text not null check (length(btrim(motif)) >= 3),
  created_at timestamptz not null default now()
);

comment on table public.mouvements_caisse is
  'Entrées et sorties d''espèces hors opérations client : dépôt en banque, coffre, renfort de fonds de caisse.';

create index if not exists mouvements_caisse_session_idx
  on public.mouvements_caisse (session_id, created_at desc);

alter table public.mouvements_caisse enable row level security;

drop policy if exists caisse_lire_son_journal_ou_manager on public.mouvements_caisse;
create policy caisse_lire_son_journal_ou_manager on public.mouvements_caisse
  for select to authenticated using (
    agence_id = public.agence_courante_id()
    and (agent_id = (select auth.uid()) or public.peut_gerer_agence(agence_id))
  );

drop policy if exists caisse_ecrire_sa_session on public.mouvements_caisse;
create policy caisse_ecrire_sa_session on public.mouvements_caisse
  for insert to authenticated with check (
    agence_id = public.agence_courante_id()
    and agent_id = (select auth.uid())
    and public.agence_peut_ecrire(agence_id)
    and exists (
      select 1 from public.sessions_caisse s
      where s.id = session_id
        and s.agence_id = agence_id
        and s.point_id = point_id
        and s.agent_id = (select auth.uid())
        and s.statut = 'ouverte'
    )
  );

revoke update, delete on public.mouvements_caisse from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Encaissements marchands (QR code, lien de paiement)
-- ---------------------------------------------------------------------------

create table if not exists public.encaissements_marchand (
  id uuid primary key default gen_random_uuid(),
  agence_id uuid not null references public.agences(id) on delete cascade,
  point_id uuid references public.points(id) on delete set null,
  agent_id uuid references public.profils(id) on delete set null,
  operateur_code text not null references public.operateurs(code) on delete restrict,
  mode text not null default 'qrcode' check (mode in ('qrcode', 'lien', 'especes')),
  montant bigint not null check (montant > 0),
  commission bigint not null default 0 check (commission >= 0),
  reference text,
  note text,
  created_at timestamptz not null default now()
);

comment on table public.encaissements_marchand is
  'Paiements reçus au comptoir par QR code ou lien (service, crédit prépayé). Kaisse en garde la trace, le paiement reste encaissé chez l''opérateur.';

create index if not exists encaissements_marchand_agence_idx
  on public.encaissements_marchand (agence_id, created_at desc);

alter table public.encaissements_marchand enable row level security;

drop policy if exists encaissements_lire_agence on public.encaissements_marchand;
create policy encaissements_lire_agence on public.encaissements_marchand
  for select to authenticated using (agence_id = public.agence_courante_id());

drop policy if exists encaissements_ecrire_son_agence on public.encaissements_marchand;
create policy encaissements_ecrire_son_agence on public.encaissements_marchand
  for insert to authenticated with check (
    agence_id = public.agence_courante_id()
    and agent_id = (select auth.uid())
    and public.agence_peut_ecrire(agence_id)
  );

revoke update, delete on public.encaissements_marchand from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Relevés de commissions opérateur
-- ---------------------------------------------------------------------------

create table if not exists public.releves_commissions (
  id uuid primary key default gen_random_uuid(),
  agence_id uuid not null references public.agences(id) on delete cascade,
  operateur_code text not null references public.operateurs(code) on delete restrict,
  periode_debut date not null,
  periode_fin date not null,
  montant_recu bigint not null default 0 check (montant_recu >= 0),
  reference text,
  source text,
  created_at timestamptz not null default now(),
  check (periode_fin >= periode_debut)
);

comment on table public.releves_commissions is
  'Commissions réellement versées par un opérateur sur une période, saisies depuis un SMS ou un relevé.';

create index if not exists releves_commissions_agence_idx
  on public.releves_commissions (agence_id, periode_fin desc);

alter table public.releves_commissions enable row level security;

drop policy if exists releves_lire_agence on public.releves_commissions;
create policy releves_lire_agence on public.releves_commissions
  for select to authenticated using (agence_id = public.agence_courante_id());

drop policy if exists releves_ecrire_gerance on public.releves_commissions;
create policy releves_ecrire_gerance on public.releves_commissions
  for insert to authenticated with check (
    agence_id = public.agence_courante_id()
    and public.peut_gerer_agence(agence_id)
    and public.agence_peut_ecrire(agence_id)
  );

revoke update, delete on public.releves_commissions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Barèmes de vente d'unités (marge)
-- ---------------------------------------------------------------------------

create table if not exists public.baremes_unites (
  id uuid primary key default gen_random_uuid(),
  agence_id uuid not null references public.agences(id) on delete cascade,
  operateur_code text not null references public.operateurs(code) on delete restrict,
  prix_valeur_faciale bigint not null check (prix_valeur_faciale > 0),
  prix_vente bigint not null check (prix_vente > 0),
  source text,
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.baremes_unites is
  'Prix d''achat et de vente pour une valeur faciale de référence (ex. 100 F de crédit vendus 105 F). Sert au calcul de la marge.';

create index if not exists baremes_unites_agence_idx
  on public.baremes_unites (agence_id, operateur_code);

alter table public.baremes_unites enable row level security;

drop policy if exists baremes_unites_lire_agence on public.baremes_unites;
create policy baremes_unites_lire_agence on public.baremes_unites
  for select to authenticated using (agence_id = public.agence_courante_id());

drop policy if exists baremes_unites_ecrire_gerance on public.baremes_unites;
create policy baremes_unites_ecrire_gerance on public.baremes_unites
  for insert to authenticated with check (
    agence_id = public.agence_courante_id()
    and public.peut_gerer_agence(agence_id)
    and public.agence_peut_ecrire(agence_id)
  );

drop policy if exists baremes_unites_maj_gerance on public.baremes_unites;
create policy baremes_unites_maj_gerance on public.baremes_unites
  for update to authenticated using (agence_id = public.agence_courante_id() and public.peut_gerer_agence(agence_id))
  with check (agence_id = public.agence_courante_id());

-- ---------------------------------------------------------------------------
-- 7. Messages préparés (WhatsApp / SMS) et journal d'audit
-- ---------------------------------------------------------------------------

create table if not exists public.messages_envoyes (
  id uuid primary key default gen_random_uuid(),
  agence_id uuid not null references public.agences(id) on delete cascade,
  agent_id uuid references public.profils(id) on delete set null,
  canal text not null default 'whatsapp' check (canal in ('whatsapp', 'sms', 'copie')),
  destinataire text,
  contenu text not null check (length(btrim(contenu)) > 0),
  statut text not null default 'prepare' check (statut in ('prepare', 'partage')),
  created_at timestamptz not null default now()
);

comment on table public.messages_envoyes is
  'Trace des récapitulatifs et reçus préparés dans Kaisse. Aucun envoi automatique : l''utilisateur partage le texte lui-même.';

alter table public.messages_envoyes enable row level security;

drop policy if exists messages_lire_agence on public.messages_envoyes;
create policy messages_lire_agence on public.messages_envoyes
  for select to authenticated using (agence_id = public.agence_courante_id());

drop policy if exists messages_ecrire_son_agence on public.messages_envoyes;
create policy messages_ecrire_son_agence on public.messages_envoyes
  for insert to authenticated with check (
    agence_id = public.agence_courante_id() and agent_id = (select auth.uid())
  );

create table if not exists public.journal_audit (
  id uuid primary key default gen_random_uuid(),
  agence_id uuid not null references public.agences(id) on delete cascade,
  acteur_id uuid references public.profils(id) on delete set null,
  action text not null,
  entite text,
  entite_id text,
  detail text,
  created_at timestamptz not null default now()
);

comment on table public.journal_audit is
  'Journal d''audit en lecture seule : ouvertures, clôtures, annulations, ajustements, relevés et mouvements de caisse.';

create index if not exists journal_audit_agence_idx
  on public.journal_audit (agence_id, created_at desc);

alter table public.journal_audit enable row level security;

drop policy if exists audit_lire_gerance on public.journal_audit;
create policy audit_lire_gerance on public.journal_audit
  for select to authenticated using (
    agence_id = public.agence_courante_id() and public.peut_gerer_agence(agence_id)
  );

drop policy if exists audit_ecrire_son_agence on public.journal_audit;
create policy audit_ecrire_son_agence on public.journal_audit
  for insert to authenticated with check (
    agence_id = public.agence_courante_id() and acteur_id = (select auth.uid())
  );

revoke update, delete on public.journal_audit from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Vue de rapprochement des commissions par opérateur et par période
-- ---------------------------------------------------------------------------

create or replace view public.v_rapprochement_commissions
with (security_invoker = true) as
select
  t.agence_id,
  t.operateur_code,
  date_trunc('month', t.created_at)::date as mois,
  count(*) as operations,
  sum(coalesce(t.commission_estimee, 0)) as commission_attendue,
  sum(coalesce(t.commission_reelle, 0)) as commission_constatee,
  coalesce((
    select sum(r.montant_recu)
    from public.releves_commissions r
    where r.agence_id = t.agence_id
      and r.operateur_code = t.operateur_code
      and r.periode_debut >= date_trunc('month', t.created_at)::date
      and r.periode_fin <= (date_trunc('month', t.created_at) + interval '1 month - 1 day')::date
  ), 0) as commission_recue
from public.transactions t
where t.annulee_le is null
  and t.type_operation not in ('approvisionnement_unites', 'ajustement_unites')
group by t.agence_id, t.operateur_code, date_trunc('month', t.created_at)::date;

comment on view public.v_rapprochement_commissions is
  'Commission attendue (barèmes) / constatée (saisie) / reçue (relevés) par opérateur et par mois.';

revoke all on public.v_rapprochement_commissions from public, anon;
grant select on public.v_rapprochement_commissions to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Fonction de lecture du stock : ajustements inclus
-- ---------------------------------------------------------------------------

create or replace function public.stock_unites_session(p_session_id uuid)
returns table (operateur_code text, stock_disponible bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    su.operateur_code,
    case
      when su.stock_initial_non_saisi then null::bigint
      else su.unites_ouverture + coalesce((
        select sum(
          case
            when t.type_operation = 'approvisionnement_unites' then t.montant
            when t.type_operation = 'transfert_unites' then -t.montant
            when t.type_operation = 'ajustement_unites' and t.ajustement_sens = 'entree' then t.montant
            when t.type_operation = 'ajustement_unites' then -t.montant
            else 0
          end
        )
        from public.transactions t
        where t.session_id = su.session_id
          and t.operateur_code = su.operateur_code
          and t.annulee_le is null
          and t.type_operation in ('approvisionnement_unites', 'transfert_unites', 'ajustement_unites')
      ), 0)
    end
  from public.soldes_session_unites su
  where su.session_id = p_session_id;
$$;

revoke all on function public.stock_unites_session(uuid) from public, anon;
grant execute on function public.stock_unites_session(uuid) to authenticated;

commit;
