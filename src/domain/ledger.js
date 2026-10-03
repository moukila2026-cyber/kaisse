export const OPERATION_TYPES = [
  { code: "depot", label: "Dépôt" },
  { code: "retrait", label: "Retrait" },
  { code: "transfert", label: "Transfert" },
  { code: "achat_credit", label: "Achat crédit / unités" },
];

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
    && (operator === "tous" || transaction.operateur_code === operator || transaction.operateur_destination_code === operator)
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

export function calculateSession(session, sessionFloats = [], transactions = [], expenses = []) {
  const activeTransactions = transactions.filter((transaction) =>
    transaction.session_id === session.id && !transaction.annulee_le,
  );
  const activeExpenses = expenses.filter((expense) => expense.session_id === session.id);

  let cashExpected = Number(session.caisse_ouverture || 0);
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
      default:
        break;
    }
  }

  const floatMap = Object.fromEntries(sessionFloats
    .filter((row) => row.session_id === session.id)
    .map((row) => [row.operateur_code, {
      ouverture: Number(row.solde_ouverture || 0),
      declare: row.solde_cloture_declare == null ? null : Number(row.solde_cloture_declare),
      theorique: Number(row.solde_ouverture || 0),
    }]));

  for (const transaction of activeTransactions) {
    const amount = Number(transaction.montant || 0);
    const source = floatMap[transaction.operateur_code];
    const destination = floatMap[transaction.operateur_destination_code];

    if (transaction.type_operation === "depot" || transaction.type_operation === "achat_credit") {
      if (source) source.theorique -= amount;
    } else if (transaction.type_operation === "retrait") {
      if (source) source.theorique += amount;
    } else if (transaction.type_operation === "transfert") {
      if (source) source.theorique -= amount;
      if (destination) destination.theorique += amount;
    }
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
  const commissionExpected = activeTransactions.reduce(
    (total, transaction) => total + Number(transaction.commission_estimee || 0), 0,
  );
  const commissionDeclared = activeTransactions.reduce(
    (total, transaction) => total + Number(transaction.commission_reelle || 0), 0,
  );
  const commissionToVerify = activeTransactions.filter((transaction) => transaction.commission_reelle == null).length;
  const volume = activeTransactions.reduce((total, transaction) => total + Number(transaction.montant || 0), 0);
  const expenseTotal = activeExpenses.reduce((total, expense) => total + Number(expense.montant || 0), 0);

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
