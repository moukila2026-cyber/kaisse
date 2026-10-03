# KAISSE PRO — conception V1 de A à Z

**Positionnement :** le journal de caisse spécialisé qui permet au gérant d'un point Mobile Money de comparer, à chaque clôture, ce que les opérations laissent théoriquement dans la caisse à ce qui a réellement été compté.

**Promesse prudente :** « Repérez et expliquez plus vite les écarts de votre agence. » Pas « zéro écart », pas « détecte les vols », et pas « solde confirmé par l'opérateur ».

## 1. Le problème que la V1 résout

Un gérant suit plusieurs opérateurs, des dépôts/retraits, les espèces, les dépenses, les commissions et plusieurs agents. Les informations sont réparties entre téléphone, cahier, messages et mémoire. La V1 rassemble ces saisies dans un journal daté et attribué à un agent, puis affiche le calcul qui mène au solde théorique.

Le produit **n'est pas** une application grand public et **n'est pas** un portefeuille Mobile Money. Il n'initie aucun mouvement d'argent et n'interroge pas les systèmes Orange, MTN, Moov ou Wave. Il sert au contrôle interne à partir des opérations et soldes que l'équipe saisit.

## 2. Fonctionnalités exactes — périmètre V1

### Inclus

1. **Espace d'agence** : création d'une agence, ville, premier point et code d'invitation.
2. **Profils et rôles** : propriétaire, gérant, agent. Un agent rejoint avec un code d'agence et son propre compte; il ne reçoit pas le mot de passe du propriétaire.
3. **Points de vente** : création d'un point avec nom, ville et seuil de float configuré.
4. **Ouverture de session** : point, agent connecté, espèces réellement comptées et solde de départ Orange Money, MTN MoMo, Moov Money et Wave.
5. **Transactions manuelles** :
   - dépôt : espèces `+ montant`; float de l'opérateur `− montant`;
   - retrait : espèces `− montant`; float de l'opérateur `+ montant`;
   - transfert entre opérateurs : float source `− montant`, float destinataire `+ montant`, espèces inchangées;
   - achat de crédit/unités : espèces `+ montant`; float de l'opérateur `− montant`.
   Chaque ligne comporte montant entier en FCFA, heure, agent, point, opérateur, référence courte facultative et commissions estimée/réelle.
6. **Commissions** : barème local par opérateur, type et tranche; formule `commission fixe + (montant × points de base / 10 000)`. L'agent peut aussi saisir manuellement le montant réellement constaté. Les deux valeurs sont conservées séparément. Aucun taux opérateur n'est présenté comme officiel.
7. **Dépenses** : catégorie, montant et moyen de paiement (espèces ou portefeuille opérateur). Le moyen choisi détermine quel solde théorique est diminué.
8. **Clôture** : l'agent déclare les espèces comptées et les quatre soldes lus sur les comptes/appareils opérateur. La comparaison est faite par solde, puis additionnée pour un total de float.
9. **Tableau de bord journalier** : volume d'opérations, nombre de lignes, commissions déclarées/estimées, dépenses, résultat indicatif, état de la session, volumes par opérateur et écarts des clôtures.
10. **Rapport** : partage manuel du rapport texte (feuille de partage du téléphone ou lien WhatsApp) et export CSV. Aucun envoi planifié WhatsApp en V1.
11. **Journal d'audit minimal** : pas de suppression physique d'une transaction. Un propriétaire/gérant peut annuler une ligne avec un motif; la ligne reste visible, mais ne contribue plus aux soldes.
12. **Alertes déterministes** : écart déclaré/théorique non nul, commission réelle manquante, float sous le seuil configuré. Pas d'intelligence artificielle ni de détection de fraude.

### Hors périmètre V1 (à ne pas vendre comme disponible)

- Connexion ou API opérateur, lecture automatique des soldes, initiation de dépôts/retraits/transferts.
- Garantie du montant ou du délai de paiement des commissions.
- Comptabilité générale, fiscalité, inventaire, commandes WhatsApp, paie, crédit client.
- Envoi automatique d'un rapport à 20 h, bot WhatsApp ou API WhatsApp Business.
- Détection automatique de fraude, profilage d'un agent ou accusation à partir d'un écart.
- Mode hors ligne avec synchronisation multi-téléphones. La démo fonctionne en local; l'espace Supabase connecté nécessite une connexion Internet. Une file d'attente hors ligne doit être une V1.1 testée avant toute promesse dans une zone réseau instable.

## 3. Règles de calcul à expliquer au client

L'écart suit toujours cette convention :

