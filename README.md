# Kaisse — V2

Application web mobile-first (installable, consultable hors ligne) pour le suivi manuel des opérations et le rapprochement de caisse des points Mobile Money en Côte d'Ivoire, **y compris les transferts d'unités téléphoniques** (module « Unités & transferts »).

La V2 ajoute les modules attendus face aux concurrents africains et européens : stock d'unités et **marge de vente**, float et **prévision de rupture**, **mouvements d'espèces** (banque, coffre, fonds de caisse), **carnet de crédit client**, **encaissements marchands**, **rapprochement des commissions opérateur**, **pilotage multi-points**, **performance de l'équipe**, **centre d'alertes**, **récapitulatifs et reçus partageables**, **journal d'audit** et **application installable (PWA)**.

## Lancer la démo

```bash
npm install
npm run dev
```

Ouvrir l'adresse affichée par Vite, puis choisir **Essayer la démo**. Les données de démonstration sont fictives et restent dans le `localStorage` de ce navigateur. Le bouton **Réinitialiser** remet le jeu d'exemple à zéro.

## Connecter Supabase

1. Créer un projet Supabase.
2. Exécuter dans **SQL Editor**, dans cet ordre : `202610030001_kaisse_pro_v1.sql` → `202610030002_essai_14_jours.sql` → `202610030003_stock_unites.sql` → `202610030004_transferts_unites.sql` → `202611010005_modules_concurrentiels.sql`. N'exécuter que les fichiers qui ne sont pas encore appliqués : la cinquième est additive et idempotente. Guide détaillé, contrôles avant/après et retour arrière : [`docs/EXECUTER_MIGRATION_005.md`](docs/EXECUTER_MIGRATION_005.md).
3. Copier `.env.example` vers `.env.local`, puis renseigner l'URL et la clé **publique anon/publishable** du projet.
4. Dans Supabase Auth, configurer l'URL de redirection, choisir la confirmation email et vérifier que la longueur minimale de mot de passe correspond au parcours public (6 caractères).
5. Redémarrer le serveur Vite, créer un espace propriétaire, puis partager le code d'équipe à 8 caractères avec les gérants à inviter.

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=...
```

Ne jamais placer une clé `service_role` dans le navigateur. La clé publique n'est sûre qu'avec les politiques RLS de la migration actives. Le schéma n'intègre volontairement aucun barème opérateur : chaque agence doit saisir et vérifier ses propres taux. Le stock téléphonique est suivi séparément du float, en valeur faciale FCFA par opérateur; les approvisionnements et transferts client ajustent aussi espèces ou wallet, selon le règlement. Chaque utilisateur saisit uniquement dans sa session. Voir les conventions et le traitement des sessions historiques dans [`docs/SUPABASE_SQL_EDITOR.md`](docs/SUPABASE_SQL_EDITOR.md).

Les migrations sont additives : les agences déjà présentes gardent les nouvelles colonnes d'abonnement à `NULL`, restent accessibles et ne sont pas rétroactivement mises en essai; la migration 003 n'altère ni ne réinitialise les données historiques. Les nouvelles agences ont 14 jours; après expiration elles passent en lecture seule sans suppression de données. Les forfaits de référence sont Starter (10 000 FCFA / 30 jours, jusqu'à 3 agents) et Pro (25 000 FCFA / 30 jours, agents illimités), sans renouvellement automatique. L'activation payée est manuelle dans cette version : SasPay n'est pas branché à ce dépôt. Voir [`docs/SUPABASE_SQL_EDITOR.md`](docs/SUPABASE_SQL_EDITOR.md) avant d'exécuter un script sur un projet déjà utilisé.

## Nouveaux modules V2

Toutes les données restent saisies ou importées manuellement : Kaisse ne se connecte à aucune API opérateur.

| Module | Page | Ce qu'il apporte |
| --- | --- | --- |
| Pilotage & prévisions | `Pilotage` | consolidation par point, rupture estimée (unités et float), plan de réapprovisionnement, performance de l'équipe, rapprochement des commissions |
| Clients & encaissements | `Clients` | carnet de crédit (crédit / remboursement, échéance, retard), encaissements marchands QR/lien, rappels WhatsApp préparés |
| Mouvements de caisse | `Caisse` | dépôt en banque, coffre, fonds de caisse : ils entrent dans le théorique d'espèces |
| Barèmes d'unités | `Unités` + `Réglages` | prix d'achat / prix de vente pour 100 F de valeur faciale → marge réelle, montant réglé sur chaque mouvement |
| Ajustements de stock | `Unités` | correction motivée du stock théorique (casse, erreur de comptage, écart de clôture) |
| Relevés de commissions | `Réglages` + `Pilotage` | comparer attendu (barèmes) / constaté (saisie) / reçu (relevé opérateur) |
| Centre d'alertes | cloche + `Pilotage` | unités, float, prévision, session oubliée, crédit en retard, abonnement |
| Récap du soir et reçus | `Aperçu` + `Réglages` | message du jour et reçu client préparés, partagés via WhatsApp (aucun envoi automatique) |
| Seuils d'alerte | `Réglages` | seuils de float et d'unités modifiables par point |
| Journal d'audit | `Réglages` + `Clients` | qui a ouvert, annulé, ajusté, encaissé |
| PWA | toutes | `manifest.webmanifest` + service worker : installation sur mobile et coquille disponible hors ligne |

## Module Unités & transferts

Une section dédiée suit le stock d'unités par opérateur, séparément du float :

- stock théorique = ouverture + approvisionnements − transferts clients, en valeur faciale FCFA ;
- seuil d'alerte par point (`stock bas`, `rupture`), affiché sur la vue d'ensemble ;
- modale unique à trois modes (« mouvement d'unités ») : approvisionnement, transfert client ou ajustement motivé, avec règlement espèces/wallet et montant réellement réglé ;
- marge par opérateur (prix de vente − prix d'achat) et taux effectif quand le règlement diffère de la valeur faciale ;
- journal filtrable des mouvements d'unités, export CSV dédié, bénéficiaire masqué ;
- rapprochement des écarts de stock à la clôture, sans écart inventé sur les sessions historiques.

Détail des conventions, du calcul et des limites : [`docs/TRANSFERTS_UNITES.md`](docs/TRANSFERTS_UNITES.md).
Analyse concurrentielle et état d'implémentation des fonctionnalités : [`docs/ANALYSE_CONCURRENTS.md`](docs/ANALYSE_CONCURRENTS.md).

## Vérifications

```bash
npm test
npm run lint
npm run build
npm run check:render
```

## Périmètre assumé

Kaisse est un journal de saisie et un calculateur de rapprochement : aucune transaction n'est initiée, aucune donnée de solde n'est lue chez les opérateurs, aucune commission n'est garantie, aucun encaissement marchand n'est déclenché par l'application et aucun message WhatsApp n'est envoyé automatiquement. Les prévisions de rupture sont des estimations arithmétiques (moyenne des sorties, stock déclaré) : elles ne remplacent ni les relevés opérateur ni un comptage physique. Le carnet de crédit ne stocke que des numéros masqués. Le journal s'exporte en CSV ou en PDF imprimable avec filtres de période, type, opérateur et agent; le partage du rapport reste manuel. Le stock initial est suivi sur chaque nouvelle session; aucune donnée de stock historique n'est inventée ou backfillée. Voir [`docs/KAISSE_PRO_V1.md`](docs/KAISSE_PRO_V1.md) pour le produit, la base de données et le modèle tarifaire aligné sur la référence.
