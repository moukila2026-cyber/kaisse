# Exécuter la migration 005 dans Supabase SQL Editor

Guide pas à pas pour appliquer `supabase/migrations/202611010005_modules_concurrentiels.sql`
sur un projet Supabase **déjà utilisé** (avec de vraies données), sans rien perdre.

> **Temps estimé : 5 à 10 minutes**, dont 2 minutes de contrôles.
> **Risque : faible.** La migration est additive, idempotente et s'exécute dans
> une seule transaction : en cas d'erreur, PostgreSQL annule tout et votre base
> reste exactement dans l'état d'avant.
>
> **Déjà vérifiée :** la chaîne 001 → 005 a été rejouée sur un PostgreSQL réel
> (embarqué, en mémoire) et passe **16 contrôles** : contraintes, trigger de
> stock, vue de rapprochement, idempotence et retour arrière. Voir
> [`supabase/tests/README.md`](../supabase/tests/README.md) pour rejouer la
> recette chez vous.

---

## 0. Ce que la migration ajoute (rappel)

| Type | Objets |
|---|---|
| 7 tables | `mouvements_caisse`, `mouvements_credits_client`, `encaissements_marchand`, `releves_commissions`, `baremes_unites`, `messages_envoyes`, `journal_audit` |
| 2 colonnes | `transactions.montant_reglement`, `transactions.ajustement_sens` |
| 1 valeur autorisée | `ajustement_unites` dans `transactions.type_operation` |
| 1 vue | `v_rapprochement_commissions` |
| 2 fonctions remplacées | `valider_mouvement_stock_unites()`, `stock_unites_session(uuid)` |

**Ce qu'elle ne fait pas** : aucune suppression, aucune mise à jour, aucun
remplissage rétroactif. Vos transactions existantes gardent
`montant_reglement = NULL`, ce que l'application lit comme « règlement = valeur
faciale ».

Ordre d'exécution : `001 → 002 → 003 → 004 → 005`. Les quatre premières doivent
déjà être appliquées ; la 005 est la cinquième et la dernière.

---

## 1. Sauvegarder d'abord (2 minutes)

Même si la migration est sûre, on ne travaille pas sur une base de production
sans filet.

**Option A — sauvegarde Supabase (recommandée)**

1. Dans le tableau de bord Supabase : **Project Settings → Database → Backups**.
2. Notez si les **sauvegardes quotidiennes** sont actives et l'heure de la
   dernière.
3. Si votre offre inclut la **PITR** (Point-in-Time Recovery), notez l'heure
   courante : vous pourriez revenir à cette minute précise.

**Option B — export manuel des tables sensibles**

Table Editor → table `transactions` → **Export → CSV** (idem pour `agences`,
`profils`, `points`, `sessions_caisse`). Gardez ces fichiers hors du dépôt Git.

---

## 2. Relever les compteurs AVANT

Ouvrez **SQL Editor → New query**, collez le contenu de
[`supabase/verifications/005_avant.sql`](../supabase/verifications/005_avant.sql)
et cliquez **Run**.

Trois choses à faire :

1. **Requête 1** : toutes les lignes doivent afficher `OK`. La moindre ligne
   `MANQUANT` signifie qu'une migration antérieure n'a pas été appliquée :
   arrêtez-vous et appliquez d'abord la 001, 002, 003 ou 004.
2. **Requête 2** : doit afficher `absente` partout (première exécution).
3. **Requête 4** : **notez les 4 nombres** sur un papier ou dans un brouillon.
   Vous les comparerez après. Exemple attendu :
   ```
   transactions | agences | sessions | premiere_operation
   1 284        | 1       | 96       | 2026-10-03 08:12:44+00
   ```

Si la **requête 3** affiche un `verdict` autre que « accepté par la 005 »,
arrêtez-vous et signalez-le : une valeur de `type_operation` inconnue empêcherait
la migration de valider sa contrainte.

---

## 3. Copier la migration en entier

1. Ouvrez
   [`supabase/migrations/202611010005_modules_concurrentiels.sql`](../supabase/migrations/202611010005_modules_concurrentiels.sql)
   dans l'éditeur de votre choix.
2. **Sélectionnez tout**, de la première ligne `-- KAISSE v2.0 …` jusqu'au
   dernier `commit;` **inclus**.

