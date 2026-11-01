import { calculateSession } from "./ledger.js";

function toNumber(value) {
  return Number(value || 0);
}

/**
 * Consolidation par point de vente sur une sélection de sessions.
 *
 * Les soldes « disponibles » (espèces, float, unités) ne cumulent que les
 * sessions ouvertes : les sessions clôturées servent aux écarts et au résultat.
 */
export function buildPointConsolidation({
  points = [],
  sessions = [],
  transactions = [],
  expenses = [],
  sessionFloats = [],
  sessionUnits = [],
  cashMovements = [],
  operators = [],
  thresholds = {},
} = {}) {
  const validTransactions = transactions.filter((transaction) => !transaction.annulee_le);
  const rows = points.map((point) => {
    const pointSessions = sessions.filter((session) => session.point_id === point.id);
    const sessionIds = new Set(pointSessions.map((session) => session.id));
    const pointTransactions = validTransactions.filter((transaction) => sessionIds.has(transaction.session_id));
    const pointExpenses = expenses.filter((expense) => sessionIds.has(expense.session_id));
    const openSessions = pointSessions.filter((session) => session.statut === "ouverte");
    const closedSessions = pointSessions.filter((session) => session.statut === "cloturee");

    const totals = (list) => list.map((session) => calculateSession(
      session,
      sessionFloats,
      transactions,
      expenses,
      sessionUnits,
      operators,
      cashMovements,
    ));

    const openTotals = totals(openSessions);
    const closedTotals = totals(closedSessions);

    const cashExpected = openTotals.reduce((sum, total) => sum + total.cashExpected, 0);
    const floatExpected = openTotals.reduce((sum, total) => sum + total.floatExpected, 0);
    const unitExpected = openTotals.reduce((sum, total) => sum + (total.unitTracked ? total.unitExpected : 0), 0);
    const unitTracked = openTotals.length > 0 && openTotals.every((total) => total.unitTracked);
    const cashVariance = closedTotals.reduce((sum, total) => sum + toNumber(total.cashVariance), 0);
    const floatVariance = closedTotals.reduce((sum, total) => sum + toNumber(total.floatVariance), 0);
    const unitVariance = closedTotals.reduce((sum, total) => sum + toNumber(total.unitVariance), 0);
    const hasVariance = closedTotals.some((total) => total.floatHasDifference || total.unitHasDifference
      || toNumber(total.cashVariance) !== 0);

    const volume = pointTransactions.reduce((sum, transaction) => sum + toNumber(transaction.montant), 0);
    const commissions = pointTransactions.reduce(
      (sum, transaction) => sum + toNumber(transaction.commission_reelle ?? transaction.commission_estimee),
      0,
    );
    const unitMargin = pointTransactions.reduce((sum, transaction) => {
      if (transaction.type_operation !== "transfert_unites" && transaction.type_operation !== "approvisionnement_unites") return sum;
      const settled = toNumber(transaction.montant_reglement ?? transaction.montant);
      return sum + (transaction.type_operation === "transfert_unites" ? settled - toNumber(transaction.montant) : toNumber(transaction.montant) - settled);
    }, 0);
    const expenseTotal = pointExpenses.reduce((sum, expense) => sum + toNumber(expense.montant), 0);

    const unitThreshold = thresholds[point.id] ?? point.seuil_alerte_unites ?? null;
    const alerts = [];
    if (openSessions.length) {
      if (point.seuil_alerte_float && floatExpected < toNumber(point.seuil_alerte_float)) {
        alerts.push({ code: "float", label: "Float sous le seuil" });
      }
      if (unitTracked && unitThreshold != null && unitExpected <= toNumber(unitThreshold)) {
        alerts.push({ code: "unites", label: unitExpected <= 0 ? "Stock d'unités en rupture" : "Stock d'unités bas" });
      }
    }
    if (hasVariance) alerts.push({ code: "ecart", label: "Écart de clôture" });
    if (pointSessions.length && !openSessions.length) alerts.push({ code: "ferme", label: "Aucune session ouverte" });

    return {
      point,
      openSessions: openSessions.length,
      closedSessions: closedSessions.length,
      cashExpected,
      floatExpected,
      unitExpected,
      unitTracked,
      cashVariance,
      floatVariance,
      unitVariance,
      hasVariance,
      volume,
      commissions,
      unitMargin,
      expenses: expenseTotal,
      result: commissions + unitMargin - expenseTotal,
      operations: pointTransactions.length,
      alerts,
      agentIds: Array.from(new Set(pointSessions.map((session) => session.agent_id))),
    };
  });

  const total = (key) => rows.reduce((sum, row) => sum + toNumber(row[key]), 0);
  return {
    rows,
    totals: {
      cashExpected: total("cashExpected"),
      floatExpected: total("floatExpected"),
      unitExpected: total("unitExpected"),
      volume: total("volume"),
      commissions: total("commissions"),
      unitMargin: total("unitMargin"),
      expenses: total("expenses"),
      result: total("result"),
      operations: total("operations"),
      openSessions: total("openSessions"),
      alerts: rows.reduce((sum, row) => sum + row.alerts.length, 0),
    },
    alertCount: rows.reduce((sum, row) => sum + row.alerts.length, 0),
  };
}

