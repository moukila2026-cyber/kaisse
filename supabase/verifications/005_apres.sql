-- =============================================================================
-- KAISSE — CONTRÔLES APRÈS la migration 005 (modules concurrentiels)
--
-- Ce fichier est en LECTURE SEULE : il ne modifie rien.
-- À exécuter juste après le succès de 202611010005_modules_concurrentiels.sql.
-- Toutes les lignes de la requête 1 doivent être « OK ».
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Objets créés par la 005
-- -----------------------------------------------------------------------------
with controles (objet, present) as (
  select 'table mouvements_caisse',                    to_regclass('public.mouvements_caisse') is not null
  union all select 'table mouvements_credits_client',  to_regclass('public.mouvements_credits_client') is not null
  union all select 'table encaissements_marchand',     to_regclass('public.encaissements_marchand') is not null
  union all select 'table releves_commissions',        to_regclass('public.releves_commissions') is not null
  union all select 'table baremes_unites',             to_regclass('public.baremes_unites') is not null
  union all select 'table messages_envoyes',           to_regclass('public.messages_envoyes') is not null
  union all select 'table journal_audit',              to_regclass('public.journal_audit') is not null
  union all select 'vue v_rapprochement_commissions',  to_regclass('public.v_rapprochement_commissions') is not null

  union all select 'colonne transactions.montant_reglement', exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'transactions' and column_name = 'montant_reglement')
  union all select 'colonne transactions.ajustement_sens', exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'transactions' and column_name = 'ajustement_sens')

  union all select 'index transactions_ajustements_idx', exists (
    select 1 from pg_indexes where schemaname = 'public' and indexname = 'transactions_ajustements_idx')

  union all select 'fonction stock_unites_session(uuid) à jour', exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'stock_unites_session'
      and pg_get_functiondef(p.oid) like '%ajustement_unites%')
  union all select 'trigger stock inclut les ajustements', exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'valider_mouvement_stock_unites'
      and pg_get_functiondef(p.oid) like '%ajustement_unites%')
)
select objet, case when present then 'OK' else 'À VÉRIFIER' end as etat
from controles
order by (not present) desc, objet;

-- -----------------------------------------------------------------------------
-- 2. Contraintes de la table transactions (la liste doit contenir les 4 noms)
-- -----------------------------------------------------------------------------
select
  con.conname as contrainte,
  case con.contype
    when 'c' then 'CHECK'
    when 'f' then 'FOREIGN KEY'
    when 'p' then 'PRIMARY KEY'
    when 'u' then 'UNIQUE'
    else con.contype::text
  end as type,
  con.convalidated as validee_sur_historique,
  pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace nsp on nsp.oid = rel.relnamespace
where nsp.nspname = 'public'
  and rel.relname = 'transactions'
  and con.conname in (
    'transactions_type_operation_check',
    'transactions_ajustement_check',
    'transactions_montant_reglement_check',
    'transactions_montant_reglement_scope_check'
  )
order by con.conname;

-- Lecture attendue :
--   * transactions_type_operation_check      → liste incluant 'ajustement_unites'
--   * transactions_ajustement_check          → motif obligatoire, aucun règlement
--   * transactions_montant_reglement_check   → montant_reglement >= 0
--   * transactions_montant_reglement_scope_check → validee_sur_historique = false
--
-- « validee_sur_historique = false » est NORMAL et volontaire : les lignes
-- historiques ne sont pas revérifiées, mais toute nouvelle ligne l'est.

-- -----------------------------------------------------------------------------
-- 3. Sécurité : RLS activée et politiques présentes sur chaque nouvelle table
-- -----------------------------------------------------------------------------
select
  c.relname as table_,
  c.relrowsecurity as rls_activee,
  count(p.policyname) as nombre_politiques,
  coalesce(string_agg(p.cmd, ', ' order by p.cmd), '—') as commandes
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policies p on p.schemaname = 'public' and p.tablename = c.relname
where n.nspname = 'public'
  and c.relname in ('mouvements_caisse', 'mouvements_credits_client', 'encaissements_marchand',
                    'releves_commissions', 'baremes_unites', 'messages_envoyes', 'journal_audit')
group by c.relname, c.relrowsecurity
order by c.relname;

-- Lecture attendue : rls_activee = true et nombre_politiques >= 1 pour les 7 tables.
-- journal_audit ne doit proposer que SELECT et INSERT (aucune mise à jour, aucune
-- suppression) : c'est ce qui rend le journal utile.

-- -----------------------------------------------------------------------------
-- 4. Rien n'a été perdu : comparaison avec ce que vous avez noté avant la 005
--    (requête 4 du fichier 005_avant.sql)
-- -----------------------------------------------------------------------------
select
  (select count(*) from public.transactions) as transactions,
  (select count(*) from public.agences) as agences,
  (select count(*) from public.sessions_caisse) as sessions,
  (select count(*) from public.transactions where montant_reglement is null) as lignes_sans_montant_regle,
  (select count(*) from public.transactions where ajustement_sens is not null) as lignes_avec_sens_ajustement;

-- Lecture attendue :
--   * les 3 premières valeurs sont IDENTIQUES à celles relevées avant la 005 ;
--   * lignes_sans_montant_regle = nombre total de transactions (colonnes vides
--     sur l'historique, comportement voulu : « règlement = valeur faciale ») ;
--   * lignes_avec_sens_ajustement = 0.

-- -----------------------------------------------------------------------------
-- 5. Dernière étape technique : demander à PostgREST de recharger son cache
--    (sinon l'application peut renvoyer « Could not find the table ... »).
-- -----------------------------------------------------------------------------
notify pgrst, 'reload schema';

-- Le résultat attendu est « NOTIFY » ou « Success. No rows returned ».
-- Il est aussi possible de cliquer sur Settings → API → Reload schema.
