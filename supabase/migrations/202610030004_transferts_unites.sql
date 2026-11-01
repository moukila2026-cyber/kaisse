-- KAISSE PRO v1.3 — module « Unités & transferts ».
-- Pré-requis : 202610030001_kaisse_pro_v1.sql, 202610030002_essai_14_jours.sql, 202610030003_stock_unites.sql.
-- Migration additive : aucune ligne historique n'est supprimée, réécrite ni backfillée.
--
-- Apports :
--   1. seuil d'alerte de stock d'unités par point de vente ;
--   2. bénéficiaire masqué sur un transfert d'unités (jamais de numéro complet) ;
--   3. index de lecture pour le journal des mouvements d'unités ;
--   4. fonction de lecture du stock disponible par session et par opérateur ;
--   5. durcissement : un transfert d'unités exige un règlement, une valeur > 0
--      et un stock suffisant (contrôle déjà présent en 003, conservé et complété).

begin;

-- 1. Seuil d'alerte du stock téléphonique, saisi par l'agence au niveau du point.
alter table public.points
  add column if not exists seuil_alerte_unites bigint;

alter table public.points
  drop constraint if exists points_seuil_alerte_unites_check;
alter table public.points
  add constraint points_seuil_alerte_unites_check
  check (seuil_alerte_unites is null or seuil_alerte_unites >= 0);

comment on column public.points.seuil_alerte_unites is
  'Valeur faciale FCFA sous laquelle le stock d''unités du point est signalé « stock bas ». NULL = alerte désactivée.';

-- 2. Bénéficiaire masqué : seuls 2 chiffres au début et 2 à la fin sont conservés.
alter table public.transactions
  add column if not exists beneficiaire_masque text;

alter table public.transactions
  drop constraint if exists transactions_beneficiaire_masque_check;
alter table public.transactions
  add constraint transactions_beneficiaire_masque_check
  check (
    beneficiaire_masque is null
    or (
      length(btrim(beneficiaire_masque)) between 4 and 20
      and position('**' in beneficiaire_masque) > 0
      and regexp_replace(beneficiaire_masque, '[^0-9]', '', 'g') ~ '^[0-9]{0,4}$'
    )
  );

comment on column public.transactions.beneficiaire_masque is
  'Numéro de bénéficiaire volontairement masqué (ex. « 07 ** ** 56 »). Un numéro complet est refusé.';

-- Le champ n'est autorisé que sur un transfert d'unités au client.
alter table public.transactions
  drop constraint if exists transactions_beneficiaire_type_check;
alter table public.transactions
  add constraint transactions_beneficiaire_type_check
  check (beneficiaire_masque is null or type_operation = 'transfert_unites');

-- 3. Index de lecture du journal unités (filtre par session, opérateur, type).
create index if not exists transactions_mouvements_unites_idx
  on public.transactions (session_id, operateur_code, created_at desc)
  where type_operation in ('approvisionnement_unites', 'transfert_unites');

create index if not exists transactions_benefficiaire_masque_idx
  on public.transactions (agence_id, beneficiaire_masque)
  where beneficiaire_masque is not null;

-- 4. Stock disponible par opérateur pour une session donnée, en lecture seule.
--    Sert au contrôle du client et au rapprochement ; la vérité reste le trigger 003.
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
            else 0
          end
        )
        from public.transactions t
        where t.session_id = su.session_id
          and t.operateur_code = su.operateur_code
          and t.annulee_le is null
          and t.type_operation in ('approvisionnement_unites', 'transfert_unites')
      ), 0)
    end
  from public.soldes_session_unites su
  where su.session_id = p_session_id;
$$;

comment on function public.stock_unites_session(uuid) is
  'Stock d''unités théorique par opérateur pour une session : ouverture + approvisionnements − transferts clients. NULL si le stock initial n''était pas suivi.';

revoke all on function public.stock_unites_session(uuid) from public, anon;
grant execute on function public.stock_unites_session(uuid) to authenticated;

-- 5. Un transfert d'unités doit porter une valeur strictement positive et un
--    règlement cohérent ; un approvisionnement ne peut pas produire de commission.
-- « not valid » : les lignes historiques ne sont pas revérifiées, les nouvelles le sont.
alter table public.transactions
  drop constraint if exists transactions_montant_positif_check;
alter table public.transactions
  add constraint transactions_montant_positif_check check (montant > 0) not valid;

-- 6. Immutabilité : le bénéficiaire masqué rejoint les champs protégés.
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
    or new.beneficiaire_masque is distinct from old.beneficiaire_masque
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

comment on table public.soldes_session_unites is
  'Stock téléphonique par opérateur et session, exprimé en valeur faciale FCFA, distinct du float. Source du module « Unités & transferts ».';

-- 7. Seul un propriétaire ou gérant de l'agence peut modifier le seuil d'unités.
create or replace function public.controler_seuil_unites_point()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.seuil_alerte_unites is distinct from old.seuil_alerte_unites
    and not public.peut_gerer_agence(new.agence_id) then
    raise exception 'Seul un propriétaire ou un gérant peut modifier le seuil d''alerte des unités.';
  end if;
  return new;
end;
$$;

revoke all on function public.controler_seuil_unites_point() from public, anon, authenticated;
drop trigger if exists points_controler_seuil_unites on public.points;
create trigger points_controler_seuil_unites
before update on public.points
for each row execute function public.controler_seuil_unites_point();

commit;
