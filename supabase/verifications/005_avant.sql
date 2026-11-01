-- =============================================================================
-- KAISSE — CONTRÔLES AVANT la migration 005 (modules concurrentiels)
--
-- Ce fichier est en LECTURE SEULE : il ne modifie rien.
-- Collez-le dans Supabase → SQL Editor → Run, puis lisez les résultats.
--
-- Objectif : savoir si votre projet est prêt, et si la 005 est déjà appliquée.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Pré-requis (migrations 001 → 004). Tout doit être « OK ».
-- -----------------------------------------------------------------------------
with attendus (objet, present) as (
  select 'table public.agences',                    to_regclass('public.agences') is not null
  union all select 'table public.profils',          to_regclass('public.profils') is not null
  union all select 'table public.points',           to_regclass('public.points') is not null
  union all select 'table public.operateurs',       to_regclass('public.operateurs') is not null
  union all select 'table public.sessions_caisse',  to_regclass('public.sessions_caisse') is not null
  union all select 'table public.soldes_session_operateur', to_regclass('public.soldes_session_operateur') is not null
  union all select 'table public.soldes_session_unites',    to_regclass('public.soldes_session_unites') is not null
  union all select 'table public.transactions',     to_regclass('public.transactions') is not null
  union all select 'table public.depenses',         to_regclass('public.depenses') is not null
  union all select 'table public.commission_baremes', to_regclass('public.commission_baremes') is not null

  union all select 'colonne points.seuil_alerte_unites', exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'points' and column_name = 'seuil_alerte_unites')
  union all select 'colonne transactions.beneficiaire_masque', exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'transactions' and column_name = 'beneficiaire_masque')
  union all select 'colonne transactions.mode_paiement_unites', exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'transactions' and column_name = 'mode_paiement_unites')
  union all select 'colonne transactions.operateur_paiement_code', exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'transactions' and column_name = 'operateur_paiement_code')

  union all select 'fonction public.agence_courante_id()',   to_regprocedure('public.agence_courante_id()') is not null
  union all select 'fonction public.peut_gerer_agence(uuid)', to_regprocedure('public.peut_gerer_agence(uuid)') is not null
  union all select 'fonction public.agence_peut_ecrire(uuid)', to_regprocedure('public.agence_peut_ecrire(uuid)') is not null
  union all select 'fonction public.stock_unites_session(uuid)', to_regprocedure('public.stock_unites_session(uuid)') is not null
  union all select 'trigger transactions_valider_mouvement_stock_unites', exists (
    select 1 from pg_trigger where tgname = 'transactions_valider_mouvement_stock_unites' and not tgisinternal)
)
select
  objet,
  case when present then 'OK' else 'MANQUANT' end as etat
from attendus
order by (not present) desc, objet;

-- Lecture : si une ligne dit MANQUANT, ne lancez PAS la 005.
-- Il faut d'abord appliquer la migration manquante (001 → 004), dans l'ordre.

-- -----------------------------------------------------------------------------
-- 2. La 005 est-elle déjà (partiellement) appliquée ?
--    Toutes les lignes doivent être « absente » avant la première exécution.
-- -----------------------------------------------------------------------------
with objets_005 (objet, present) as (
  select 'table mouvements_caisse',          to_regclass('public.mouvements_caisse') is not null
  union all select 'table mouvements_credits_client', to_regclass('public.mouvements_credits_client') is not null
  union all select 'table encaissements_marchand',    to_regclass('public.encaissements_marchand') is not null
  union all select 'table releves_commissions',       to_regclass('public.releves_commissions') is not null
  union all select 'table baremes_unites',            to_regclass('public.baremes_unites') is not null
  union all select 'table messages_envoyes',          to_regclass('public.messages_envoyes') is not null
  union all select 'table journal_audit',             to_regclass('public.journal_audit') is not null
  union all select 'vue v_rapprochement_commissions', to_regclass('public.v_rapprochement_commissions') is not null
  union all select 'colonne transactions.montant_reglement', exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'transactions' and column_name = 'montant_reglement')
  union all select 'colonne transactions.ajustement_sens', exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'transactions' and column_name = 'ajustement_sens')
)
select objet, case when present then 'déjà présente' else 'absente' end as etat
from objets_005
order by present desc, objet;

-- Lecture :
--   * tout « absente »                  → exécutez la 005 normalement ;
--   * tout « déjà présente »            → la 005 est déjà passée, ne la relancez pas ;
--   * un mélange                        → exécution interrompue : relancez la 005
--     (elle est idempotente) ou signalez-le-moi avant d'aller plus loin.

-- -----------------------------------------------------------------------------
-- 3. Les valeurs existantes de type_operation respectent-elles la nouvelle
--    contrainte ? La migration redéfinit la liste autorisée ; si une valeur
--    inattendue existe, l'exécution échouerait (sans rien casser, mais autant
--    le savoir avant).
-- -----------------------------------------------------------------------------
select
  type_operation,
  count(*) as nombre,
  case
    when type_operation in ('depot', 'retrait', 'transfert', 'achat_credit',
                            'approvisionnement_unites', 'transfert_unites', 'ajustement_unites')
      then 'accepté par la 005'
    else 'REFUSÉ : à examiner avant la migration'
  end as verdict
from public.transactions
group by type_operation
order by nombre desc;

-- -----------------------------------------------------------------------------
-- 4. Volume et ancienneté (pour estimer la durée des contrôles de contraintes)
-- -----------------------------------------------------------------------------
select
  (select count(*) from public.transactions)  as transactions,
  (select count(*) from public.agences)       as agences,
  (select count(*) from public.sessions_caisse) as sessions,
  (select min(created_at) from public.transactions) as premiere_operation;

-- Lecture : quelques milliers de lignes → migration quasi instantanée.
-- Au-delà de plusieurs centaines de milliers de lignes, prévenez-moi : nous
-- découperons l'opération.
