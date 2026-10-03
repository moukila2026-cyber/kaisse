# KAISSE PRO — conception V1 de A à Z

**Positionnement :** le journal de caisse spécialisé qui permet au gérant d'un point Mobile Money de comparer, à chaque clôture, ce que les opérations laissent théoriquement dans la caisse à ce qui a réellement été compté.

**Promesse prudente :** « Repérez et expliquez plus vite les écarts de votre agence. » Pas « zéro écart », pas « détecte les vols », et pas « solde confirmé par l'opérateur ».

## 1. Le problème que la V1 résout

Un gérant suit plusieurs opérateurs, des dépôts/retraits, les espèces, les dépenses, les commissions et plusieurs agents. Les informations sont réparties entre téléphone, cahier, messages et mémoire. La V1 rassemble ces saisies dans un journal daté et attribué à un agent, puis affiche le calcul qui mène au solde théorique.

Le produit **n'est pas** une application grand public et **n'est pas** un portefeuille Mobile Money. Il n'initie aucun mouvement d'argent et n'interroge pas les systèmes Orange, MTN, Moov ou Wave. Il sert au contrôle interne à partir des opérations et soldes que l'équipe saisit.

## 2. Fonctionnalités exactes — périmètre V1

### Inclus

1. **Espace d'agence** : inscription du propriétaire, création d'une agence, ville, premier point et code d'invitation à 8 caractères sans `0/O/1/I/L`.
2. **Profils et rôles** : propriétaire, gérant, agent. Le propriétaire crée l'espace; le gérant invité rejoint avec son propre compte au moyen d'un code d'invitation de 8 caractères sans `0/O/1/I/L`. Le mot de passe de création accepte 6 caractères minimum; il ne reçoit pas celui du propriétaire.
3. **Points de vente** : création d'un point avec nom, ville et seuil de float configuré.
4. **Ouverture de session** : point, utilisateur connecté, espèces et float réellement comptés, plus stock initial d'unités par opérateur. Le propriétaire, le gérant ou l'agent saisit uniquement dans sa propre session.
5. **Transactions manuelles** :
   - dépôt : espèces `+ montant`; float de l'opérateur `− montant`;
   - retrait : espèces `− montant`; float de l'opérateur `+ montant`;
   - transfert de float entre opérateurs : float source `− montant`, float destinataire `+ montant`, espèces inchangées;
   - achat de crédit via float : espèces `+ montant`; float de l'opérateur `− montant`;
   - approvisionnement du stock téléphonique : stock de l'opérateur `+ valeur faciale`; espèces ou wallet de paiement `− même montant`;
   - transfert d'unités au client : stock du fournisseur `− valeur faciale`; espèces ou wallet encaissé `+ même montant`.
   Chaque ligne comporte montant entier en FCFA, heure, utilisateur, point, opérateur, référence courte facultative et, lorsque pertinent, commissions estimée/réelle. Le stock d'unités est une valeur faciale FCFA, pas un nombre de cartes/SIM ni un inventaire multi-référence.
6. **Commissions** : barème local par opérateur, type et tranche; formule `commission fixe + (montant × points de base / 10 000)`. L'utilisateur peut aussi saisir manuellement le montant réellement constaté pour les opérations commissionnables. L'approvisionnement du stock n'est pas commissionné par défaut. Aucun taux opérateur n'est présenté comme officiel.
7. **Dépenses** : catégorie, montant et moyen de paiement (espèces ou portefeuille opérateur). Le moyen choisi détermine quel solde théorique est diminué.
8. **Clôture** : chaque utilisateur déclare les espèces, les quatre soldes de float et le stock d'unités réellement comptés sur sa session. Les écarts sont calculés par opérateur; le stock d'unités est rapproché séparément du float.
9. **Tableau de bord journalier** : volume d'opérations, nombre de lignes, commissions déclarées/estimées, dépenses, résultat indicatif, état de la session, volumes par opérateur et écarts des clôtures.
10. **Rapport** : partage manuel du rapport texte, export CSV ou PDF imprimable; filtres période (jour/7/30 jours), type, opérateur et agent. Aucun envoi planifié WhatsApp en V1.
11. **Journal d'audit minimal** : aucune suppression physique d'une transaction. Un agent ne peut ni supprimer ni annuler un transfert d'argent ou d'unités, quel que soit l'opérateur; la base refuse aussi les suppressions directes. Un propriétaire/gérant peut annuler une ligne avec un motif; elle reste visible dans le journal, mais ne contribue plus aux soldes.
12. **Alertes déterministes** : écart déclaré/théorique non nul, commission réelle manquante, float sous le seuil configuré et stock historique non suivi. Pas d'intelligence artificielle ni de détection de fraude.

