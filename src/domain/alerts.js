/**
 * Centre d'alertes : une seule liste, triée par gravité, alimentée par le stock,
 * le float, les sessions et les prévisions. Aucune notification n'est envoyée
 * automatiquement : chaque alerte propose une action dans l'application.
 */

const SEVERITY_ORDER = { critique: 0, haute: 1, moyenne: 2, info: 3 };

const DAY_MS = 86_400_000;

function toNumber(value) {
  return Number(value || 0);
}

export function buildAlerts({
  unitStock,
  floatMap = {},
  point,
  subscription,
  forecasts = [],
  sessions = [],
  today,
  credit,
  now = Date.now(),
} = {}) {
  const alerts = [];
  const threshold = point?.seuil_alerte_unites == null ? null : toNumber(point.seuil_alerte_unites);

  for (const row of unitStock?.operators || []) {
    if (!row.suivi) continue;
    if (row.theorique <= 0) {
      alerts.push({
        id: `unites-rupture-${row.code}`,
        code: "unites_rupture",
        severity: "critique",
        title: `Rupture de stock d'unités — ${row.nom}`,
        detail: "Plus aucune vente d'unités possible sur cet opérateur.",
        action: { label: "Approvisionner", page: "unites" },
      });
    } else if (threshold != null && row.theorique <= threshold) {
      alerts.push({
        id: `unites-bas-${row.code}`,
        code: "unites_bas",
        severity: "haute",
        title: `Stock d'unités bas — ${row.nom}`,
        detail: `${row.theorique} F disponibles pour un seuil de ${threshold} F.`,
        action: { label: "Approvisionner", page: "unites" },
      });
    }
  }

  const floatThreshold = point?.seuil_alerte_float == null ? null : toNumber(point.seuil_alerte_float);
  if (floatThreshold != null) {
    for (const [code, row] of Object.entries(floatMap || {})) {
      if (!row) continue;
      const theoretical = toNumber(row.theorique);
      if (theoretical <= 0) {
        alerts.push({
          id: `float-rupture-${code}`,
          code: "float_rupture",
          severity: "critique",
          title: `Float épuisé — ${code}`,
          detail: "Les dépôts seront refusés faute de solde électronique.",
          action: { label: "Voir la caisse", page: "caisse" },
        });
      } else if (theoretical <= floatThreshold) {
        alerts.push({
          id: `float-bas-${code}`,
          code: "float_bas",
          severity: "moyenne",
          title: `Float bas — ${code}`,
          detail: `${theoretical} F théoriques, seuil ${floatThreshold} F.`,
          action: { label: "Voir la caisse", page: "caisse" },
        });
      }
    }
  }

  for (const forecast of forecasts) {
    if (forecast.level === "rupture") continue;
    if (forecast.level === "critique" || forecast.level === "bas") {
      alerts.push({
        id: `prevision-${forecast.code || forecast.nom}`,
        code: "prevision",
        severity: forecast.level === "critique" ? "haute" : "moyenne",
        title: `Rupture prévue — ${forecast.nom}`,
        detail: `Environ ${Math.max(0, Math.floor(forecast.daysOfCover ?? 0))} jour(s) de couverture. Commander ${forecast.recommended} F pour tenir 7 jours.`,
        action: { label: "Planifier", page: "pilotage" },
      });
    }
  }

  const stale = sessions.filter((session) => session.statut === "ouverte"
    && session.date_caisse && session.date_caisse < today
    && now - new Date(session.ouverte_le || `${session.date_caisse}T08:00:00Z`).getTime() > DAY_MS * 1.5);
  if (stale.length) {
    alerts.push({
      id: "sessions-non-cloturees",
      code: "session_oubliee",
      severity: "haute",
      title: `${stale.length} session(s) ouverte(s) depuis plus d'un jour`,
      detail: "Une session non clôturée fausse les soldes et les écarts.",
      action: { label: "Clôturer", page: "caisse" },
    });
  }

  if (credit?.overdueTotal > 0) {
    alerts.push({
      id: "credit-retard",
      code: "credit_retard",
      severity: "moyenne",
      title: `Crédit client en retard : ${credit.overdueTotal} F`,
      detail: `${credit.overdueCount} client(s) au-delà de l'échéance.`,
      action: { label: "Clients", page: "clients" },
    });
  }

  if (subscription && subscription.canWrite === true && subscription.daysLeft != null && subscription.daysLeft <= 5) {
    alerts.push({
      id: "abonnement-bientot",
      code: "abonnement",
      severity: subscription.daysLeft <= 1 ? "haute" : "info",
      title: `Accès à renouveler dans ${subscription.daysLeft} jour(s)`,
      detail: "Après l'échéance, l'espace reste consultable mais la saisie est bloquée.",
      action: { label: "Réglages", page: "reglages" },
    });
  }

  if (subscription && subscription.canWrite === false) {
    alerts.push({
      id: "abonnement-expire",
      code: "abonnement_expire",
      severity: "critique",
      title: "Accès en lecture seule",
      detail: "Période d'essai ou abonnement terminé : la saisie est désactivée côté serveur.",
      action: { label: "Réglages", page: "reglages" },
    });
  }

  return alerts.sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9));
}

export function alertCounts(alerts = []) {
  return alerts.reduce((totals, alert) => {
    totals[alert.severity] = (totals[alert.severity] || 0) + 1;
    return totals;
  }, { critique: 0, haute: 0, moyenne: 0, info: 0 });
}
