#!/usr/bin/env bash
# =============================================================================
# KAISSE — appliquer la migration 005 en une seule commande, avec contrôles.
#
# Alternative au SQL Editor : utile si vous avez déjà une chaîne de connexion
# PostgreSQL pour votre projet Supabase.
#
#   export DATABASE_URL='postgresql://postgres.<ref>:<mot-de-passe>@aws-0-<region>.pooler.supabase.com:5432/postgres'
#   ./scripts/appliquer-migration-005.sh
#
# La variable DATABASE_URL n'est jamais écrite sur le disque ni affichée par ce
# script : elle reste dans votre terminal. Elle est aussi lue depuis
# SUPABASE_DB_URL si vous préférez ce nom.
#
# Options :
#   --verifier-seulement   ne rien modifier : lance uniquement les contrôles
#   --sans-pause           n'attend pas de confirmation avant d'écrire
# =============================================================================
set -euo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION="$RACINE/supabase/migrations/202611010005_modules_concurrentiels.sql"
AVANT="$RACINE/supabase/verifications/005_avant.sql"
APRES="$RACINE/supabase/verifications/005_apres.sql"

URL="${DATABASE_URL:-${SUPABASE_DB_URL:-}}"
VERIFIER_SEULEMENT=0
SANS_PAUSE=0

for argument in "$@"; do
  case "$argument" in
    --verifier-seulement) VERIFIER_SEULEMENT=1 ;;
    --sans-pause) SANS_PAUSE=1 ;;
    -h|--help) sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Option inconnue : $argument" >&2; exit 2 ;;
  esac
done

die() { echo "✗ $1" >&2; exit 1; }

command -v psql >/dev/null 2>&1 || die "psql introuvable. Installez le client PostgreSQL, ou utilisez Supabase → SQL Editor (voir docs/EXECUTER_MIGRATION_005.md)."
[ -n "$URL" ] || die "DATABASE_URL (ou SUPABASE_DB_URL) n'est pas défini. Voir l'exemple en tête de ce script."
[ -f "$MIGRATION" ] || die "Migration introuvable : $MIGRATION"

# psql affiche un avertissement inutile sur les permissions de .pgpass ; on le tait.
export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-15}"
PSQL=(psql "$URL" --no-psqlrc --set ON_ERROR_STOP=1 --quiet)

echo "→ Connexion au projet…"
${PSQL[@]} -tAc 'select current_database(), current_user;' >/dev/null || die "Connexion impossible. Vérifiez DATABASE_URL (mot de passe encodé en URL si besoin)."

echo
echo "=== 1/3 · Contrôles AVANT (lecture seule) ==="
${PSQL[@]} --file "$AVANT"

echo
echo "=== 2/3 · Application de la migration 005 ==="
if [ "$VERIFIER_SEULEMENT" -eq 1 ]; then
  echo "(--verifier-seulement : migration non exécutée)"
  exit 0
fi

if [ "$SANS_PAUSE" -eq 0 ]; then
  echo
  echo "Cette étape crée 7 tables, 2 colonnes et 1 vue sur la base ciblée."
  echo "Elle est additive, idempotente et s'exécute dans une seule transaction."
  read -r -p "Tapez exactement « oui » pour continuer : " reponse
  [ "$reponse" = "oui" ] || die "Annulé. Rien n'a été modifié."
fi

if ${PSQL[@]} --single-transaction --file "$MIGRATION"; then
  echo "✓ Migration appliquée."
else
  die "La migration a échoué. PostgreSQL a annulé la transaction : la base est intacte. Voir docs/EXECUTER_MIGRATION_005.md §7 (dépannage)."
fi

echo
echo "=== 3/3 · Contrôles APRÈS ==="
${PSQL[@]} --file "$APRES"

echo
echo "✓ Terminé. Comparez les compteurs de la requête 4 avec ceux relevés à l'étape 1."