### Hors périmètre V1 (à ne pas vendre comme disponible)

- Connexion ou API opérateur, lecture automatique des soldes, initiation de dépôts/retraits/transferts.
- Garantie du montant ou du délai de paiement des commissions.
- Comptabilité générale, fiscalité, inventaire multi-référence/quantités unitaires, commandes WhatsApp, paie, crédit client. Le stock V1 ne suit que la valeur faciale FCFA par opérateur.
- Envoi automatique d'un rapport à 20 h, bot WhatsApp ou API WhatsApp Business.
- Détection automatique de fraude, profilage d'un agent ou accusation à partir d'un écart.
- Mode hors ligne avec synchronisation multi-téléphones. La démo fonctionne en local; l'espace Supabase connecté nécessite une connexion Internet. Une file d'attente hors ligne doit être une V1.1 testée avant toute promesse dans une zone réseau instable.

## 3. Règles de calcul à expliquer au client

L'écart suit toujours cette convention :

> **Écart = solde réellement déclaré − solde théorique**

Un écart négatif signifie que le montant déclaré est inférieur au calcul; un écart positif signifie qu'il est supérieur. Cela signale une différence à vérifier, **pas** une fraude ni une cause précise.

### Espèces théoriques d'une session

`espèces ouverture + dépôts + achats de crédit + transferts d'unités payés en espèces − retraits − approvisionnements d'unités payés en espèces − dépenses payées en espèces`

### Float théorique par opérateur

`float ouverture + retraits + transferts entrants + règlements clients d'unités reçus sur ce wallet − dépôts − achats de crédit − transferts sortants − approvisionnements payés depuis ce wallet − dépenses wallet de cet opérateur`

Le stock théorique d'un opérateur est `stock initial + approvisionnements − transferts clients`; il est distinct du float et le contrôle d'insertion bloque un transfert client supérieur au stock disponible. Par convention, l'approvisionnement/transfert utilise un montant unique : valeur faciale FCFA et règlement espèces/wallet sont supposés égaux. Les bonus, remises ou prix différents ne sont pas ventilés dans cette version. Un transfert de float ne modifie pas les espèces. Les commissions ne sont **pas** automatiquement ajoutées à la caisse ou au float : leur règlement peut intervenir séparément. Elles sont suivies à part. Le « résultat estimé » du tableau de bord signifie simplement `commissions réellement saisies − dépenses saisies`; il ne remplace pas une comptabilité certifiée.

### Contrôle de saisie et clôture

- Toute opération et tout comptage de stock s'effectuent dans la session ouverte de l'utilisateur connecté; le propriétaire ne saisit pas au nom d'un agent.
- Tous les montants sont des entiers FCFA; les mouvements sont positifs et l'ouverture/clôture accepte zéro. Les stocks sont saisis en valeur faciale FCFA.
- Le transfert exige deux opérateurs différents.
- La clôture enregistre les valeurs réellement déclarées; elle ne les remplace pas par les valeurs théoriques. Une session historique sans stock initial ne reçoit pas un faux écart : son comptage de clôture est marqué non suivi.
- Une transaction annulée est exclue des calculs et reste dans le journal avec motif.

## 4. Écrans et parcours

