-- =============================================================================
-- KAISSE — RETOUR ARRIÈRE de la migration 005 (à n'utiliser qu'en dernier recours)
--
-- ⚠️  Ce script SUPPRIME des objets. Il refuse de s'exécuter si les tables
--     créées par la 005 contiennent la moindre ligne : vos saisies réelles
--     (crédits clients, mouvements de caisse, encaissements, relevés, barèmes,
--     messages, audit) ne peuvent pas être détruites par accident.
--
-- Quand l'utiliser ?
--   1. Vous avez lancé la 005 et l'application plante à cause d'elle.
--   2. Vous avez vidé volontairement les nouvelles tables (ou vous n'y avez
--      encore rien saisi) et vous voulez revenir à l'état 004.
--
-- Comment ?
--   SQL Editor → coller ce fichier → Run.
--   Si le message « Retour arrière refusé » apparaît, c'est volontaire :
--   videz d'abord les nouvelles tables *après avoir exporté* leur contenu.
--
-- Remarque : la 005 s'exécute dans une seule transaction. Si elle échoue en
-- cours de route, PostgreSQL annule TOUT automatiquement : dans ce cas, ce
-- script est inutile.
-- =============================================================================

begin;

do $$
declare
  v_lignes bigint;
  v_detail text := '';
begin
  select coalesce(sum(n), 0), string_agg(format('%s=%s', t, n), ', ')
  into v_lignes, v_detail
  from (
    select 'mouvements_caisse' as t, count(*) as n from public.mouvements_caisse
    union all select 'mouvements_credits_client', count(*) from public.mouvements_credits_client
    union all select 'encaissements_marchand', count(*) from public.encaissements_marchand
    union all select 'releves_commissions', count(*) from public.releves_commissions
    union all select 'baremes_unites', count(*) from public.baremes_unites
    union all select 'messages_envoyes', count(*) from public.messages_envoyes
    union all select 'journal_audit', count(*) from public.journal_audit
    union all select 'transactions_ajustement', count(*) from public.transactions where type_operation = 'ajustement_unites'
  ) compteurs
  where n > 0;

  if v_lignes > 0 then
    raise exception 'Retour arrière refusé : % ligne(s) de données réelles seraient détruites (%). Exportez puis videz ces tables avant de relancer.', v_lignes, v_detail;
  end if;
end
$$;

-- 1. Vue de rapprochement
drop view if exists public.v_rapprochement_commissions;

-- 2. Nouvelles tables (les politiques RLS et index partent avec elles)
drop table if exists public.messages_envoyes;
drop table if exists public.journal_audit;
drop table if exists public.baremes_unites;
drop table if exists public.releves_commissions;
drop table if exists public.encaissements_marchand;
drop table if exists public.mouvements_credits_client;
drop table if exists public.mouvements_caisse;

-- 3. Colonnes ajoutées à transactions
drop index if exists public.transactions_ajustements_idx;
alter table public.transactions
  drop constraint if exists transactions_ajustement_check,
  drop constraint if exists transactions_montant_reglement_scope_check,
  drop constraint if exists transactions_montant_reglement_check,
  drop column if exists montant_reglement,
  drop column if exists ajustement_sens;

-- 4. Liste des types d'opération revenue à l'état de la migration 003
alter table public.transactions
  drop constraint if exists transactions_type_operation_check;
alter table public.transactions
  add constraint transactions_type_operation_check
  check (type_operation in (
    'depot', 'retrait', 'transfert', 'achat_credit',
    'approvisionnement_unites', 'transfert_unites'
  ));

-- 5. Fonctions remises dans leur version 003 / 004
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

notify pgrst, 'reload schema';

commit;

-- Résultat attendu : « Success. No rows returned ».
-- Vérifiez ensuite avec 005_avant.sql : la requête 2 doit afficher
-- « absente » partout.
