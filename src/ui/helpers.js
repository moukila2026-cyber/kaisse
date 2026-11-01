export function getInitials(profile) {
  return `${profile?.prenom?.[0] || "K"}${profile?.nom?.[0] || ""}`.toUpperCase();
}

export function isManager(user) {
  return user?.role === "proprietaire" || user?.role === "gerant";
}

export function makeErrorMessage(error) {
  const message = error?.message || "Une erreur inattendue est survenue.";
  if (/Invalid login credentials/i.test(message)) return "Email ou mot de passe incorrect.";
  if (/Email not confirmed/i.test(message)) return "Confirmez votre adresse email avant de vous connecter.";
  if (/already registered/i.test(message)) return "Cette adresse email possède déjà un compte. Connectez-vous.";
  if (/duplicate key/i.test(message)) return "Un point portant ce nom existe déjà dans cette agence.";
  if (/does not exist|Could not find the table|schema cache/i.test(message)) {
    return "Cette fonctionnalité nécessite la migration Supabase la plus récente. Exécutez le script SQL indiqué dans docs/SUPABASE_SQL_EDITOR.md.";
  }
  if (/row-level security|permission denied/i.test(message)) return "Action refusée par la sécurité de la base : vérifiez votre rôle dans l'agence.";
  return message;
}

export function safeAmount(value, label, allowZero = false) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0 || (!allowZero && amount === 0)) {
    throw new Error(`${label} doit être un montant entier en FCFA${allowZero ? " (zéro ou plus)" : " supérieur à zéro"}.`);
  }
  return amount;
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  })[character]);
}