> **Écart = solde réellement déclaré − solde théorique**

Un écart négatif signifie que le montant déclaré est inférieur au calcul; un écart positif signifie qu'il est supérieur. Cela signale une différence à vérifier, **pas** une fraude ni une cause précise.

### Espèces théoriques d'une session

`espèces ouverture + dépôts + achats de crédit − retraits − dépenses payées en espèces`

### Float théorique par opérateur

`float ouverture + retraits + transferts entrants − dépôts − achats de crédit − transferts sortants − dépenses wallet de cet opérateur`

Un transfert ne modifie pas les espèces. Les commissions ne sont **pas** automatiquement ajoutées à la caisse ou au float : leur règlement peut intervenir séparément. Elles sont suivies à part. Le « résultat estimé » du tableau de bord signifie simplement `commissions réellement saisies − dépenses saisies`; il ne remplace pas une comptabilité certifiée.

### Contrôle de saisie et clôture

- Une opération n'est possible que dans une session ouverte du compte agent.
- Tous les montants sont des entiers positifs en FCFA; l'ouverture et la clôture acceptent zéro.
- Le transfert exige deux opérateurs différents.
- La clôture enregistre les valeurs réellement déclarées; elle ne les remplace pas par les valeurs théoriques.
- Une transaction annulée est exclue des calculs et reste dans le journal avec motif.

## 4. Écrans et parcours

| Écran | Contenu exact | Action principale |
|---|---|---|
| Accueil | Proposition de valeur, périmètre manuel explicite, opérateurs, démo | Essayer la démo / se connecter |
| Connexion & inscription | Connexion, création d'agence, ou rejoindre une agence par code | Ouvrir un compte Supabase |
| Vue d'ensemble | Date/point/session, KPIs du jour, opérations par opérateur, soldes théoriques, dernières lignes, clôtures en écart | Nouvelle opération / ouvrir caisse / rapport |
| Opérations | Journal, commissions estimées/réelles, annulation motivée pour manager, export CSV | Dépôt, retrait, transfert, crédit, dépense |
| Caisse & clôture | Sélecteur de session, ouverture, soldes théoriques, montants déclarés, dépenses, explication de l'écart | Ouvrir, saisir dépense, clôturer |
| Équipe & points | Membres visibles selon le rôle, statut de session, points de vente, code d'invitation | Copier code / ajouter un point |
| Réglages | Profil/agence, règles de commissions, source du barème, avertissement sur les estimations | Ajouter une tranche de barème |
| Modale « Nouvelle opération » | Session, type, opérateur source/destination, montant, commission réelle facultative, référence | Enregistrer dans le journal |
| Modale « Ouverture » | Point, espèces, quatre soldes électroniques | Démarrer la session |
| Modale « Clôture » | Théoriques en lecture seule, champs séparés pour cinq montants réels | Enregistrer la clôture |

### Parcours nominal (agent)

1. Rejoint l'agence avec son compte et le code d'invitation.
2. Sélectionne son point et déclare les cinq soldes au début de la journée.
3. Saisit chaque opération juste après l'avoir effectuée et les dépenses correspondantes.
4. À la fermeture, consulte les soldes réels dans les applications/terminaux opérateur, compte les espèces et clôture.
5. Le gérant examine les écarts, vérifie le journal et peut partager le rapport.

## 5. Base Supabase livrée

Migration : `supabase/migrations/202610030001_kaisse_pro_v1.sql`.

| Table | Rôle / champs métier importants |
|---|---|
| `agences` | Nom, ville, code d'invitation, propriétaire, devise XOF, statut et dates d'essai (migration 002) |
| `profils` | Lien `auth.users`, agence, nom/prénom/téléphone, rôle, actif |
| `operateurs` | Référentiel lecture seule Orange, MTN, Moov, Wave |
| `points` | Agence, nom, ville, seuil float, actif |
| `sessions_caisse` | Agent, point, date, état, espèces d'ouverture et montant déclaré de clôture |
| `soldes_session_operateur` | Un solde d'ouverture et un solde déclaré de clôture par opérateur/session |
| `transactions` | Type, source/destination, principal FCFA, commissions estimée/réelle, référence, horodatage, motif d'annulation |
| `depenses` | Catégorie, montant, espèces/wallet, opérateur si nécessaire, agent/session |
| `commission_baremes` | Agence, opérateur, opération, tranche, fixe, points de base, source, actif |

### Sécurité et intégrité

