# Kaisse — analyse concurrentielle et pistes de fonctionnalités

> Document de travail (novembre 2026). Les éléments de marché proviennent de sources publiques citées en fin de page et doivent être revérifiés avant toute décision commerciale.

## 1. Où se situe Kaisse aujourd'hui

D'après le site public [kaissseapp.vercel.app](https://kaissseapp.vercel.app) et ce dépôt :

- **Cible** : points de vente mobile money de Côte d'Ivoire (Orange Money, MTN MoMo, Wave, Moov Money), propriétaire + gérants.
- **Promesse** : remplacer le cahier, suivre dépôts/retraits/transferts, comparer les soldes théoriques aux montants réellement comptés.
- **Modules existants** : sessions de caisse, soldes float par opérateur, stock d'unités, dépenses, barèmes de commission, exports CSV/PDF, essai 14 jours, forfaits 10 000 / 25 000 FCFA par 30 jours, paiement Mobile Money via SasPay (encaissement encore manuel).
- **Limites assumées** : aucune lecture des soldes opérateur, aucune initiation de transaction, commissions estimées et non garanties, saisie manuelle.

**Ce que ça vaut face au marché** : le positionnement « caisse + float + unités + commissions, saisie manuelle, mobile d'abord, prix en FCFA » est rare en Afrique francophone. Les concurrents sont soit des outils d'opérateur (vendus au réseau, pas à l'agent), soit des POS génériques (cartes bancaires, pas de float), soit des outils de float en anglais basés en Afrique de l'Est.

## 2. Cartographie concurrentielle

### A. Outils de gestion d'agents mobile money (Afrique de l'Est / anglophone)

| Produit | Marché | Fonctionnalités clés | Enseignement pour Kaisse |
|---|---|---|---|
| **Wakala Max** ([site](https://wakalamax.com/)) | Tanzanie / Afrique de l'Est | Float par réseau, achat/transfert/**ajustement** de float, alertes float bas et clôture quotidienne, moteur de commissions, multi-branches, multi-utilisateurs, multi-tenant, panneau super-admin, tarif ~25 000 TZS/mois | Le « multi-branches + commissions automatiques + alertes » est le socle attendu. L'**ajustement manuel de stock** est indispensable. |
| **FloatFlow** ([site](https://asomg-float-flow.vercel.app/)) | Kenya, Tanzanie, Ouganda, Ghana, Nigeria | **Offline-first** (IndexedDB), multi-opérateurs (M-Pesa, Airtel, Tigo, MTN), rapprochement de caisse instantané, sauvegardes, journal d'audit, gestion des **shifts** et passation entre gérants | L'**offline** est un argument majeur sur le terrain (coupures réseau). La passation de caisse entre équipes aussi. |
| **EasyFloat** ([site](https://www.easyfloat-tech.com/)) | Nigeria | Suivi de float MTN/Glo/Airtel/9mobile, app agent + tableau distributeur, alertes de stock, onboarding par WhatsApp | Le **canal WhatsApp** est le vrai canal d'acquisition et support ; le **distributeur/super-agent** est un segment à part. |
| **Opareta** ([Renew Capital](https://www.renewcapital.com/newsroom/press-release-opareta-secures-investment-to-roll-out-comprehensive-mobile-money-operator-solution), [Afrimoney SI](https://play.google.com/store/apps/details?id=com.opareta.afrimoneysierraleone&hl=en_US)) | Ouganda, Sierra Leone, Zambie, Angola, Gambie | Plateforme **pour l'opérateur** : rapprochement de caisse, approbations et décaissements de float, crédit, capture KYC, visites terrain, CRM, export CSV côté agent | Kaisse n'est pas en concurrence frontale (l'acheteur n'est pas l'agent), mais ces outils fixent les attentes : **KYC, audit, exports**. |

### B. Liquidité et crédit de float

| Produit | Modèle | Enseignement |
|---|---|---|
| **Tanda / Rebalance** ([IDEO](https://www.ideo.org/project/rebalance-float-marketplace)) | Place de marché **pair-à-pair** de float entre agents ; super-agents vendeurs, livraison avec code de vérification ; > 2 000 super-agents, jusqu'à 8 M KES/mois échangés | La pénurie de float est LE problème n°1 des agents. Kaisse peut d'abord la **mesurer** (seuils, prévision de rupture) avant d'y répondre. |
| **Izwe Float** ([GhanaWeb](https://www.ghanaweb.com/GhanaHomePage/business/Izwe-Float-Empowering-Mobile-Money-agents-with-fast-flexible-access-to-working-capital-2047042)) | Ligne de crédit de float pour agents ghanéens, sans collatéral, frais fixe selon la durée | Un partenariat crédit (plutôt qu'un développement interne) est réaliste à moyen terme. |

### C. POS et paiements Afrique francophone

| Produit | Positionnement | Enseignement |
|---|---|---|
| **Plazza POS** ([site](https://plazzapos.app/)) | Caisse/ERP pour commerçants d'Afrique francophone : caisse tactile, stocks, CRM, **comptabilité OHADA**, mobile money (M-Pesa, Orange, MTN, Airtel, Moov, Wave), wallet marchand, boutique en ligne | La **comptabilité OHADA** et le **wallet marchand** sont des modules attendus par les commerces structurés : un axe d'extension pour Kaisse. |
| **Wave Business** ([guide CI](https://simiz.io/blog/ouvrir-compte-marchand-wave-cote-ivoire), [App Store](https://apps.apple.com/sn/app/wave-business/id1623089106?l=fr-FR)) | Encaissement marchand par QR/lien, ~1 % de commission côté marchand en CI, règlement instantané, gratuit pour le client | Ce n'est pas un concurrent de gestion d'agence : c'est un **canal d'encaissement** que Kaisse pourrait accepter (ventes marchandises) et un rappel que les frais opérateur changent vite. |

### D. Caisse et gestion des espèces (Europe)

| Produit | Positionnement | Enseignement |
|---|---|---|
| **SumUp** ([US News](https://business.usnews.com/point-of-sale/sumup)) | POS cloud + terminaux, mode **hors ligne**, stock basique, fidélité, gestion d'équipe sur plans hauts | Simplicité d'entrée + offline ; la fidélité est le levier de rétention. |
| **Zettle (PayPal)** ([comparatif](https://ciroapp.com/compare/sumup-vs-zettle)) | POS gratuit, fonds disponibles en minutes, suivi de performance des employés | Rétention par la trésorerie (rapidité de règlement) plutôt que par les fonctions. |
| **Lightspeed** ([Business.com](https://www.business.com/reviews/lightspeed-pro/)) | Retail avancé : stocks multi-sites, achats/fournisseurs, fidélité, rapports personnalisés, rôles | Le **multi-site + réapprovisionnement fournisseur** est le modèle à viser quand Kaisse servira des réseaux. |
| **Cashlogy** ([site](https://cashlogy.com/cashlogy/)) | Matériel de recyclage d'espèces + app : soldes d'ouverture/fermeture, rôles, notifications, exports | La **traçabilité des comptages** et les **rôles différenciés** valent plus que la vitesse de saisie. Coût matériel élevé : hors de portée d'un kiosque ivoirien, d'où l'intérêt d'une version logicielle. |

## 3. Spécificités ivoiriennes / UEMOA à intégrer dans le produit

- **Grille de transfert d'unités Orange CI** publiée : 200–1 000 F → 52 F ; 1 001–2 500 F → 52 F ; 2 501–5 000 F → 515 F ; 5 001–10 000 F → 1 030 F ([orange.ci](https://www.orange.ci/fr/comment-transfrer-des-units-ou-du-volume-internet-orange.html)). Un barème **pré-rempli mais modifiable** (avec source et date) ferait gagner un temps considérable — en conservant l'avertissement « estimation, non garantie ».
- **Transfert d'unités comme service marchand** : des acteurs comme Kbine Digital vendent le transfert d'unités Orange/MTN/Moov de 100 à 50 000 FCFA, payé en mobile money ([kbinedigital.com](https://kbinedigital.com/transfert-unites)). L'agent vend donc un service à marge : le suivi de marge par opérateur est un besoin réel.
- **Réglementation BCEAO** : depuis la réforme d'octobre 2026, plafonds portés à 4 M FCFA de solde et 15 M de rechargement mensuel par client, **distributeurs et accepteurs exemptés** dans le cadre professionnel, transferts interopérables gratuits jusqu'à 8 000 FCFA/jour puis ≤ 0,8 % HT ([TechCabal](https://techcabal.com/2026/10/13/francophone-weekly-by-techcabal-044/), [Osiris](https://www.osiris.sn/mobile-money-dans-luemoa-ce-que-change-reellement-le-doublement-des-plafonds.html)). Conséquences produit : **suivi des plafonds/alertes de conformité**, journal exportable, et gestion des frais interopérateurs.
- **Paiement de l'abonnement** : SasPay + mobile money est cohérent avec le marché (pas de carte). La faiblesse actuelle est l'activation manuelle : un webhook de confirmation est un gain de conversion immédiat.

## 4. Fonctionnalités recommandées (priorisées)

### P0 — à fort impact, faible effort (prochaines 2 à 4 semaines)

1. **Report automatique du stock de clôture vers l'ouverture suivante** (pré-remplissage du comptage). Aujourd'hui chaque session repart d'une saisie manuelle : c'est la première source d'erreur et d'abandon.
2. **Marge réelle sur les unités** : prix d'achat / prix de vente distincts de la valeur faciale (bonus grossiste, vente à 110 F pour 100 F de crédit) au lieu du seul champ « commission constatée ».
3. **Alertes et récapitulatif WhatsApp** : stock bas, float bas, session non clôturée, récap du soir. C'est le canal utilisé par les agents et par les concurrents (EasyFloat, Wakala Max).
4. **Mode hors ligne (PWA + IndexedDB + synchronisation)** : argument différenciant face aux coupures réseau, déjà mis en avant par FloatFlow.
5. **Tableau de bord multi-points consolidé** pour les propriétaires de 2 à 10 kiosques (classement, commissions par point, stock critique).
6. **Ajustement d'inventaire motivé** (casse, perte, erreur) avec validation gérant : sans ça, un écart réel bloque la clôture.

### P1 — 1 à 3 mois

7. **Rapprochement des commissions opérateur** : import du relevé (CSV/PDF) ou saisie du total reçu, comparaison avec les commissions attendues. C'est la douleur n°1 des agents (paiement différé, erreurs).
8. **Prévision de rupture** : vitesse de vente d'unités/float sur 7 jours → date estimée de rupture et quantité à réapprovisionner.
9. **Journal d'audit et rôles fins** : qui a annulé quoi, PIN pour les actions sensibles, verrouillage de la clôture par le gérant.
10. **Reçus clients (WhatsApp/SMS/QR)** et **carnet de crédit client** (petits prêts d'unités très fréquents au comptoir).
11. **Exports comptables** (journal de caisse OHADA/Excel, TVA, par opérateur) — nécessaire dès qu'un comptable entre dans la boucle.
12. **Prise de photo du reçu opérateur + OCR** pour pré-remplir montant/référence et réduire la frappe.
13. **Gestion des transferts d'espèces** (dépôt en banque, coffre, fonds de caisse) : le tableau « où est l'argent ? » doit inclure l'argent sorti de la caisse.

### P2 — 3 à 12 mois

14. **Lecture automatisée des soldes opérateur** (API Wave, Orange Money, MTN) : transforme le rapprochement manuel en contrôle. Coût d'intégration élevé, mais c'est la barrière défensive la plus forte.
15. **Marketplace de float entre agences** (modèle Tanda) ou **partenariat de crédit de float** (modèle Izwe) plutôt qu'un développement autonome.
16. **Conformité BCEAO intégrée** : suivi des plafonds clients, registre des opérations au-dessus des seuils, aide à la déclaration, conservation des preuves.
17. **Multi-pays / multi-devise** (UEMOA puis Guinée, RDC, Cameroun) : attention, les opérateurs et les règles diffèrent fortement.
18. **Matériel** : imprimante thermique Bluetooth, scan de QR, tiroir-caisse — utile mais secondaire face aux priorités logicielles.
19. **Formation intégrée** (tutoriels courts, audio en langues locales) et **mode « un seul bouton »** pour les agents peu à l'aise avec l'écrit.

### À éviter

- **Initier des transactions** (dépôt, retrait, transfert) : cela ferait de Kaisse un prestataire de paiement, avec agrément BCEAO, capital et responsabilité de la fraude.
- **Garantir des commissions** : les barèmes changent ; conserver le couple « estimé / réel » déjà en place.
- **Copier les POS européens** (fidélité, cartes, catalogues) : ce n'est pas le métier d'un point mobile money ivoirien.

## 4 bis. État d'implémentation (novembre 2026)

La feuille de route ci-dessous a été implémentée dans la V2 (branche `arena/19594acb-kaisse`), sans API opérateur et sans casser la V1.

| # | Fonctionnalité | État | Où |
|---|---|---|---|
| 1 | Report du stock de clôture vers l'ouverture suivante | **Partiel** : la clôture conserve un stock final par opérateur et l'ouverture suivante le pré-remplit si la session précédente était suivie ; un comptage reste obligatoire | `Caisse`, `Unités` |
| 2 | Marge réelle sur les unités | **Fait** : barèmes prix d'achat / prix de vente par opérateur, `montant_reglement` sur chaque mouvement, marge et taux effectif affichés | `Unités`, `Réglages` |
| 3 | Alertes + récapitulatif WhatsApp | **Fait** : centre d'alertes et cloche, récap du soir et reçus préparés puis partagés manuellement | toutes les pages |
| 4 | Mode hors ligne (PWA) | **Fait (coquille)** : manifeste installable et service worker qui sert l'application hors ligne ; les données restent locales (démo `localStorage`) ou chez Supabase, sans file de synchronisation | racine, `src/pwa.js` |
| 5 | Tableau de bord multi-points | **Fait** : consolidation par point, résultat, alertes, trésorerie, performance de l'équipe | `Pilotage` |
| 6 | Ajustement d'inventaire motivé | **Fait** : mode « ajustement » de la modale d'unités, motif obligatoire, contrôle de stock, tracé dans l'audit | `Unités` |
| 7 | Rapprochement des commissions | **Fait** : saisie du relevé opérateur, comparaison attendu / constaté / reçu, vue SQL `v_rapprochement_commissions` | `Pilotage`, `Réglages` |
| 8 | Prévision de rupture | **Fait** : moyenne des sorties sur 7 jours, jours de couverture, date de rupture, quantité recommandée, pour unités et float | `Pilotage`, `Unités` |
| 9 | Journal d'audit et rôles | **Fait (partiel)** : journal d'audit (ouverture, clôture, annulation, ajustement, mouvements, crédit, relevé) et rôles existants ; pas encore de PIN sur actions sensibles | `Réglages`, `Clients` |
| 10 | Reçus clients + carnet de crédit | **Fait** : reçu partageable, carnet de crédit (crédit / remboursement / échéance / retard) avec numéros masqués | `Unités`, `Clients` |
| 11 | Exports comptables | **Partiel** : CSV enrichi (montant réglé, marge, bénéficiaire masqué) et PDF imprimable ; pas encore de plan comptable OHADA ni de TVA | `Opérations`, `Unités` |
| 12 | Photo du reçu + OCR | **Non fait** : dépend d'un service externe, hors périmètre V2 | — |
| 13 | Transferts d'espèces | **Fait** : mouvements de caisse (banque, coffre, fonds de caisse, super-agent) intégrés au théorique d'espèces | `Caisse` |
| — | Encaissements marchands QR/lien | **Fait** : journal des encaissements (mode QR, lien, espèces) et totaux par opérateur | `Clients` |

Restent hors périmètre assumé : lecture automatisée des soldes opérateur (P2 #14), marketplace de float (#15), conformité BCEAO automatisée (#16), multi-pays (#17), matériel (#18).

## 5. Positionnement recommandé

> « La caisse et le stock de votre point mobile money, unités incluses — utilisable hors ligne, en français, à 10 000 FCFA par mois. »

Trois axes défendables :

1. **Spécificité unités + float + espèces dans un seul rapprochement** (peu de concurrents le font, aucun en français sur ce segment).
2. **Prix et paiement locaux** (FCFA, mobile money, pas de carte, pas d'engagement).
3. **Confiance** : journal immuable, annulations motivées, exports, aucune promesse de connexion aux opérateurs.

## 6. Sources

- [kaissseapp.vercel.app](https://kaissseapp.vercel.app) — offre, tarifs et périmètre publics de Kaisse.
- [Wakala Max](https://wakalamax.com/) — gestion float/commissions, alertes, multi-branches.
- [FloatFlow](https://asomg-float-flow.vercel.app/) — offline-first, audit, passation de poste.
- [EasyFloat](https://www.easyfloat-tech.com/) — float Nigeria, onboarding WhatsApp.
- [Opareta / Renew Capital](https://www.renewcapital.com/newsroom/press-release-opareta-secures-investment-to-roll-out-comprehensive-mobile-money-operator-solution) et [Afrimoney Agent (Opareta)](https://play.google.com/store/apps/details?id=com.opareta.afrimoneysierraleone&hl=en_US) — outils opérateur, KYC, visites terrain.
- [Tanda Rebalance (IDEO)](https://www.ideo.org/project/rebalance-float-marketplace) — place de marché de float.
- [Izwe Float](https://www.ghanaweb.com/GhanaHomePage/business/Izwe-Float-Empowering-Mobile-Money-agents-with-fast-flexible-access-to-working-capital-2047042) — crédit de float.
- [Plazza POS](https://plazzapos.app/) — caisse/ERP Afrique francophone, OHADA.
- [Wave Business CI](https://simiz.io/blog/ouvrir-compte-marchand-wave-cote-ivoire) — frais et plafonds marchands.
- [SumUp](https://business.usnews.com/point-of-sale/sumup), [Zettle](https://ciroapp.com/compare/sumup-vs-zettle), [Lightspeed](https://www.business.com/reviews/lightspeed-pro/), [Cashlogy](https://cashlogy.com/cashlogy/) — références POS/caisse européennes.
- [Orange CI — transfert de crédit](https://www.orange.ci/fr/comment-transfrer-des-units-ou-du-volume-internet-orange.html) — grille de frais publiée.
- [Kbine Digital](https://kbinedigital.com/transfert-unites) — vente de transferts d'unités 100–50 000 FCFA en CI.
- [TechCabal](https://techcabal.com/2026/10/13/francophone-weekly-by-techcabal-044/) et [Osiris](https://www.osiris.sn/mobile-money-dans-luemoa-ce-que-change-reellement-le-doublement-des-plafonds.html) — réforme BCEAO d'octobre 2026 (plafonds, interopérabilité, exemptions).
