export const OPERATION_TYPES = [
  { code: "depot", label: "Dépôt" },
  { code: "retrait", label: "Retrait" },
  { code: "transfert", label: "Transfert float" },
  { code: "achat_credit", label: "Achat crédit via float" },
  { code: "approvisionnement_unites", label: "Approvisionnement unités" },
  { code: "transfert_unites", label: "Transfert d'unités client" },
];

export const COMMISSION_OPERATION_TYPES = OPERATION_TYPES.filter((operation) => operation.code !== "approvisionnement_unites");

export const EXPENSE_CATEGORIES = ["Transport", "Restauration", "Frais opératoires", "Autre"];

export function getReportDateRange(endDate, period = "day") {
  const days = period === "week" ? 7 : period === "month" ? 30 : 1;
  const end = new Date(`${endDate}T00:00:00.000Z`);
  if (!Number.isFinite(end.getTime())) return { startDate: endDate, endDate, days: 1 };
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() - days + 1));
  return { startDate: start.toISOString().slice(0, 10), endDate, days };
}

export function filterReportTransactions(transactions, { type = "tous", operator = "tous", agent = "tous" } = {}) {
  return transactions.filter((transaction) =>
    (type === "tous" || transaction.type_operation === type)
    && (operator === "tous" || transaction.operateur_code === operator || transaction.operateur_destination_code === operator || transaction.operateur_paiement_code === operator)
    && (agent === "tous" || transaction.agent_id === agent),
  );
}

