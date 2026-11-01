/**
 * Prévision de rupture et recommandation de réapprovisionnement.
 *
 * Deux trésoreries sont anticipées : le stock d'unités (valeur faciale) et le
 * float électronique par opérateur. La méthode est volontairement simple et
 * explicable à un gérant : moyenne des sorties des N derniers jours, puis
 * nombre de jours de couverture avec le stock actuel.
 */

const DAY_MS = 86_400_000;

function toNumber(value) {
  return Number(value || 0);
}

export function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) return dateString;
  return new Date(date.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

export function dateRange(endDate, days = 7) {
  const safeDays = Math.max(1, Math.round(Number(days) || 1));
  const result = [];
  for (let index = safeDays - 1; index >= 0; index -= 1) result.push(addDays(endDate, -index));
  return result;
}

/**
 * @param {object} input
 * @param {Array<{date: string, consumption: number}>} input.events sorties de stock (positives)
 * @param {number} input.stock stock actuel
 * @param {string} input.endDate dernier jour observé (inclus)
 * @param {number} input.days profondeur d'observation
 * @param {number} input.targetDays couverture visée pour la recommandation
 */
export function buildForecast({ events = [], stock = 0, endDate, days = 7, targetDays = 7 } = {}) {
  const window = dateRange(endDate, days);
  const byDate = new Map(window.map((date) => [date, 0]));
  for (const event of events) {
    if (!byDate.has(event.date)) continue;
    byDate.set(event.date, byDate.get(event.date) + toNumber(event.consumption));
  }
  const series = window.map((date) => ({ date, consumption: byDate.get(date) }));
  const total = series.reduce((sum, point) => sum + point.consumption, 0);
  const averageDaily = total / window.length;
  const currentStock = Math.max(0, toNumber(stock));
  const daysOfCover = averageDaily > 0 ? currentStock / averageDaily : null;
  const ruptureDate = daysOfCover == null ? null : addDays(endDate, Math.floor(daysOfCover));
  const recommended = averageDaily > 0
    ? Math.max(0, Math.ceil(averageDaily * targetDays - currentStock))
    : 0;

  const half = Math.floor(window.length / 2) || 1;
  const recent = series.slice(-half).reduce((sum, point) => sum + point.consumption, 0) / half;
  const previous = series.slice(0, half).reduce((sum, point) => sum + point.consumption, 0) / half;
  const trend = previous === 0 ? (recent > 0 ? 1 : 0) : (recent - previous) / previous;

  let level = "ok";
  if (averageDaily > 0) {
    if (currentStock <= 0) level = "rupture";
    else if (daysOfCover <= 2) level = "critique";
    else if (daysOfCover <= 3) level = "bas";
  } else if (currentStock <= 0) {
    level = "rupture";
  }

  return {
    series,
    averageDaily,
    total,
    days: window.length,
    stock: currentStock,
    daysOfCover,
    ruptureDate,
    recommended,
    trend,
    level,
  };
}

function dateOf(transaction) {
  if (!transaction?.created_at) return null;
  const time = new Date(transaction.created_at);
  if (!Number.isFinite(time.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Abidjan",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(time);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

/** Sorties de stock d'unités par jour et par opérateur (transferts + ajustements sortants). */
export function unitConsumptionEvents(transactions = [], operatorCode) {
  return transactions
    .filter((transaction) => !transaction.annulee_le && transaction.operateur_code === operatorCode)
    .filter((transaction) => transaction.type_operation === "transfert_unites"
      || (transaction.type_operation === "ajustement_unites" && transaction.ajustement_sens === "sortie"))
    .map((transaction) => ({ date: dateOf(transaction), consumption: toNumber(transaction.montant) }))
    .filter((event) => event.date);
}

/** Variation nette du float par jour et par opérateur (négative = consommation). */
export function floatConsumptionEvents(transactions = [], operatorCode, expenses = []) {
  const events = [];
  for (const transaction of transactions) {
    if (transaction.annulee_le) continue;
    const date = dateOf(transaction);
    if (!date) continue;
    const amount = toNumber(transaction.montant);
    if (transaction.type_operation === "depot" || transaction.type_operation === "achat_credit") {
      if (transaction.operateur_code === operatorCode) events.push({ date, consumption: amount });
    } else if (transaction.type_operation === "retrait") {
      if (transaction.operateur_code === operatorCode) events.push({ date, consumption: -amount });
    } else if (transaction.type_operation === "transfert") {
      const destination = transaction.operateur_destination_code;
      if (transaction.operateur_code === operatorCode) events.push({ date, consumption: amount });
      if (destination === operatorCode) events.push({ date, consumption: -amount });
    } else if (transaction.type_operation === "approvisionnement_unites" && transaction.mode_paiement_unites === "wallet") {
      if (transaction.operateur_paiement_code === operatorCode) events.push({ date, consumption: amount });
    } else if (transaction.type_operation === "transfert_unites" && transaction.mode_paiement_unites === "wallet") {
      if (transaction.operateur_paiement_code === operatorCode) events.push({ date, consumption: -amount });
    }
  }
  for (const expense of expenses) {
    if (expense.mode_paiement !== "wallet" || expense.operateur_code !== operatorCode) continue;
    const date = dateOf(expense);
    if (date) events.push({ date, consumption: toNumber(expense.montant) });
  }
  return events;
}

export function buildUnitForecastFor({ operators = [], transactions = [], expenses = [], stock = {}, endDate, days = 7 }) {
  return operators.map((operator) => {
    const currentStock = toNumber(stock[operator.code]?.theorique ?? stock[operator.code]);
    const forecast = buildForecast({
      events: unitConsumptionEvents(transactions, operator.code),
      stock: currentStock,
      endDate,
      days,
    });
    return { ...operator, ...forecast };
  });
}

export function buildFloatForecastFor({ operators = [], transactions = [], expenses = [], floats = {}, endDate, days = 7 }) {
  return operators.map((operator) => {
    const currentFloat = toNumber(floats[operator.code]?.theorique ?? floats[operator.code]);
    const forecast = buildForecast({
      events: floatConsumptionEvents(transactions, operator.code, expenses),
      stock: currentFloat,
      endDate,
      days,
    });
    return { ...operator, ...forecast };
  });
}

export function forecastLabel(level) {
  return {
    rupture: "Rupture",
    critique: "≤ 1 jour",
    bas: "≤ 3 jours",
    ok: "Couvert",
  }[level] || "—";
}