/** Performance par agent sur la période sélectionnée. */
export function buildAgentPerformance({ profiles = [], sessions = [], transactions = [] } = {}) {
  const valid = transactions.filter((transaction) => !transaction.annulee_le);
  return profiles.map((profile) => {
    const agentSessions = sessions.filter((session) => session.agent_id === profile.id);
    const sessionIds = new Set(agentSessions.map((session) => session.id));
    const agentTransactions = valid.filter((transaction) => sessionIds.has(transaction.session_id));
    const volume = agentTransactions.reduce((sum, transaction) => sum + toNumber(transaction.montant), 0);
    const commissions = agentTransactions.reduce(
      (sum, transaction) => sum + toNumber(transaction.commission_reelle ?? transaction.commission_estimee),
      0,
    );
    const unitsSold = agentTransactions
      .filter((transaction) => transaction.type_operation === "transfert_unites")
      .reduce((sum, transaction) => sum + toNumber(transaction.montant), 0);
    const lastActivity = agentTransactions.reduce((latest, transaction) => {
      const time = new Date(transaction.created_at).getTime();
      return Number.isFinite(time) && time > latest ? time : latest;
    }, 0);
    return {
      profile,
      sessions: agentSessions.length,
      openSession: agentSessions.some((session) => session.statut === "ouverte"),
      operations: agentTransactions.length,
      volume,
      commissions,
      unitsSold,
      lastActivity: lastActivity || null,
      averageTicket: agentTransactions.length ? Math.round(volume / agentTransactions.length) : 0,
    };
  }).sort((a, b) => b.volume - a.volume);
}

/** Rapprochement des commissions attendues et des relevés opérateur saisis. */
export function buildCommissionReconciliation({ transactions = [], statements = [], operators = [] } = {}) {
  const valid = transactions.filter((transaction) => !transaction.annulee_le);
  return operators.map((operator) => {
    const operatorTransactions = valid.filter((transaction) => transaction.operateur_code === operator.code);
    const expected = operatorTransactions.reduce(
      (sum, transaction) => sum + toNumber(transaction.commission_estimee),
      0,
    );
    const declared = operatorTransactions.reduce(
      (sum, transaction) => sum + toNumber(transaction.commission_reelle),
      0,
    );
    const received = statements
      .filter((statement) => statement.operateur_code === operator.code)
      .reduce((sum, statement) => sum + toNumber(statement.montant_recu), 0);
    return {
      operator,
      transactions: operatorTransactions.length,
      expected,
      declared,
      received,
      gap: received - declared,
      coverage: declared === 0 ? null : Math.round((received / declared) * 100),
    };
  });
}

/** Carnet de crédit client : une ligne par client (nom + numéro masqué + point). */
export function buildCreditBook({ movements = [], today, points = [] } = {}) {
  const pointById = new Map(points.map((point) => [point.id, point]));
  const book = new Map();
  for (const movement of movements) {
    const key = `${movement.point_id}|${(movement.client_nom || "").trim().toLowerCase()}|${movement.client_telephone || ""}`;
    if (!book.has(key)) {
      book.set(key, {
        key,
        nom: movement.client_nom || "Client",
        telephone: movement.client_telephone || "",
        pointId: movement.point_id,
        point: pointById.get(movement.point_id)?.nom || "Point",
        credit: 0,
        repaid: 0,
        balance: 0,
        overdue: 0,
        dueDate: null,
        source: movement.source || "autre",
        lastActivity: movement.created_at || null,
      });
    }
    const row = book.get(key);
    const amount = Number(movement.montant || 0);
    if (movement.sens === "remboursement") row.repaid += amount;
    else row.credit += amount;
    if (movement.created_at && (!row.lastActivity || movement.created_at > row.lastActivity)) row.lastActivity = movement.created_at;
    if (movement.sens !== "remboursement" && movement.echeance && (!row.dueDate || movement.echeance > row.dueDate)) {
      row.dueDate = movement.echeance;
    }
  }
  const rows = Array.from(book.values()).map((row) => {
    const balance = row.credit - row.repaid;
    const overdue = balance > 0 && row.dueDate && today && row.dueDate < today ? balance : 0;
    return { ...row, balance, overdue };
  }).filter((row) => row.credit > 0 || row.repaid > 0)
    .sort((a, b) => b.overdue - a.overdue || b.balance - a.balance);

  const outstanding = rows.reduce((sum, row) => sum + Math.max(0, row.balance), 0);
  const overdueTotal = rows.reduce((sum, row) => sum + row.overdue, 0);
  return {
    rows,
    outstanding,
    overdueTotal,
    overdueCount: rows.filter((row) => row.overdue > 0).length,
    creditTotal: rows.reduce((sum, row) => sum + row.credit, 0),
    repaidTotal: rows.reduce((sum, row) => sum + row.repaid, 0),
  };
}

/** Synthèse des encaissements marchands (QR / lien / espèces). */
export function buildEncaissementSummary(encaissements = []) {
  return {
    rows: encaissements,
    total: encaissements.reduce((sum, row) => sum + toNumber(row.montant), 0),
    commission: encaissements.reduce((sum, row) => sum + toNumber(row.commission), 0),
    count: encaissements.length,
  };
}
