# Kaisse Pro — V1

Prototype web mobile-first pour le suivi manuel des opérations et le rapprochement de caisse des points Mobile Money en Côte d'Ivoire.

## Lancer la démo

```bash
npm install
npm run dev
```

Ouvrir l'adresse affichée par Vite, puis choisir **Essayer la démo**. Les données de démonstration sont fictives et restent dans le `localStorage` de ce navigateur. Le bouton **Réinitialiser** remet le jeu d'exemple à zéro.

## Connecter Supabase

1. Créer un projet Supabase.
2. Exécuter dans **SQL Editor**, dans cet ordre : `supabase/migrations/202610030001_kaisse_pro_v1.sql`, puis `supabase/migrations/202610030002_essai_14_jours.sql`.
3. Copier `.env.example` vers `.env.local`, puis renseigner l'URL et la clé **publique anon/publishable** du projet.
4. Dans Supabase Auth, configurer l'URL de redirection de l'application et choisir si les emails doivent être confirmés.
5. Redémarrer le serveur Vite, créer un espace propriétaire, puis partager le code d'équipe avec les agents.

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=...
```

Ne jamais placer une clé `service_role` dans le navigateur. La clé publique n'est sûre qu'avec les politiques RLS de la migration actives. Le schéma n'intègre volontairement aucun barème opérateur : chaque agence doit saisir et vérifier ses propres taux.

La migration essai est additive : les agences déjà présentes gardent `statut_abonnement`, `essai_debute_le` et `essai_termine_le` à `NULL`, restent accessibles et ne sont pas rétroactivement mises en essai. Les nouvelles agences ont 14 jours; après expiration elles passent en lecture seule sans suppression de données. Voir [`docs/SUPABASE_SQL_EDITOR.md`](docs/SUPABASE_SQL_EDITOR.md) avant d'exécuter un script sur un projet déjà utilisé.

## Vérifications

```bash
npm test
npm run lint
npm run build
```

## Périmètre assumé

Kaisse Pro v1 est un journal de saisie et un calculateur de rapprochement : aucune transaction n'est initiée, aucune donnée de solde n'est lue chez les opérateurs, aucune commission n'est garantie et aucun message WhatsApp n'est envoyé automatiquement. L'envoi du rapport est manuel. Voir [`docs/KAISSE_PRO_V1.md`](docs/KAISSE_PRO_V1.md) pour le produit, la base de données et le plan commercial Daloa.
