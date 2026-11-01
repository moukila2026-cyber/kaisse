# Module « Unités & transferts »

Section dédiée à la gestion du **stock d'unités téléphoniques** d'un point de vente mobile money qui vend aussi des transferts d'unités (crédit Orange, MTN, Moov, Wave).

## 1. Pourquoi une section séparée

Un point de vente gère trois trésoreries distinctes :

| Trésorerie | Ce qu'elle contient | Où elle est suivie dans Kaisse |
|---|---|---|
| Espèces | billets dans le tiroir / la caisse | `sessions_caisse` + transactions |
| Float électronique | soldes Orange Money, MTN MoMo, Moov, Wave | `soldes_session_operateur` |
| **Unités** | valeur faciale du crédit téléphonique disponible | `soldes_session_unites` + transactions d'unités |

Mélanger les unités au float fausse les deux : un transfert d'unités ne change pas le solde mobile money du même opérateur, il change le stock de crédit et, selon le règlement, les espèces ou un autre wallet.

La section **Unités & transferts** rend ces mouvements explicites, les chiffre et les rapproche du comptage de clôture.

## 2. Conventions de calcul

- Le stock est exprimé en **valeur faciale FCFA**, jamais en nombre de « tickets ».
- `stock théorique = stock d'ouverture + approvisionnements − transferts clients`, par opérateur.
- Seules les **sessions ouvertes** portent le stock disponible. Les sessions clôturées servent uniquement au calcul des écarts : leur reliquat a déjà été compté puis repris à l'ouverture suivante, l'additionner reviendrait à compter deux fois le même argent.
- S'il n'y a aucune session ouverte sur la date, l'écran affiche le dernier stock connu de chaque point (session la plus récente) au lieu de zéro.
- `écart = stock compté à la clôture − stock théorique de cette session`. Un écart n'est calculé que si le stock d'ouverture était suivi ; les sessions antérieures à la migration 003 sont marquées « non suivi » et ne produisent aucun écart.
- Les transactions **annulées** sont exclues de tous les calculs et restent visibles dans le journal.

### Règlements

| Mouvement | Règlement espèces | Règlement wallet |
|---|---|---|
| Approvisionnement d'unités | caisse espèces − | float de l'opérateur choisi − |
| Transfert d'unités au client | caisse espèces + | float de l'opérateur choisi + |

Dans les deux cas, le **stock de l'opérateur des unités** est respectivement + ou −.

Depuis la V2, la valeur faciale et le règlement sont **deux champs distincts** (`montant` et `montant_reglement`, migration 005) :

- un transfert de 10 000 F de crédit facturé 10 500 F porte une **marge de 500 F** ;
- un approvisionnement de 10 000 F payé 9 700 F au grossiste porte une **marge de 300 F** ;
- laissé vide, le règlement vaut la valeur faciale (comportement des transactions historiques).

La marge est calculée par opérateur à partir des barèmes de vente (`baremes_unites`) et des montants réellement réglés. Aucun barème n'est préchargé : chaque agence saisit son prix d'achat et son prix de vente.

## 3. Seuils et alertes

- `points.seuil_alerte_unites` (migration 004) : seuil en valeur faciale, optionnel.
- Niveaux affichés : **Disponible** (> seuil), **Stock bas** (≤ seuil et > 0), **Rupture** (0), **Non suivi** (session historique).
- Si plusieurs points sont affichés, le seuil le plus élevé sert de repère commun.
- Un transfert au client est refusé côté interface **et** côté base (trigger de la migration 003) si le montant dépasse le stock disponible de l'opérateur.

## 4. Écrans

| Élément | Contenu | Actions |
|---|---|---|
| Bandeau d'alerte | opérateurs sous le seuil ou en rupture | Approvisionner |
| Bandeau historique | sessions sans stock initial suivi | Voir la caisse |
| KPI | stock disponible, approvisionnements, transferts clients, commissions unités | — |
| Cartes opérateur | stock théorique, jauge, seuil, achats/ventes du jour, écart de clôture | Approvisionner / Vendre |
| Journal des unités | période, opérateur, type, annulées, totaux filtrés | Export CSV, annulation motivée |
| Repères de gestion | formules et limites assumées | — |
| Rapprochement du jour | écart cumulé par opérateur sur les sessions clôturées | Caisse & clôture |
| Unités transférées par opérateur | classement des ventes de la période | — |

### Modale « Mouvement d'unités »

Une seule modale, **trois modes** (V2) : **Approvisionnement**, **Transfert client** et **Ajustement de stock**.
Champs : session, opérateur du stock, mode de règlement (espèces / float d'un opérateur choisi), valeur faciale, **montant réellement réglé**, référence, bénéficiaire masqué (vente uniquement), commission réelle (vente uniquement).
La modale rappelle le stock disponible, le stock après opération, l'effet sur la caisse et, si un barème de vente existe, la marge attendue.

Le mode **Ajustement de stock** corrige le stock théorique après un comptage, une casse ou une erreur de saisie : il exige un motif (3 caractères minimum), n'accepte aucun règlement ni commission, et un ajustement de sortie est refusé si le stock disponible est insuffisant. Il est tracé dans le journal d'audit et n'apparaît pas dans les totaux de commissions.

### Bénéficiaire masqué

Le numéro du client est **volontairement masqué** avant enregistrement : `07 00 00 00 00` devient `07 ** ** 56`. La base refuse un numéro complet (contrainte `transactions_beneficiaire_masque_check`, migration 004). Objectif : permettre le contrôle sans constituer un fichier de numéros clients.

## 5. Base de données

Migration : [`202610030004_transferts_unites.sql`](../supabase/migrations/202610030004_transferts_unites.sql) (à exécuter après 001 → 002 → 003).

| Objet | Rôle |
|---|---|
| `points.seuil_alerte_unites` | seuil d'alerte en valeur faciale FCFA (nullable) |
| `transactions.beneficiaire_masque` | numéro masqué, autorisé seulement sur `transfert_unites` |
| `transactions_mouvements_unites_idx` | index de lecture du journal unités |
| `stock_unites_session(uuid)` | lecture du stock théorique par opérateur (NULL si non suivi) |
| `controler_seuil_unites_point()` | seul un propriétaire/gérant modifie le seuil |
| `proteger_transaction_annulee()` | mise à jour : le bénéficiaire masqué est immuable |
| `transactions_montant_positif_check` | montant > 0 pour les nouvelles lignes (`not valid` pour l'historique) |

La migration est additive : aucune donnée n'est supprimée ni backfillée. Les sessions déjà clôturées restent affichées « non suivi ».

## 6. Limites assumées

- Kaisse **n'envoie aucune recharge** : le transfert est effectué sur le téléphone ou le portail opérateur.
- Aucun solde n'est lu chez l'opérateur : le stock est déclaré par l'agence.
- Le prix de vente et le prix d'achat sont désormais suivis (`baremes_unites` + `transactions.montant_reglement`) et la marge par opérateur est calculée ; les bonus grossiste restent saisis comme un règlement plus faible, sans facture fournisseur.
- L'ajustement d'inventaire motivé existe (mode « Ajustement ») mais il est **saisi par l'agent dans sa session** : la validation a posteriori par le gérant reste une évolution souhaitable.

## 7. Vérifications

```bash
npm test            # domaine unités : stock, niveaux, écarts, masquage, refus de vente
npm run lint
npm run build
npm run check:render  # rendu serveur de la page Unités et de la modale (smoke test)
```