export function todayInAbidjan(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Abidjan",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function formatMoney(value) {
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 })
    .format(Number(value || 0))
    .replace(/[\u00a0\u202f]/g, " ")} F`;
}

export function formatDate(date) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Abidjan",
  }).format(new Date(`${date}T12:00:00Z`));
}

export function formatTime(timestamp) {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Abidjan",
  }).format(new Date(timestamp));
}

export function calculateCommission(transaction, rules = []) {
  const amount = Number(transaction.montant || 0);
  if (amount <= 0) return 0;
  const matchingRule = rules
    .filter((rule) => {
      const min = Number(rule.montant_minimum || 0);
      const max = rule.montant_maximum == null ? Infinity : Number(rule.montant_maximum);
      return rule.actif !== false
        && rule.operateur_code === transaction.operateur_code
        && rule.type_operation === transaction.type_operation
        && amount >= min
        && amount <= max;
    })
    .sort((a, b) => Number(b.montant_minimum || 0) - Number(a.montant_minimum || 0))[0];

  if (!matchingRule) return 0;
  return Math.round(Number(matchingRule.commission_fixe || 0)
    + (amount * Number(matchingRule.taux_points_base || 0)) / 10_000);
}

export function calculateSession(session, sessionFloats = [], transactions = [], expenses = [], sessionUnits = [], operators = []) {
  const activeTransactions = transactions.filter((transaction) =>
    transaction.session_id === session.id && !transaction.annulee_le,
  );
  const activeExpenses = expenses.filter((expense) => expense.session_id === session.id);
  const unitRows = sessionUnits.filter((row) => row.session_id === session.id);
  const unitCodes = operators.length
    ? operators.map((operator) => operator.code)
    : Array.from(new Set(unitRows.map((row) => row.operateur_code)));

  let cashExpected = Number(session.caisse_ouverture || 0);
  const floatMap = Object.fromEntries(sessionFloats
    .filter((row) => row.session_id === session.id)
    .map((row) => [row.operateur_code, {
      ouverture: Number(row.solde_ouverture || 0),
      declare: row.solde_cloture_declare == null ? null : Number(row.solde_cloture_declare),
      theorique: Number(row.solde_ouverture || 0),
    }]));
  const unitMap = Object.fromEntries(unitCodes.map((code) => {
    const openingRow = unitRows.find((row) => row.operateur_code === code);
    const opening = Number(openingRow?.unites_ouverture || 0);
    return [code, {
      ouverture: opening,
      declare: openingRow?.unites_cloture_declare == null ? null : Number(openingRow.unites_cloture_declare),
      theorique: opening,
      suivi: Boolean(openingRow && !openingRow.stock_initial_non_saisi),
    }];
  }));

  for (const transaction of activeTransactions) {
    const amount = Number(transaction.montant || 0);
    switch (transaction.type_operation) {
      case "depot":
      case "achat_credit":
        cashExpected += amount;
        break;
      case "retrait":
        cashExpected -= amount;
        break;
      case "approvisionnement_unites":
        if (transaction.mode_paiement_unites === "especes") cashExpected -= amount;
        break;
      case "transfert_unites":
        if (transaction.mode_paiement_unites === "especes") cashExpected += amount;
        break;
      default:
        break;
    }

    const source = floatMap[transaction.operateur_code];
    const destination = floatMap[transaction.operateur_destination_code];
    if (transaction.type_operation === "depot" || transaction.type_operation === "achat_credit") {
      if (source) source.theorique -= amount;
    } else if (transaction.type_operation === "retrait") {
      if (source) source.theorique += amount;
    } else if (transaction.type_operation === "transfert") {
      if (source) source.theorique -= amount;
      if (destination) destination.theorique += amount;
    } else if (
      (transaction.type_operation === "approvisionnement_unites" || transaction.type_operation === "transfert_unites")
      && transaction.mode_paiement_unites === "wallet"
    ) {
      const paymentWallet = floatMap[transaction.operateur_paiement_code];
      if (paymentWallet) {
        paymentWallet.theorique += transaction.type_operation === "approvisionnement_unites" ? -amount : amount;
      }
    }

    const unitStock = unitMap[transaction.operateur_code];
    if (unitStock && transaction.type_operation === "approvisionnement_unites") unitStock.theorique += amount;
    if (unitStock && transaction.type_operation === "transfert_unites") unitStock.theorique -= amount;
  }

  for (const expense of activeExpenses) {
    const amount = Number(expense.montant || 0);
    if (expense.mode_paiement === "especes") {
      cashExpected -= amount;
    } else if (expense.mode_paiement === "wallet" && floatMap[expense.operateur_code]) {
      floatMap[expense.operateur_code].theorique -= amount;
    }
  }

  const closed = session.statut === "cloturee";
  const cashDeclared = session.caisse_cloture_declaree == null
    ? null
    : Number(session.caisse_cloture_declaree);
  const commissionTransactions = activeTransactions.filter((transaction) => transaction.type_operation !== "approvisionnement_unites");
  const commissionExpected = commissionTransactions.reduce(
    (total, transaction) => total + Number(transaction.commission_estimee || 0), 0,
  );
  const commissionDeclared = commissionTransactions.reduce(
    (total, transaction) => total + Number(transaction.commission_reelle || 0), 0,
  );
  const commissionToVerify = commissionTransactions.filter((transaction) => transaction.commission_reelle == null).length;
  const volume = activeTransactions.reduce((total, transaction) => total + Number(transaction.montant || 0), 0);
  const expenseTotal = activeExpenses.reduce((total, expense) => total + Number(expense.montant || 0), 0);
  const unitRowsTracked = Object.values(unitMap).filter((row) => row.suivi);
  const unitTracked = unitRowsTracked.length === Object.keys(unitMap).length && unitRowsTracked.length > 0;
  const unitExpected = unitRowsTracked.reduce((total, row) => total + row.theorique, 0);
  const unitDeclared = closed && unitTracked
    ? Object.values(unitMap).reduce((total, row) => total + (row.declare ?? 0), 0)
    : null;
  const unitVariance = closed && unitTracked
    ? Object.values(unitMap).reduce((total, row) => total + (row.declare == null ? 0 : row.declare - row.theorique), 0)
    : null;
  const floatHasDifference = closed && Object.values(floatMap).some((row) => row.declare != null && row.declare !== row.theorique);
  const unitHasDifference = closed && Object.values(unitMap).some((row) => row.suivi && row.declare != null && row.declare !== row.theorique);

  return {
    cashExpected,
    cashDeclared,
    cashVariance: closed && cashDeclared != null ? cashDeclared - cashExpected : null,
    floatMap,
    floatExpected: Object.values(floatMap).reduce((total, row) => total + row.theorique, 0),
    floatDeclared: closed
      ? Object.values(floatMap).reduce((total, row) => total + (row.declare ?? 0), 0)
      : null,
    floatVariance: closed
      ? Object.values(floatMap).reduce((total, row) => total + (row.declare == null ? 0 : row.declare - row.theorique), 0)
      : null,
    floatHasDifference,
    unitMap,
    unitExpected,
    unitTracked,
    unitDeclared,
    unitVariance,
    unitHasDifference,
    commissionExpected,
    commissionDeclared,
    commissionToVerify,
    volume,
    operationCount: activeTransactions.length,
    expenseTotal,
    resultEstimate: commissionDeclared - expenseTotal,
  };
}
export function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}
