# Recette des migrations sur PostgreSQL embarqué

`005_smoke.mjs` rejoue **001 → 005** sur un PostgreSQL réel (PGlite, compilé en
WebAssembly) puis vérifie les règles métier : 16 contrôles.

Il ne touche ni votre projet Supabase, ni votre base de production : tout se
passe en mémoire, dans un processus Node.

## Lancer la recette

```bash
npm install --no-save @electric-sql/pglite   # outil de test, non ajouté aux dépendances
node supabase/tests/005_smoke.mjs
```

Résultat attendu : `16/16 contrôles réussis` et un code de sortie `0`.

`--no-save` est volontaire : PGlite ne sert qu'à cette recette et n'est pas une
dépendance de l'application (elle n'est donc ni installée en production, ni
embarquée dans le bundle).

## Ce que la recette vérifie

1. Les 5 migrations s'exécutent dans l'ordre, sans erreur.
2. Les 7 nouvelles tables acceptent une écriture.
3. `transactions.montant_reglement` et `ajustement_sens` se remplissent.
4. Un ajustement **sans motif** est refusé (`transactions_ajustement_check`).
5. Un ajustement **avec règlement** est refusé (même contrainte).
6. Une **sortie de stock supérieure au disponible** est refusée (trigger 003/005).
7. Un `type_operation` inconnu est refusé.
8. Le stock d'unités intègre les ajustements : `10 000 + 1 000 − 10 000 − 500 = 500`.
9. La vue `v_rapprochement_commissions` renvoie attendu / constaté / reçu.
10. La migration 005 est **rejouable** (idempotente).
11. Les scripts `005_avant.sql` et `005_apres.sql` s'exécutent sans erreur.
12. Le retour arrière **refuse** de s'exécuter si des données existent.
13. Le retour arrière s'applique proprement sur des tables vides.

## Pré-requis simulés

Supabase fournit trois éléments que PostgreSQL seul n'a pas ; la recette les
recrée en tête de script : le schéma `auth`, la table `auth.users`, la fonction
`auth.uid()` et les rôles `anon` / `authenticated`.

## Limite

La recette valide le **SQL** (contraintes, triggers, vues, ordre d'exécution),
pas les politiques RLS en situation multi-utilisateurs : celles-ci dépendent de
jetons JWT réels et se testent sur un projet Supabase de préproduction.
