-- =============================================================================
-- KAISSE — état du schéma en une requête (lecture seule)
--
-- Usage : Supabase → SQL Editor → coller → Run → copier le résultat et le
-- coller dans la conversation.
--
-- REQUÊTE 1 (ci-dessous) : interrogation du catalogue PostgreSQL uniquement.
--   Elle fonctionne même si la base est totalement vide, ne verrouille rien et
--   ne lit aucune de vos lignes. Elle dit quelles migrations sont appliquées.
--
-- REQUÊTE 2 (à la fin du fichier) : comptages exacts. À exécuter seulement si
--   la requête 1 indique que le schéma Kaisse existe. Elle échoue volontairement
--   sur une base vide (« relation public.agences does not exist »), ce qui est
--   en soi une information.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- REQUÊTE 1 — état des migrations (toujours exécutable)
-- -----------------------------------------------------------------------------
with objets as (
  select
    to_regclass('public.agences')                     is not null as t_agences,
    to_regclass('public.profils')                     is not null as t_profils,
    to_regclass('public.points')                      is not null as t_points,
    to_regclass('public.operateurs')                  is not null as t_operateurs,
    to_regclass('public.sessions_caisse')             is not null as t_sessions,
    to_regclass('public.soldes_session_operateur')    is not null as t_soldes_float,
    to_regclass('public.soldes_session_unites')       is not null as t_soldes_unites,
    to_regclass('public.transactions')                is not null as t_transactions,
    to_regclass('public.depenses')                    is not null as t_depenses,
    to_regclass('public.commission_baremes')          is not null as t_baremes_commission,
    to_regclass('public.mouvements_caisse')           is not null as t_mouvements_caisse,
    to_regclass('public.mouvements_credits_client')   is not null as t_credits_client,
    to_regclass('public.encaissements_marchand')      is not null as t_encaissements,
    to_regclass('public.releves_commissions')         is not null as t_releves,
    to_regclass('public.baremes_unites')              is not null as t_baremes_unites,
    to_regclass('public.messages_envoyes')            is not null as t_messages,
    to_regclass('public.journal_audit')               is not null as t_audit,
    to_regclass('public.v_rapprochement_commissions') is not null as v_rapprochement
),
colonnes as (
  select
    exists (select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'points'
              and column_name = 'seuil_alerte_unites')            as c_seuil_unites,
    exists (select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'agences'
              and column_name = 'statut_abonnement')              as c_abonnement,
    exists (select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'transactions'
              and column_name = 'beneficiaire_masque')            as c_beneficiaire,
    exists (select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'transactions'
              and column_name = 'mode_paiement_unites')           as c_mode_paiement,
    exists (select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'transactions'
              and column_name = 'montant_reglement')              as c_montant_regle,
    exists (select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'transactions'
              and column_name = 'ajustement_sens')                as c_ajustement_sens
),
fonctions as (
  select
    to_regprocedure('public.agence_courante_id()')       is not null as f_agence_courante,
    to_regprocedure('public.peut_gerer_agence(uuid)')    is not null as f_peut_gerer,
    to_regprocedure('public.agence_peut_ecrire(uuid)')   is not null as f_peut_ecrire,
    to_regprocedure('public.stock_unites_session(uuid)') is not null as f_stock_unites,
    to_regprocedure('public.ouvrir_session(uuid,date,bigint,jsonb)') is not null as f_ouvrir_session
),
estimations as (
  select coalesce(jsonb_object_agg(relname, n_live_tup), '{}'::jsonb) as lignes_estimees
  from pg_stat_user_tables
  where schemaname = 'public'
    and relname in ('agences', 'profils', 'points', 'sessions_caisse', 'transactions',
                    'depenses', 'mouvements_caisse', 'mouvements_credits_client',
                    'encaissements_marchand', 'releves_commissions', 'baremes_unites',
                    'messages_envoyes', 'journal_audit')
)
select jsonb_pretty(jsonb_build_object(
  'base', current_database(),
  'role', current_user,
  'version_postgres', split_part(version(), ' on ', 1),
  'migrations', jsonb_build_object(
    '001_schema_initial',         (select t_agences and t_profils and t_points and t_transactions from objets),
    '002_essai_14_jours',         (select c_abonnement from colonnes),
    '003_stock_unites',           (select t_soldes_unites and c_mode_paiement from objets, colonnes),
    '004_transferts_unites',      (select c_seuil_unites and c_beneficiaire from colonnes),
    '005_modules_concurrentiels', (select t_mouvements_caisse and c_montant_regle and t_audit from objets, colonnes)
  ),
  'verdict', case
    when not (select t_agences from objets)
      then 'Schéma absent : appliquez 001 → 005 dans l''ordre.'
    when not (select c_abonnement from colonnes)
      then 'Migration 002 manquante : appliquez-la avant la 005.'
    when not (select t_soldes_unites and c_mode_paiement from objets, colonnes)
      then 'Migration 003 manquante : appliquez-la avant la 005.'
    when not (select c_seuil_unites and c_beneficiaire from colonnes)
      then 'Migration 004 manquante : appliquez-la avant la 005.'
    when (select t_mouvements_caisse and c_montant_regle from objets, colonnes)
      then 'Migration 005 déjà appliquée : rien à faire.'
    else 'Prêt pour la migration 005.'
  end,
  'objets', (select to_jsonb(objets) from objets),
  'colonnes', (select to_jsonb(colonnes) from colonnes),
  'fonctions', (select to_jsonb(fonctions) from fonctions),
  'lignes_estimees', (select lignes_estimees from estimations)
)) as etat_schema;

-- -----------------------------------------------------------------------------
-- REQUÊTE 2 — comptages exacts et types d'opération (schéma existant requis)
--
-- À exécuter APRÈS la requête 1, uniquement si le verdict n'est pas
-- « Schéma absent ». Sur une base vide, elle renvoie une erreur de relation
-- inexistante : c'est normal, pas un incident.
-- -----------------------------------------------------------------------------
/*
select jsonb_pretty(jsonb_build_object(
  'agences',        (select count(*) from public.agences),
  'profils',        (select count(*) from public.profils),
  'points',         (select count(*) from public.points),
  'sessions',       (select count(*) from public.sessions_caisse),
  'transactions',   (select count(*) from public.transactions),
  'depenses',       (select count(*) from public.depenses),
  'derniere_transaction', (select max(created_at) from public.transactions),
  'types_operation', coalesce((
    select jsonb_object_agg(type_operation, n)
    from (select type_operation, count(*) as n from public.transactions group by type_operation) q
  ), '{}'::jsonb),
  'type_operation_inconnus', coalesce((
    select jsonb_agg(distinct type_operation)
    from public.transactions
    where type_operation not in ('depot', 'retrait', 'transfert', 'achat_credit',
                                 'approvisionnement_unites', 'transfert_unites', 'ajustement_unites')
  ), '[]'::jsonb)
)) as comptages;
*/