| Écran | Contenu exact | Action principale |
|---|---|---|
| Accueil | Proposition de valeur, périmètre manuel explicite, opérateurs, démo | Essayer la démo / se connecter |
| Connexion & inscription | Connexion, création d'agence, ou rejoindre une agence par code | Ouvrir un compte Supabase |
| Vue d'ensemble | Date/point/session, KPIs du jour, opérations par opérateur, soldes théoriques et toutes les transactions du jour sélectionné avec date, heure, agent et opérateur; clôtures en écart | Nouvelle opération / ouvrir caisse / rapport |
| Opérations | Journal filtrable par période, type, opérateur et agent; règlement des mouvements d'unités; commissions estimées/réelles; annulation motivée pour manager; export CSV ou PDF imprimable | Dépôt, retrait, transfert float, approvisionnement/transfert d'unités, dépense |
| Caisse & clôture | Sélecteur de session, soldes théoriques espèces/float, stock d'unités par opérateur, comptages réels et écarts distincts | Ouvrir, saisir dépense, clôturer sa session |
| Équipe & points | Membres visibles selon le rôle, statut de session, points de vente, code d'invitation | Copier code / ajouter un point |
| Réglages | Profil/agence, règles de commissions, source du barème, avertissement sur les estimations | Ajouter une tranche de barème |
| Modale « Nouvelle opération » | Session personnelle, type, opérateur float ou stock, règlement espèces/wallet pour les unités, montant, commission si pertinente, référence | Enregistrer dans sa session |
| Modale « Ouverture » | Point, espèces, quatre soldes électroniques et stock initial d'unités par opérateur (valeur faciale FCFA) | Démarrer sa session |
| Modale « Clôture » | Théoriques en lecture seule, espèces, quatre floats et stocks réels par opérateur | Clôturer sa session |

### Parcours nominal (agent)

1. Le gérant rejoint l'agence avec son compte et le code d'invitation; le propriétaire conserve un compte séparé.
2. Sélectionne son point et déclare espèces, quatre floats et stock téléphonique initial à l'ouverture de sa session.
3. Saisit chaque opération dans sa propre session : l'approvisionnement augmente le stock et débite espèces/float; un transfert au client baisse le stock et crédite espèces/float.
4. À la fermeture, consulte les soldes réels, compte espèces et unités par opérateur, puis clôture sa session.
5. Le gérant examine les écarts, vérifie le journal et peut partager le rapport.

## 5. Base Supabase livrée

Migrations : `supabase/migrations/202610030001_kaisse_pro_v1.sql`, `202610030002_essai_14_jours.sql`, puis `202610030003_stock_unites.sql` (stock téléphonique).

| Table | Rôle / champs métier importants |
|---|---|
| `agences` | Nom, ville, code d'invitation, propriétaire, devise XOF, statut, dates d'essai, plan et échéance payée (migration 002) |
| `profils` | Lien `auth.users`, agence, nom/prénom/téléphone, rôle, actif |
| `operateurs` | Référentiel lecture seule Orange, MTN, Moov, Wave |
| `points` | Agence, nom, ville, seuil float, actif |
| `sessions_caisse` | Agent, point, date, état, espèces d'ouverture et montant déclaré de clôture |
| `soldes_session_operateur` | Un solde d'ouverture et un solde déclaré de clôture par opérateur/session |
| `soldes_session_unites` | Valeur faciale FCFA du stock d'unités à l'ouverture et au comptage de clôture; indicateur des sessions historiques sans stock initial suivi (migration 003) |
| `transactions` | Type, source/destination, montant FCFA, règlement du mouvement d'unités (espèces/wallet), commissions, référence, horodatage, motif d'annulation |
| `depenses` | Catégorie, montant, espèces/wallet, opérateur si nécessaire, agent/session |
| `commission_baremes` | Agence, opérateur, opération, tranche, fixe, points de base, source, actif |

### Sécurité et intégrité

