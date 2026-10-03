export const TRIAL_DURATION_DAYS = 14;
const DAY_MS = 86_400_000;

export function getSubscriptionState(agency, now = Date.now()) {
  const status = agency?.statut_abonnement;
  // Agencies created before the trial feature keep their existing access unchanged.
  if (!status) return { mode: "legacy", canWrite: true, daysLeft: null };
  if (status === "actif") return { mode: "active", canWrite: true, daysLeft: null };
  if (status === "essai") {
    const end = agency.essai_termine_le ? new Date(agency.essai_termine_le).getTime() : NaN;
    const remaining = end - now;
    if (!Number.isFinite(end) || remaining <= 0) return { mode: "expired", canWrite: false, daysLeft: 0, end };
    return { mode: "trial", canWrite: true, daysLeft: Math.ceil(remaining / DAY_MS), end };
  }
  return { mode: "suspended", canWrite: false, daysLeft: null };
}
