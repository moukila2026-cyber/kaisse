# Supabase SQL Editor — installation sûre de Kaisse Pro + essai 14 jours

## Ce qu'il faut lancer

Les scripts complets sont dans le dépôt :

1. [`202610030001_kaisse_pro_v1.sql`](../supabase/migrations/202610030001_kaisse_pro_v1.sql) — tables, relations, Auth, RLS et fonctions d'ouverture/clôture.
2. [`202610030002_essai_14_jours.sql`](../supabase/migrations/202610030002_essai_14_jours.sql) — migration additive de l'essai 14 jours et du mode lecture seule après expiration.

Dans Supabase : **SQL Editor → New query → coller le contenu du fichier → Run**. Exécuter la migration 001 avant la 002, une seule fois chacune. La 002 est écrite de façon réexécutable (`ADD COLUMN IF NOT EXISTS`, politiques remplacées de manière ciblée), mais conservez malgré tout une copie du script appliqué.

## Important si des personnes sont déjà inscrites

- **Ne supprimez pas** les tables `agences`, `profils`, `points`, transactions ou utilisateurs Auth.
- La migration 002 n'utilise ni `TRUNCATE`, ni `DELETE`, ni `DROP TABLE`, ni `UPDATE` global. Elle ajoute trois colonnes nullable à `agences`, ajoute des règles de sécurité et remplace les fonctions de création de compte/session.
- Les agences présentes avant l'essai restent avec `statut_abonnement`, `essai_debute_le` et `essai_termine_le` à `NULL`. L'application les traite comme anciennes agences actives : leurs utilisateurs et données ne sont pas rétroactivement modifiés.
- Seule la création d'une **nouvelle agence** démarre automatiquement un essai de 14 jours. Un agent rejoignant une agence hérite de son statut; il ne redémarre pas le compteur.
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

La migration 002 suppose que les tables, fonctions et politiques de la migration 001 sont déjà présentes. Si le résultat montre l'ancien schéma de l'application ou si la migration 001 n'a jamais été appliquée, **arrêtez-vous avant de lancer la 002** : il faut d'abord adapter une migration de conversion à cette structure. Cette précaution évite de casser l'inscription existante ou de rendre les données inaccessibles.

## Vérifier les essais après installation

Lecture seule — cette requête ne modifie rien :

```sql
select
  id,
  nom,
  statut_abonnement,
  essai_debute_le,
  essai_termine_le,
  greatest(0, ceil(extract(epoch from (essai_termine_le - now())) / 86400))::int as jours_restants
from public.agences
order by created_at desc;
```

Après création d'une nouvelle agence, le statut attendu est `essai` et la fin est quatorze jours après le début. Pour les agences préexistantes, les trois colonnes restent `NULL`.

## Activer manuellement un client qui a payé

Après encaissement et vérification de l'identifiant, activer **une agence précise** :

```sql
update public.agences
set statut_abonnement = 'actif'
where id = 'UUID_DE_L_AGENCE';
```

L'application et le RLS autorisent alors les écritures. Laissez les dates de l'essai en place comme trace; ne lancez pas cet `UPDATE` sans clause `WHERE`, et ne mettez pas toutes les agences à `essai`.

Pour vérifier avant de modifier :

```sql
select id, nom, statut_abonnement, essai_termine_le
from public.agences
where id = 'UUID_DE_L_AGENCE';
```

## Configuration navigateur

Après les scripts, ajouter l'URL Supabase et la clé publique anon/publishable dans `.env.local`. Ne jamais coller la clé `service_role` dans l'application. Les étapes et commandes de lancement sont dans [`README.md`](../README.md).