- RLS est activé sur les tables métier. Les données restent dans l'agence du profil authentifié.
- Le client ne peut pas écrire les champs d'abonnement ni modifier un rôle/un rattachement d'agence; l'opérateur active le paiement dans SQL après confirmation. Les modifications métier autorisées aux gérants restent soumises à l'échéance.
- Un agent ne lit que ses sessions/opérations; propriétaire et gérant voient l'agence. Le tableau de bord manager affiche toutes les transactions du jour sélectionné avec leur date/heure et l'agent associé; le journal conserve les filtres de période et d'agent. Les opérations et comptages restent liés à la session de l'utilisateur connecté; le propriétaire ne peut pas saisir un mouvement au nom d'un agent. La clôture de stock est également réservée au propriétaire/agent de sa propre session.
- Les suppressions de transactions sont interdites en base; les mises à jour sont limitées aux champs d'annulation. Seuls les propriétaires/gérants autorisés peuvent annuler avec motif; l'agent ne peut pas annuler ni supprimer un transfert d'argent ou d'unités.
- L'inscription déclenche la création du profil et, le cas échéant, de l'agence et du premier point.
- La migration 002 donne 14 jours aux **nouvelles agences**. Les agences antérieures gardent les colonnes d'abonnement à `NULL`, restent pleinement actives et ne sont ni mises à jour ni converties en essai.
- Les périodes Starter/Pro peuvent être activées manuellement pour 30 jours. À l'expiration de l'essai ou de la période payée, l'espace reste consultable et exportable en lecture seule; les données ne sont pas supprimées. La clôture d'une session déjà ouverte reste autorisée.
- Le paiement SasPay et son webhook ne sont pas intégrés dans ce dépôt; il faut confirmer manuellement le règlement avant de renseigner le plan et son échéance.
- Les ouvertures/clôtures sont des fonctions SQL atomiques et vérifient l'agence, le point, les montants et la session personnelle. La migration 003 bloque côté base les transferts clients au-delà du stock disponible et empêche l'annulation d'un approvisionnement qui rendrait ce stock négatif.
- Les opérations n'ont pas de suppression physique; l'annulation est motivée et contrôlée.
- Le navigateur utilise uniquement l'URL Supabase et la clé publique anon/publishable. **Ne jamais exposer `service_role` dans Vite, Git ou `.env` envoyé au navigateur.**
- Aucun code de barème n'est seedé dans la migration. Faire confirmer chaque tranche localement et conserver sa source/date.
- Activer la confirmation email selon le niveau de risque souhaité; configurer les URL Auth de production; sauvegarder et tester les exports avant pilote.

### Mise en service

