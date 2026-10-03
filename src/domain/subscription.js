export const TRIAL_DURATION_DAYS = 14;
export const PAID_PERIOD_DAYS = 30;
const DAY_MS = 86_400_000;

export function getSubscriptionState(agency, now = Date.now()) {
  const status = agency?.statut_abonnement;
  // Agencies created before the trial feature keep their existing access unchanged.
  if (!status) return { mode: "legacy", canWrite: true, daysLeft: null };
  if (status === "actif") {
    const hasEndDate = Boolean(agency.abonnement_termine_le);
    const end = hasEndDate ? new Date(agency.abonnement_termine_le).getTime() : null;
    if (hasEndDate && (!Number.isFinite(end) || end <= now)) {
      return { mode: "expired", reason: "subscription", canWrite: false, daysLeft: 0, end, planCode: agency.plan_abonnement || null };
    }
    return {
      mode: "active",
      reason: "subscription",
      canWrite: true,
      daysLeft: end == null ? null : Math.ceil((end - now) / DAY_MS),
      end,
      planCode: agency.plan_abonnement || null,
    };
  }
  if (status === "essai") {
    const end = agency.essai_termine_le ? new Date(agency.essai_termine_le).getTime() : NaN;
    const remaining = end - now;
    if (!Number.isFinite(end) || remaining <= 0) return { mode: "expired", reason: "trial", canWrite: false, daysLeft: 0, end };
    return { mode: "trial", canWrite: true, daysLeft: Math.ceil(remaining / DAY_MS), end };
  }
  return { mode: "suspended", reason: "suspended", canWrite: false, daysLeft: null };
}