> ⚠️ Le premier mot exécutable est `begin;` et le dernier est `commit;`.
> Si vous coupez un bloc, vous obtiendrez une erreur de syntaxe et **rien** ne
> sera appliqué — c'est le pire des cas : aucune casse, mais perte de temps.

Astuce : sur GitHub, bouton **Raw** → `Ctrl+A` / `Cmd+A` → `Ctrl+C`.

---

## 4. Coller et exécuter

1. Supabase → **SQL Editor → New query**.
2. Coller le contenu.
3. Cliquer **Run** (ou `Ctrl+Entrée`).
4. Attendre la fin. Vous devez voir :

   ```
   Success. No rows returned
   ```

C'est normal : la migration crée des objets, elle ne renvoie pas de lignes.

Durée observée : **moins d'une seconde** sur une base de quelques milliers de
transactions. Sur une très grosse table, l'ajout des contraintes peut prendre
quelques secondes.

---

## 5. Vérifier après (obligatoire)

Toujours dans **SQL Editor**, collez
[`supabase/verifications/005_apres.sql`](../supabase/verifications/005_apres.sql)
et cliquez **Run**.

| Requête | Résultat attendu |
|---|---|
| 1 — objets | tout `OK` (les 7 tables, la vue, les 2 colonnes, l'index, les 2 fonctions à jour) |
| 2 — contraintes | 4 lignes : `transactions_type_operation_check`, `transactions_ajustement_check`, `transactions_montant_reglement_check`, `transactions_montant_reglement_scope_check` |
| 3 — sécurité | `rls_activee = true` et au moins 1 politique pour les 7 tables |
| 4 — compteurs | **les mêmes nombres qu'à l'étape 2**, `lignes_sans_montant_regle` = total des transactions, `lignes_avec_sens_ajustement = 0` |
| 5 — cache | exécute `notify pgrst, 'reload schema';` (ou Settings → API → **Reload schema**) |

> `transactions_montant_reglement_scope_check` avec
> `validee_sur_historique = false` est **normal** : l'historique n'est pas
> revérifié, les nouvelles lignes le sont. C'est ce qui permet la migration
> sans temps d'arrêt.

Le `notify pgrst, 'reload schema';` de la requête 5 est important : sans lui,
l'API peut continuer à répondre « Could not find the table … » pendant quelques
minutes, alors que la table existe bien.

---

## 6. Tester dans l'application (5 minutes)

Sur un compte de test, dans l'ordre — chaque étape prouve qu'une partie de la
migration est réellement branchée :

1. **Ouvrir une session** (Caisse) → le stock d'unités s'enregistre
   (`soldes_session_unites`, déjà là depuis 003).
2. **Nouvelle opération** (dépôt ou retrait) → colonne `montant_reglement`
   remplie : c'est la 005 colonne 1 qui fonctionne.
3. **Mouvement d'espèces** (Caisse → bouton) → enregistre dans
   `mouvements_caisse`.
4. **Crédit client** (Clients → Crédit client) → enregistre dans
   `mouvements_credits_client`.
5. **Barème de vente** (Réglages) → enregistre dans `baremes_unites`.
6. **Relevé de commissions** (Pilotage ou Réglages) → `releves_commissions`.
7. **Ajustement de stock** (Unités → Ajuster) → écrit
   `type_operation = 'ajustement_unites'` avec `ajustement_sens` : c'est la
   preuve que la nouvelle contrainte est bien active.
8. **Réglages → Journal d'audit** : les actions précédentes apparaissent.

Si l'une de ces étapes affiche une erreur, copiez le message exact : il indique
en général la table ou la colonne manquante.

---

## 7. Dépannage : erreurs fréquentes et solution

| Message | Cause | Solution |
|---|---|---|
| `relation "public.agences" does not exist` | migration 001 absente | appliquer 001 → 004 dans l'ordre |
| `column "seuil_alerte_unites" does not exist` | migration 004 absente | appliquer la 004, puis relancer la 005 |
| `check constraint "transactions_type_operation_check" of relation "transactions" is violated by some row` | une transaction porte un `type_operation` hors liste | exécuter la **requête 3** du fichier `005_avant.sql` ; si une valeur inconnue apparaît, me la communiquer avant de forcer quoi que ce soit |
| `cannot change return type of existing function` | une ancienne version de `stock_unites_session` a un autre type de retour | `drop function public.stock_unites_session(uuid);` puis relancer la 005 |
| `must be owner of table transactions` | vous n'êtes pas connecté comme propriétaire du projet | utiliser le SQL Editor du projet (rôle `postgres`) ; en CLI, `supabase db push` avec le compte owner |
| `syntax error at or near "..."` | copie partielle du fichier | recopier **tout**, de `begin;` à `commit;` |
| `Success` mais l'app dit `Could not find the table 'public.journal_audit'` | cache PostgREST | exécuter `notify pgrst, 'reload schema';` puis attendre 30 s |
| l'app affiche `Le schéma n'est pas à jour…` | 005 pas encore appliquée | c'est le comportement prévu : la caisse reste utilisable, seules les fonctions nouvelles sont indisponibles |

**En cas de doute : ne relancez pas, ne « réparez » pas à la main.** La 005 est
idempotente (`IF NOT EXISTS`), donc la relancer est sans danger ; mais si le
message d'erreur parle de données, arrêtez et envoyez-moi le message.

---

## 8. Retour arrière (si vraiment nécessaire)

Fichier : [`supabase/verifications/005_retour_arriere.sql`](../supabase/verifications/005_retour_arriere.sql).

Il **refuse de s'exécuter** si les nouvelles tables contiennent la moindre
ligne. C'est volontaire : un retour arrière ne doit jamais détruire des crédits
clients ou des mouvements de caisse réels. Il faut d'abord exporter puis vider
ces tables.

Rappel : si la migration a échoué en cours de route, le retour arrière est
**inutile** — la transaction a déjà été annulée.

---

## 8 bis. Rejouer la recette vous-même (facultatif, 1 minute)

Avant de toucher votre vrai projet, vous pouvez prouver que la migration
fonctionne sur un PostgreSQL jetable, en local :

```bash
npm install --no-save @electric-sql/pglite
node supabase/tests/005_smoke.mjs
```

Sortie attendue : `16/16 contrôles réussis`. Rien n'est envoyé sur Supabase.

---

## 9. Alternative : ligne de commande

Si vous utilisez la CLI Supabase sur un projet de préproduction :

```bash
supabase link --project-ref <votre-ref>
supabase db push --dry-run     # liste les migrations en attente
supabase db push               # applique
```

`db push` applique les fichiers dans l'ordre des noms et enregistre l'état ;
ne mélangez pas SQL Editor et `db push` pour la même migration (l'un ne sait
pas ce que l'autre a fait).

---

## 9 bis. Journal des vérifications faites sur ce dépôt

| Vérification | Résultat |
|---|---|
| Syntaxe des 8 fichiers SQL (parseur PostgreSQL 17) | OK — 78 / 34 / 46 / 26 / 85 instructions |
| Application 001 → 005 sur PostgreSQL réel | OK |
| Contraintes d'ajustement (motif obligatoire, pas de règlement) | OK, refus attendu |
| Blocage d'une sortie de stock supérieure au disponible | OK, refus attendu |
| Stock recalculé avec ajustements | OK (10 000 + 1 000 − 10 000 − 500 = 500) |
| Vue `v_rapprochement_commissions` | OK (attendu 200 / constaté 700 / reçu 4 200) |
| Migration 005 rejouée deux fois | OK (idempotente) |
| Scripts `005_avant.sql` / `005_apres.sql` | OK |
| Retour arrière avec données / sans données | refusé / appliqué |

Un défaut a été trouvé et corrigé grâce à cette recette : la vue de
rapprochement des commissions utilisait une sous-requête corrélée sur une
colonne non groupée (`t.created_at`), ce qui faisait échouer la migration à la
dernière étape. La vue calcule désormais les agrégats par mois dans un CTE.
**Si vous aviez récupéré un fichier 005 antérieur, reprenez la version actuelle.**

Ce qui reste non testable ici : les politiques RLS en situation réelle
(jetons JWT, plusieurs utilisateurs, plusieurs agences). Elles se valident sur
un projet de préproduction, en se connectant successivement comme propriétaire,
gérant et agent.

---

## 10. Et si vous préférez que je le fasse ?

Arena peut exécuter la migration à votre place si vous connectez le connecteur
**Supabase** à cette conversation (Réglages → Applications). Une fois connecté,
je peux :

1. lancer les contrôles du fichier `005_avant.sql` sur votre projet ;
2. exécuter la 005 ;
3. relancer les contrôles `005_apres.sql` et vous montrer les résultats.

Sans cette connexion, je ne vois ni votre base ni vos données — c'est ce qui
explique que ce guide vous laisse la main sur chaque étape.