1. Créer le projet Supabase.
2. Dans **SQL Editor**, exécuter `202610030001_kaisse_pro_v1.sql`, puis `202610030002_essai_14_jours.sql`, puis `202610030003_stock_unites.sql` (ou utiliser la Supabase CLI). Si 001 et 002 sont déjà présentes, exécuter uniquement 003.
3. Copier `.env.example` vers `.env.local` et mettre `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.
4. Configurer les URL Auth, démarrer avec `npm run dev`, créer une agence test; vérifier que la date de fin est exactement 14 jours après l'inscription. Créer ensuite un agent test avec le code d'invitation.
5. Vérifier RLS avec deux comptes/agences différents avant d'y saisir des montants client.

Pour un projet Supabase **déjà peuplé**, ne réexécutez pas aveuglément la migration de base. Sauvegardez d'abord et vérifiez le schéma; la migration d'essai suppose que le schéma Kaisse Pro v1 est déjà présent. Elle est additive et ne lance aucun `UPDATE` global. Voir [`SUPABASE_SQL_EDITOR.md`](SUPABASE_SQL_EDITOR.md).

Sans `.env.local`, l'application ouvre une démo modifiable locale, balisée comme fictive. Rien de la démo n'est envoyé à Supabase. La migration 003 ne backfill aucun stock historique : les sessions clôturées antérieures sont marquées non suivies; les sessions ouvertes déjà en cours doivent être clôturées puis remplacées par une nouvelle session avec stock initial avant d'utiliser le suivi des unités.

## 6. Modèle économique et tarifs de référence

Les tarifs ci-dessous reprennent les offres publiques observées sur [`kaissseapp.vercel.app`](https://kaissseapp.vercel.app). Ils remplacent l'ancien scénario « frais d'installation + prix par point » de ce document.

- **Essai : 14 jours par nouvelle agence**, sans carte et sans prélèvement automatique. Les agences déjà inscrites avant activation de l'essai conservent leur accès et leurs données inchangés.
- **Starter : 10 000 FCFA par période de 30 jours**, jusqu'à 3 agents.
- **Pro : 25 000 FCFA par période de 30 jours**, agents illimités.
- Le paiement est annoncé via **SasPay**, par période de 30 jours, sans renouvellement automatique. Le client choisit s'il renouvelle; les conditions d'échéance et de remboursement doivent être communiquées avant paiement.
- À la fin de l'essai ou d'une période payée non renouvelée, les données restent conservées et consultables/exportables en lecture seule; aucune suppression n'est effectuée.

**État technique dans ce dépôt :** l'application gère l'essai et les périodes payées à échéance, mais aucun checkout SasPay ni webhook n'est configuré ici. L'encaissement et l'activation du forfait doivent donc être confirmés manuellement par l'équipe Kaisse. Les identifiants SasPay et le projet Vercel de référence ne sont pas fournis à ce dépôt; ne pas présenter le paiement comme intégré.

La migration 002 conserve les colonnes historiques nulles des agences déjà présentes. Elle ajoute aussi `plan_abonnement` (`starter` ou `pro`) et `abonnement_termine_le`; ces champs sont nuls par défaut et ne changent pas les droits existants. Une activation payée saisit le plan et une échéance de 30 jours sur **une agence vérifiée**. Une période déjà échue bloque les nouvelles écritures, sans bloquer la lecture, l'export ou la clôture d'une session déjà ouverte.

Le modèle ci-dessous estime le **cash brut encaissé**, pas le bénéfice net : il ne déduit ni frais SasPay, ni fiscalité, support, déplacements, hébergement, remboursements ou impayés. Il est indicatif, pas une prévision garantie.

## 7. Obtenir les 10 premiers clients à Daloa

### Avant la prospection (2–3 jours)

1. Cartographier 30 points avec opérateurs actifs dans les zones de passage et autour des marchés; noter nom du gérant, horaires, nombre d'agents (déclaré), opérateurs utilisés et moment de clôture.
2. Interroger au moins 20 gérants avant de leur vendre quoi que ce soit. Demander : « Comment faites-vous la clôture ? », « Quel poste vous prend le plus de temps ? », « Comment retrouvez-vous un écart ? », « Qui vérifie les commissions ? », « Que se passe-t-il quand l'agent est absent ? ».
3. Ne collecter aucune donnée client/numéro de téléphone dans la démo. Utiliser le jeu fictif du produit.
4. Choisir 10 partenaires pilotes : gérant accessible, au moins deux opérateurs utilisés, clôture quotidienne et volonté de désigner un agent référent. Prioriser un mix (petit, moyen, plusieurs agents), plutôt que 10 amis qui ne paieront pas.

### Offre pilote fondatrice

**14 jours pour essayer le logiciel sans frais ni carte bancaire.** À la conversion, le gérant choisit Starter (10 000 FCFA/30 jours, jusqu'à 3 agents) ou Pro (25 000 FCFA/30 jours, agents illimités). Le renouvellement est volontaire, sans prélèvement automatique; l'offre publique annonce SasPay. Dans cette version, l'équipe Kaisse confirme manuellement le règlement et l'activation. Faire une démonstration de 15 minutes avec des chiffres fictifs, puis configurer les soldes choisis par le gérant. Ne jamais demander ses codes PIN/OTP ni prendre le contrôle de ses comptes opérateur.

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
- Jour 14 : montrer les usages mesurés; si le gérant choisit de continuer, confirmer le règlement SasPay hors application puis activer manuellement le forfait choisi pour 30 jours. Sinon, laisser les données en lecture seule/exportables sans pression.

Mesures de validation : au moins 8/10 points actifs 5 jours sur 7; au moins 90 % des opérations déclarées saisies le jour même; clôture médiane sous 10 minutes; 7/10 pilotes prêts à payer après l'accompagnement. Si les chiffres ne sont pas atteints, ne pas accélérer l'acquisition : rechercher pourquoi les agents ne saisissent pas.

### Canal de recommandation

Tester les recommandations après les pilotes, sans modifier les tarifs publics ni annoncer de remise avant validation. Toute récompense éventuelle doit être plafonnée, écrite et versée uniquement après confirmation du paiement du nouveau client.

## 8. Scénario indicatif pour 10 millions FCFA encaissés

### Hypothèses du scénario (volontaristes)

- 70 % des agences converties prennent Starter à 10 000 FCFA/30 jours et 30 % prennent Pro à 25 000 FCFA/30 jours, soit un prix moyen pondéré de **14 500 FCFA par agence et par période**.
- Nouveaux essais : 10, 15, 20, 25, 30, 35, 40 et 45 par mois. Toutes les agences convertissent après 14 jours, paient et renouvellent; aucun churn ni retard.
- Les cohortes sont supposées démarrer au début de chaque cycle de 30 jours et payer une fois à la fin de l'essai, puis chaque période. Le tableau simplifie les échéances en mois de projection.
- Aucun frais d'installation n'est inclus, conformément aux deux tarifs publics présentés. Encaissements bruts hors frais SasPay, coûts commerciaux, support, impôts, hébergement, remboursement et impayés. Ce n'est **pas une prévision garantie**.

| Cycle | Nouveaux essais | Agences payantes cumulées | Encaissement estimé du cycle | Cumul brut |
|---:|---:|---:|---:|---:|
| 1 | 10 | 10 | 145 000 | 145 000 |
| 2 | 15 | 25 | 362 500 | 507 500 |
| 3 | 20 | 45 | 652 500 | 1 160 000 |
| 4 | 25 | 70 | 1 015 000 | 2 175 000 |
| 5 | 30 | 100 | 1 450 000 | 3 625 000 |
| 6 | 35 | 135 | 1 957 500 | 5 582 500 |
| 7 | 40 | 175 | 2 537 500 | 8 120 000 |
| 8 | 45 | 220 | 3 190 000 | **11 310 000** |

Avec 100 % de conversion/renouvellement et cette forte acquisition, le seuil de 10 M FCFA bruts serait dépassé au cycle 8, après 220 agences cumulées. À 135 agences actives, le chiffre d'affaires récurrent théorique serait d'environ 1 957 500 FCFA par période de 30 jours avant frais, churn et impôts — ce n'est pas le bénéfice net.

### Lecture franche

- Ce résultat dépend beaucoup plus du nombre d'agences payantes, du taux de conversion et de la rétention que d'un frais d'installation qui n'apparaît pas dans l'offre de référence.
- Une conversion de 50 %, un mix plus orienté Starter, des paiements tardifs ou du churn repoussent fortement l'objectif. Tenir un suivi séparé des essais, contrats, paiements confirmés, dates d'échéance et montants réellement encaissés.
- Valider d'abord la rétention et les coûts de support à Daloa; ne pas présenter ces encaissements bruts comme revenu garanti ou rentabilité.

### Jalons de passage à l'échelle

1. **10 pilotes :** mesurer la fréquence d'usage, la part des opérations saisies le jour même et le temps de clôture.
2. **25 agences payantes :** vérifier le mix Starter/Pro, les renouvellements et les demandes de support.
3. **50 agences :** standardiser l'accueil, les conditions de paiement et la gestion manuelle des échéances.
4. **100 agences :** valider les coûts d'acquisition, la qualité des exports et les besoins d'opération.
5. **220 agences actives :** objectif théorique de 10 M FCFA bruts cumulés au cycle 8 selon les seules hypothèses ci-dessus; rapprocher les chiffres des encaissements réels.

## 9. Prochaine version après les pilotes

Priorité à partir des retours : meilleur fonctionnement réseau faible / saisie hors ligne avec synchronisation et gestion des conflits; invitations/permissions plus avancées; historique/export multi-jours; alertes de float plus fines; facture/reçu au client si demandé. WhatsApp automatique ou connexion opérateur ne doit être étudié qu'avec API/autorisation contractuelle, sécurité et modèle économique validés.

## 10. État livré dans ce dépôt

Le dépôt contient une application React/Vite mobile-first avec parcours de démonstration interactif, opérations, barèmes, dépenses, ouverture/clôture et rapports, ainsi que la migration Supabase/RLS et des tests du calcul de caisse. Sans variables Supabase, seules les données de démo locales sont utilisées. Avant un pilote réel, exécuter la migration, tester les rôles/RLS sur un projet de préproduction, confirmer les règles commerciales et faire relire les documents de service/confidentialité.