- RLS est activé sur les tables métier. Les données restent dans l'agence du profil authentifié.
- Un agent ne lit que ses sessions/opérations; propriétaire et gérant voient l'agence.
- L'inscription déclenche la création du profil et, le cas échéant, de l'agence et du premier point.
- La migration 002 donne 14 jours aux **nouvelles agences**. Les agences antérieures gardent les colonnes d'abonnement à `NULL`, restent pleinement actives et ne sont ni mises à jour ni converties en essai.
- À expiration, l'espace d'une nouvelle agence reste consultable et exportable en lecture seule; les données ne sont pas supprimées. La clôture d'une session déjà ouverte reste autorisée.
- Les ouvertures/clôtures sont des fonctions SQL atomiques et vérifient l'agence, le point, le rôle et les montants.
- Les opérations n'ont pas de suppression physique; l'annulation est motivée et contrôlée.
- Le navigateur utilise uniquement l'URL Supabase et la clé publique anon/publishable. **Ne jamais exposer `service_role` dans Vite, Git ou `.env` envoyé au navigateur.**
- Aucun code de barème n'est seedé dans la migration. Faire confirmer chaque tranche localement et conserver sa source/date.
- Activer la confirmation email selon le niveau de risque souhaité; configurer les URL Auth de production; sauvegarder et tester les exports avant pilote.

### Mise en service

