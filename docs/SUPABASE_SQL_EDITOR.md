# Supabase SQL Editor — installation sûre de Kaisse, essai, unités et modules V2

## Ce qu'il faut lancer

Les scripts complets sont dans le dépôt :

1. [`202610030001_kaisse_pro_v1.sql`](../supabase/migrations/202610030001_kaisse_pro_v1.sql) — tables, relations, Auth, RLS et fonctions initiales d'ouverture/clôture.
2. [`202610030002_essai_14_jours.sql`](../supabase/migrations/202610030002_essai_14_jours.sql) — essai de 14 jours et lecture seule après expiration.
3. [`202610030003_stock_unites.sql`](../supabase/migrations/202610030003_stock_unites.sql) — stock téléphonique distinct du float, règlements espèces/wallet et clôture du comptage.
4. [`202610030004_transferts_unites.sql`](../supabase/migrations/202610030004_transferts_unites.sql) — module « Unités & transferts » : seuil d'alerte par point, bénéficiaire masqué, index du journal unités et fonction de lecture du stock disponible.
5. [`202611010005_modules_concurrentiels.sql`](../supabase/migrations/202611010005_modules_concurrentiels.sql) — modules concurrentiels : mouvements de caisse, crédit client, encaissements marchands, relevés de commissions, barèmes de vente d'unités, messages préparés, journal d'audit, ajustements de stock (`ajustement_unites`) et vue `v_rapprochement_commissions`.

Dans Supabase : **SQL Editor → New query → coller le contenu du fichier → Run**. Sur un projet neuf, exécuter **001 → 002 → 003 → 004 → 005**, une fois chacune. Si 001 à 004 sont déjà installées, exécuter **seulement 005**. La migration 003 ajoute table/colonnes/fonctions sans mettre à jour les lignes historiques. Conservez une copie des scripts appliqués.

## Important si des personnes sont déjà inscrites

- **Ne supprimez pas** les tables `agences`, `profils`, `points`, transactions ou utilisateurs Auth.
- Les migrations 002 et 003 n'utilisent ni `TRUNCATE`, ni `DELETE` des données, ni `DROP TABLE`, ni mise à jour globale des données métier. La 002 ajoute les colonnes d'abonnement nullable et des contrôles de sécurité. La 003 ajoute une table de stock par session/opérateur, deux colonnes de règlement aux transactions et des fonctions dédiées; elle révoque aussi la suppression physique des transactions et limite les mises à jour aux champs d'annulation motivée. Les lignes de stock n'apparaissent que lorsqu'une session est ouverte/clôturée ou qu'un mouvement est saisi après installation.
- Les agences présentes avant l'essai gardent les nouvelles colonnes à `NULL`. L'application les traite comme anciennes agences actives : leurs utilisateurs et données ne sont pas rétroactivement modifiés.
- Seule la création d'une **nouvelle agence** démarre automatiquement un essai de 14 jours. Un gérant rejoignant une agence hérite de son statut; il ne redémarre pas le compteur. Le forfait Starter bloque les inscriptions de gérants/agents au-delà de trois accès actifs; Pro n'impose pas de plafond dans cette V1.
- La migration 005 ne modifie aucune donnée métier existante ; elle ajoute des tables vides et deux colonnes nullables. Les politiques RLS des nouvelles tables reprennent le modèle existant : lecture par agence, écriture par l'agent dans sa propre session ou par la gérance selon la table, suppression physique interdite.
- À expiration, les nouvelles agences passent en lecture seule, mais les données ne sont pas supprimées. L'export et la clôture d'une session déjà ouverte restent accessibles. Aucun prélèvement automatique n'est activé.

### Projet déjà en production ou avec un ancien schéma

La migration 001 est l'installation complète du schéma Kaisse Pro v1; elle n'est pas un outil de conversion de n'importe quelle ancienne structure. Si votre projet est déjà peuplé, ne l'exécutez pas à l'aveugle. Vérifiez d'abord les noms et colonnes :

```sql
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('agences', 'profils', 'points', 'transactions')
order by table_name, ordinal_position;
```

Les migrations 002 et 003 supposent respectivement que 001, puis 001+002, ont déjà été installées. Si la base utilise l'ancien schéma de l'application ou si 001 n'a jamais été appliquée, **arrêtez-vous avant de lancer 002 ou 003** : il faut d'abord adapter une migration de conversion à cette structure. Cette précaution évite de casser l'inscription existante ou de rendre les données inaccessibles.

## Installer les modules V2 (migration 005)

La migration 005 est **strictement additive et idempotente** (`CREATE ... IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`) :