1. Créer le projet Supabase.
2. Dans **SQL Editor**, exécuter `202610030001_kaisse_pro_v1.sql`, puis `202610030002_essai_14_jours.sql` (ou utiliser la Supabase CLI).
3. Copier `.env.example` vers `.env.local` et mettre `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.
4. Configurer les URL Auth, démarrer avec `npm run dev`, créer une agence test; vérifier que la date de fin est exactement 14 jours après l'inscription. Créer ensuite un agent test avec le code d'invitation.
5. Vérifier RLS avec deux comptes/agences différents avant d'y saisir des montants client.

Pour un projet Supabase **déjà peuplé**, ne réexécutez pas aveuglément la migration de base. Sauvegardez d'abord et vérifiez le schéma; la migration d'essai suppose que le schéma Kaisse Pro v1 est déjà présent. Elle est additive et ne lance aucun `UPDATE` global. Voir [`SUPABASE_SQL_EDITOR.md`](SUPABASE_SQL_EDITOR.md).

Sans `.env.local`, l'application ouvre une démo modifiable locale, balisée comme fictive. Rien de la démo n'est envoyé à Supabase.

## 6. Modèle économique et prix recommandés

### Tarif public de départ

- **Essai du logiciel : 14 jours gratuits par nouvelle agence**, sans carte bancaire ni prélèvement automatique. Le compte est créé à l'inscription; si le client ne convertit pas, les données restent consultables/exportables en lecture seule après l'essai.
- **Installation & prise en main : 50 000 FCFA par agence**, une fois. Comprend : paramétrage du premier point, configuration des rôles, reprise simple des soldes d'ouverture (pas d'import historique garanti), formation sur place jusqu'à 3 personnes, assistance de démarrage pendant 30 jours. Cette prestation peut être facturée au moment où le client choisit de convertir.
- **Abonnement : 10 000 FCFA par point et par mois**, payable manuellement d'avance après la période d'essai (à partir du jour 15 si le client convertit). Comprend 1 point, jusqu'à 3 accès et les modules V1. Aucun paiement automatique n'est collecté par l'application.
- **Point supplémentaire : 5 000 FCFA/mois**; mise en place supplémentaire facturée 15 000 FCFA si elle nécessite une nouvelle visite/formation.
- **Premiers 10 clients fondateurs à Daloa : 35 000 FCFA d'installation**, puis 10 000 FCFA/mois après l'essai. Remise exceptionnelle de 15 000 FCFA contre rendez-vous de retour d'expérience, sans avis positif imposé. Prix mensuel bloqué 12 mois.

### Pourquoi installation + récurrent

L'essai permet au gérant de vérifier le parcours avant de s'engager; l'installation payante finance le travail de terrain (réglages, formation et support). L'abonnement rémunère l'usage, les sauvegardes et l'assistance continue. L'activation après paiement est manuelle dans cette V1 : l'équipe Kaisse passe le statut de l'agence à `actif` dans Supabase; aucun prélèvement automatique n'est effectué.

Facturer sur reçu, garder une trace des encaissements, préciser durée, échéance, résiliation et traitement des données dans des conditions écrites. Le modèle ci-dessous est du **cash brut encaissé**, pas du bénéfice net et pas un avis fiscal.

## 7. Obtenir les 10 premiers clients à Daloa

### Avant la prospection (2–3 jours)

1. Cartographier 30 points avec opérateurs actifs dans les zones de passage et autour des marchés; noter nom du gérant, horaires, nombre d'agents (déclaré), opérateurs utilisés et moment de clôture.
2. Interroger au moins 20 gérants avant de leur vendre quoi que ce soit. Demander : « Comment faites-vous la clôture ? », « Quel poste vous prend le plus de temps ? », « Comment retrouvez-vous un écart ? », « Qui vérifie les commissions ? », « Que se passe-t-il quand l'agent est absent ? ».
3. Ne collecter aucune donnée client/numéro de téléphone dans la démo. Utiliser le jeu fictif du produit.
4. Choisir 10 partenaires pilotes : gérant accessible, au moins deux opérateurs utilisés, clôture quotidienne et volonté de désigner un agent référent. Prioriser un mix (petit, moyen, plusieurs agents), plutôt que 10 amis qui ne paieront pas.

### Offre pilote fondatrice

**14 jours pour essayer le logiciel sans frais ni carte bancaire.** À la conversion, l'offre fondatrice est de 35 000 FCFA d'installation puis 10 000 FCFA/mois; le premier abonnement est payé manuellement à partir du jour 15. Le gérant peut acheter l'installation accompagnée dès le début ou au moment de la conversion. Démonstration de 15 minutes avec chiffres fictifs, puis configuration avec les soldes que le gérant choisit lui-même. Ne pas demander ses codes PIN/OTP ni prendre le contrôle de ses comptes opérateur.

Le gérant peut ne pas convertir : après 14 jours, ses données restent en lecture seule et exportables; rien n'est supprimé et aucun débit automatique n'a lieu. Ne promettre ni « zéro écart », ni hausse de commission, ni prévention garantie des vols. Promesse mesurable : **chaque ligne est datée, attribuée et rapprochée selon les mouvements saisis**.

### Cadence de terrain sur 14 jours

- **Jours 1–3 :** 20 entretiens courts, comprendre les mots utilisés, tester l'ordre des opérations, relever les raisons de rejet.
- **Jours 4–5 :** corriger le parcours et préparer une fiche A4 + une démo de 5 minutes.
- **Jours 6–10 :** visiter 5 prospects/jour, faire au moins 3 démonstrations sérieuses/jour; proposer un essai au décideur, pas seulement à l'agent.
- **Jours 11–14 :** accompagner les essais, observer une clôture réelle (sans prendre les identifiants des comptes), puis proposer la conversion payante avant expiration.

Cible commerciale (à mesurer, pas à garantir) : 30 contacts qualifiés → 20 entretiens → 12 essais démarrés → 10 conversions payantes. Si le taux de conversion est inférieur, reprendre les entretiens et simplifier l'offre avant d'ajouter des fonctionnalités.

### Script terrain de 30 secondes

> « Bonjour, je teste à Daloa un outil qui note les opérations et compare le solde théorique au montant que vous comptez à la fermeture. Je ne touche pas à vos comptes Mobile Money et l'outil ne lit pas vos soldes automatiquement. Est-ce que vous pouvez me montrer comment vous rapprochez actuellement espèces, float et commissions en fin de journée ? Je vous fais une démo de cinq minutes avec des chiffres fictifs. »

### Onboarding et preuve de valeur

- Jour 0 : démarrer l'essai, installer/raccourci sur le téléphone, créer le point et les accès; accompagner la saisie des soldes avec le gérant.
- Jour 1 : assister la première clôture sans saisir les données à la place de l'agent.
- Jours 3, 7, 12 : appel/WhatsApp manuel de 10 minutes; relever lignes oubliées, erreurs, temps de clôture et suggestions.
- Jour 14 : montrer les usages mesurés; si le gérant choisit de continuer, encaisser installation/abonnement selon le devis puis activer manuellement le statut `actif`. Sinon, laisser les données en lecture seule/exportables sans pression.

Mesures de validation : au moins 8/10 points actifs 5 jours sur 7; au moins 90 % des opérations déclarées saisies le jour même; clôture médiane sous 10 minutes; 7/10 pilotes prêts à payer après l'accompagnement. Si les chiffres ne sont pas atteints, ne pas accélérer l'acquisition : rechercher pourquoi les agents ne saisissent pas.

### Canal de recommandation

Après la deuxième facture payée d'un client référent, crédit de **5 000 FCFA** sur son abonnement pour chaque nouveau point qui souscrit. Plafond et conditions écrits; jamais de commission avant paiement client.

## 8. Plan chiffré pour atteindre 10 millions FCFA encaissés

### Hypothèses de ce scénario cible

- Les 10 premiers points paient 35 000 FCFA d'installation; les suivants 50 000 FCFA.
- Le logiciel est gratuit pendant 14 jours. Les cohortes sont supposées démarrer au début de chaque mois et convertir avant le jour 14; elles paient alors l'installation et le premier mois à 10 000 FCFA/point. Les renouvellements sont payés d'avance.
- Zéro churn, zéro retard de paiement; l'activation est manuelle après encaissement. Une acquisition plus tardive dans le mois repousse une partie des abonnements.
- Encaissements bruts hors impôts, frais commerciaux, déplacements, support, matériel, remboursements et coûts de paiement. Ce n'est **pas une prévision garantie**.

| Mois | Nouveaux points | Points cumulés | Installations encaissées | Abonnements encaissés | Encaissement du mois | Cumul encaissé |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 10 | 10 | 350 000 | 100 000 | 450 000 | 450 000 |
| 2 | 15 | 25 | 750 000 | 250 000 | 1 000 000 | 1 450 000 |
| 3 | 20 | 45 | 1 000 000 | 450 000 | 1 450 000 | 2 900 000 |
| 4 | 25 | 70 | 1 250 000 | 700 000 | 1 950 000 | 4 850 000 |
| 5 | 30 | 100 | 1 500 000 | 1 000 000 | 2 500 000 | 7 350 000 |
| 6 | 35 | 135 | 1 750 000 | 1 350 000 | 3 100 000 | **10 450 000** |
| 7 | 40 | 175 | 2 000 000 | 1 750 000 | 3 750 000 | 14 200 000 |

Avec ces hypothèses très volontaristes, le seuil de 10 M est franchi au **mois 6**, après 135 installations cumulées. Le run-rate récurrent de ces 135 points serait 1,35 M FCFA/mois avant coûts et churn; ce n'est pas du bénéfice net.

### Lecture franche

- **Option mathématique la plus simple :** 200 installations à 50 000 FCFA = 10 M FCFA de frais d'installation seuls. C'est une cible volumique, pas un plan court réaliste sans équipe commerciale.
- **Scénario mixte ci-dessus :** il ajoute les abonnements mais demande 135 conversions en six mois. Il faudra valider le produit à Daloa, puis s'étendre vers Bouaké, Yamoussoukro, Abidjan et d'autres villes avec des références clients et des relais terrain.
- Une baisse de conversion, 10 % de churn, une facturation tardive ou un coût d'installation élevé repousse l'échéance. Suivre le **cash encaissé réel** dans un tableau séparé des ventes signées.
- Si l'on veut accélérer sans multiplier immédiatement les points : vendre un forfait annuel prépayé seulement après validation de la rétention, avec des conditions de remboursement explicites; ne pas compter deux fois les mois inclus dans l'installation.

### Jalons de passage à l'échelle

1. **10 clients à Daloa :** atteindre les mesures d'usage ci-dessus; corriger les irritants.
2. **25 clients :** documenter les barèmes réellement utilisés (source/date), standardiser l'installation et le support.
3. **50 clients :** former un second commercial/onboarder; utiliser uniquement les témoignages autorisés et les chiffres agrégés.
4. **100 clients :** ouvrir des relais dans deux nouvelles villes, formaliser renouvellement, résiliation, sauvegardes et gestion des incidents.
5. **135+ conversions :** l'objectif de 10 M bruts cumulés est franchi dans le scénario cible; comparer au cash réel et aux coûts avant de parler de rentabilité.

## 9. Prochaine version après les pilotes

Priorité à partir des retours : meilleur fonctionnement réseau faible / saisie hors ligne avec synchronisation et gestion des conflits; invitations/permissions plus avancées; historique/export multi-jours; alertes de float plus fines; facture/reçu au client si demandé. WhatsApp automatique ou connexion opérateur ne doit être étudié qu'avec API/autorisation contractuelle, sécurité et modèle économique validés.

## 10. État livré dans ce dépôt

Le dépôt contient une application React/Vite mobile-first avec parcours de démonstration interactif, opérations, barèmes, dépenses, ouverture/clôture et rapports, ainsi que la migration Supabase/RLS et des tests du calcul de caisse. Sans variables Supabase, seules les données de démo locales sont utilisées. Avant un pilote réel, exécuter la migration, tester les rôles/RLS sur un projet de préproduction, confirmer les règles commerciales et faire relire les documents de service/confidentialité.