- nouvelles tables `mouvements_caisse`, `mouvements_credits_client`, `encaissements_marchand`, `releves_commissions`, `baremes_unites`, `messages_envoyes`, `journal_audit` ;
- colonnes `transactions.montant_reglement` (montant réellement réglé) et `transactions.ajustement_sens` (`entree` / `sortie`) ;
- type d'opération `ajustement_unites` accepté par la contrainte `type_operation`, avec motif obligatoire et interdiction de règlement ;
- remplacement de la fonction `valider_mouvement_stock_unites()` pour inclure les ajustements dans le stock disponible ;
- vue `v_rapprochement_commissions` (attendu / constaté / reçu par opérateur et par mois).

Aucune ligne existante n'est mise à jour, supprimée ou backfillée : les transactions historiques gardent `montant_reglement = NULL`, interprété par l'application comme « règlement = valeur faciale ». Si la migration 005 n'est pas encore appliquée, l'application continue de fonctionner : les collections concernées sont simplement lues comme vides (`selectOptional`), les écritures correspondantes échouent avec un message explicite et sans bloquer la caisse.

## Installer le suivi du stock d'unités

La migration 003 définit le stock en **valeur faciale FCFA par opérateur**, séparé du float. Pour un projet qui a déjà reçu les migrations 001 et 002, copiez uniquement `supabase/migrations/202610030003_stock_unites.sql` dans une nouvelle requête SQL Editor et exécutez-la. Elle ne recrée pas les tables de base et ne retouche pas les sessions/transactions précédentes.

Convention V1 pour éviter toute ambiguïté de caisse : l'approvisionnement et le transfert client portent un seul montant, égal à la valeur faciale des unités **et** au règlement saisi. Un approvisionnement payé en espèces diminue les espèces; payé depuis un wallet, il diminue le float choisi. Un transfert au client augmente les espèces ou le wallet choisi et diminue le stock du fournisseur d'unités. Les bonus, remises ou prix de vente différents de la valeur faciale ne sont pas ventilés dans cette version.

Chaque propriétaire/agent ouvre, saisit et clôture sa propre session; le compte propriétaire ne peut pas saisir un mouvement ou un comptage au nom d'un autre agent. Pour une session encore ouverte au moment de l'installation, clôturez-la depuis son propre compte puis ouvrez une nouvelle session avec le stock initial. Le comptage de clôture d'une ancienne session est conservé, mais l'écart d'unités reste non calculable faute de stock d'ouverture historique. Les sessions clôturées antérieures restent inchangées et sont affichées comme non suivies (sans backfill).

## Vérifier les essais après installation

Lecture seule — cette requête ne modifie rien :

```sql
select
  id,
  nom,
  statut_abonnement,
  essai_debute_le,
  essai_termine_le,
  plan_abonnement,
  abonnement_termine_le,
  greatest(0, ceil(extract(epoch from (essai_termine_le - now())) / 86400))::int as jours_essai_restants
from public.agences
order by created_at desc;
```

Après création d'une nouvelle agence, le statut attendu est `essai` et la fin est quatorze jours après le début. Pour les agences préexistantes, les nouvelles colonnes restent `NULL`.

## Activer ou renouveler manuellement un forfait payé

Cette version ne contient pas de checkout SasPay ni de webhook. Starter est limité à trois profils actifs gérant/agent; vérifiez le nombre de membres avant activation et ne désactivez aucun compte sans accord de l'agence. Compter d'abord les accès concernés :

```sql
select count(*) as acces_gestion_actifs
from public.profils
where agence_id = 'UUID_DE_L_AGENCE'
  and actif = true
  and role in ('gerant', 'agent');
```

Après confirmation réelle du paiement et vérification de l'agence, saisir le forfait payé (`starter` ou `pro`) et ajouter une période de 30 jours :

```sql
update public.agences
set statut_abonnement = 'actif',
    plan_abonnement = 'starter', -- remplacer par 'pro' si c'est le forfait payé
    abonnement_termine_le = greatest(coalesce(abonnement_termine_le, now()), now()) + interval '30 days'
where id = 'UUID_DE_L_AGENCE';
```

Cette commande prolonge une échéance future de 30 jours ou repart de maintenant si l'accès est déjà échu. Vérifiez l'identifiant et le paiement avant de l'exécuter; ne retirez jamais la clause `WHERE`. Les dates d'essai sont conservées comme historique. Les agences préexistantes dont `statut_abonnement` est `NULL` ne sont pas concernées par cette mise à jour.

Pour vérifier avant et après :

```sql
select id, nom, statut_abonnement, essai_termine_le,
       plan_abonnement, abonnement_termine_le
from public.agences
where id = 'UUID_DE_L_AGENCE';
```

## Configuration navigateur

Après les scripts, ajouter l'URL Supabase et la clé publique anon/publishable dans `.env.local`. Ne jamais coller la clé `service_role` dans l'application. Les étapes et commandes de lancement sont dans [`README.md`](../README.md).
