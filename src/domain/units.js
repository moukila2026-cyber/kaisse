/**
 * Domaine « unités téléphoniques ».
 *
 * Le stock d'unités est exprimé en valeur faciale FCFA, séparément du float
 * électronique et des espèces. Deux mouvements le font varier :
 *   - approvisionnement_unites : entrée de stock (payée en espèces ou par wallet) ;
 *   - transfert_unites        : sortie de stock vendue à un client.
 *
 * Toutes les fonctions sont pures afin de rester testables sans Supabase.
 */

export const UNIT_OPERATION_TYPES = [
  {
    code: "approvisionnement_unites",
    label: "Approvisionnement d'unités",
    shortLabel: "Approvisionnement",
    direction: "in",
  },
  {
    code: "transfert_unites",
    label: "Transfert d'unités au client",
    shortLabel: "Transfert client",
    direction: "out",
  },
];

export const UNIT_TYPE_CODES = UNIT_OPERATION_TYPES.map((operation) => operation.code);

export const UNIT_LEVELS = {
  rupture: { code: "rupture", label: "Rupture", tone: "red" },
  bas: { code: "bas", label: "Stock bas", tone: "gold" },
  ok: { code: "ok", label: "Disponible", tone: "teal" },
  non_suivi: { code: "non_suivi", label: "Non suivi", tone: "ink" },
};

export function isUnitOperation(transaction) {
  return Boolean(transaction && UNIT_TYPE_CODES.includes(transaction.type_operation));
}

export function unitOperationLabel(code) {
  return UNIT_OPERATION_TYPES.find((operation) => operation.code === code)?.label || code || "—";
}

/** Niveau d'alerte d'un stock par rapport au seuil saisi par l'agence. */
export function unitStockLevel(stock, threshold) {
  const value = Number(stock || 0);
  const limit = threshold == null || threshold === "" ? null : Number(threshold);
  if (value <= 0) return "rupture";
  if (limit == null || !Number.isFinite(limit) || limit <= 0) return "ok";
  return value <= limit ? "bas" : "ok";
}

/**
 * Masque un numéro de bénéficiaire avant enregistrement.
 * On ne conserve que les deux premiers et les deux derniers chiffres :
 * « 07 09 12 34 56 » devient « 07 ** ** 56 ».
 */
export function maskBeneficiary(input) {
  const digits = String(input ?? "").replace(/\D/g, "");
  if (digits.length < 4) return "";
  return `${digits.slice(0, 2)} ** ** ${digits.slice(-2)}`;
}

function toNumber(value) {
  return Number(value || 0);
}

/**
 * Calcule, par opérateur, l'état du stock d'unités sur un ensemble de sessions.
 *
 * @param {object} input
 * @param {Array} input.operators       Référentiel opérateurs (code, nom, couleur).
 * @param {Array} input.sessions        Sessions de caisse dans le périmètre affiché.
 * @param {Array} input.sessionUnits    Lignes soldes_session_unites.
 * @param {Array} input.transactions    Transactions (toutes sessions confondues).
 * @param {object} input.thresholds     Seuil d'alerte par code opérateur.
 */
export function computeUnitStock({ operators = [], sessions = [], sessionUnits = [], transactions = [], thresholds = {} } = {}) {
  const sessionsById = new Map(sessions.map((session) => [session.id, session]));
  const unitRowsBySession = new Map();
  for (const row of sessionUnits) {
    if (!sessionsById.has(row.session_id)) continue;
    if (!unitRowsBySession.has(row.session_id)) unitRowsBySession.set(row.session_id, []);
    unitRowsBySession.get(row.session_id).push(row);
  }

  const movementsBySession = new Map();
  for (const transaction of transactions) {
    if (transaction.annulee_le || !isUnitOperation(transaction)) continue;
    if (!sessionsById.has(transaction.session_id)) continue;
    if (!movementsBySession.has(transaction.session_id)) movementsBySession.set(transaction.session_id, []);
    movementsBySession.get(transaction.session_id).push(transaction);
  }

  const codes = operators.length
    ? operators.map((operator) => operator.code)
    : Array.from(new Set(sessionUnits.map((row) => row.operateur_code)));

  const rows = new Map();
  for (const code of codes) {
    const operator = operators.find((item) => item.code === code) || { code, nom: code, couleur: "#95a0a6" };
    rows.set(code, {
      code,
      nom: operator.nom,
      couleur: operator.couleur,
      ouverture: 0,
      approvisionnements: 0,
      ventes: 0,
      theorique: 0,
      declare: 0,
      ecart: 0,
      commissions: 0,
      mouvements: 0,
      ventesCount: 0,
      approCount: 0,
      trackedSessions: 0,
      untrackedSessions: 0,
      closedTrackedSessions: 0,
      declaredSessions: 0,
      seuil: thresholds[code] == null || thresholds[code] === "" ? null : toNumber(thresholds[code]),
    });
  }

  function openingRowOf(session, code) {
    return (unitRowsBySession.get(session.id) || []).find((row) => row.operateur_code === code);
  }

  function applySession(session, mode) {
    const closed = session.statut === "cloturee";
    const movements = movementsBySession.get(session.id) || [];
    for (const code of codes) {
      const row = rows.get(code);
      if (!row) continue;
      const openingRow = openingRowOf(session, code);
      const tracked = Boolean(openingRow && !openingRow.stock_initial_non_saisi);

      const approved = movements
        .filter((movement) => movement.operateur_code === code && movement.type_operation === "approvisionnement_unites")
        .reduce((sum, movement) => sum + toNumber(movement.montant), 0);
      const sold = movements
        .filter((movement) => movement.operateur_code === code && movement.type_operation === "transfert_unites")
        .reduce((sum, movement) => sum + toNumber(movement.montant), 0);
      const sessionTheoretical = (tracked ? toNumber(openingRow.unites_ouverture) : 0) + approved - sold;

      if (mode === "stock") {
        row.ouverture += tracked ? toNumber(openingRow.unites_ouverture) : 0;
        row.approvisionnements += approved;
        row.ventes += sold;
        row.theorique += sessionTheoretical;
        row.commissions += movements
          .filter((movement) => movement.operateur_code === code)
          .reduce((sum, movement) => sum + toNumber(movement.commission_reelle ?? movement.commission_estimee), 0);
        row.mouvements += movements.filter((movement) => movement.operateur_code === code).length;
        row.approCount += movements.filter((movement) => movement.operateur_code === code
          && movement.type_operation === "approvisionnement_unites").length;
        row.ventesCount += movements.filter((movement) => movement.operateur_code === code
          && movement.type_operation === "transfert_unites").length;
        if (tracked) row.trackedSessions += 1;
        else row.untrackedSessions += 1;
        continue;
      }

      // mode « ecart » : uniquement les sessions clôturées, pour le rapprochement.
      if (!closed || !tracked) continue;
      row.closedTrackedSessions += 1;
      if (openingRow && openingRow.unites_cloture_declare != null) {
        row.declare += toNumber(openingRow.unites_cloture_declare);
        row.declaredSessions += 1;
        row.ecart += toNumber(openingRow.unites_cloture_declare) - sessionTheoretical;
      }
    }
  }

  // Le stock « disponible » ne peut pas additionner des sessions déjà clôturées :
  // leur reliquat a été compté puis repris dans l'ouverture suivante.
  const liveSessions = liveSessionsOf(sessions);
  for (const session of liveSessions) applySession(session, "stock");
  for (const session of sessions) applySession(session, "ecart");

  const operatorRows = Array.from(rows.values()).map((row) => {
    const suivi = liveSessions.length > 0 && row.untrackedSessions === 0;
    return {
      ...row,
      suivi,
      niveau: suivi ? unitStockLevel(row.theorique, row.seuil) : "non_suivi",
      ecart: row.declaredSessions > 0 && row.declaredSessions === row.closedTrackedSessions ? row.ecart : null,
    };
  });

  const totalStock = operatorRows.reduce((sum, row) => sum + row.theorique, 0);
  const totalAppro = operatorRows.reduce((sum, row) => sum + row.approvisionnements, 0);
  const totalVentes = operatorRows.reduce((sum, row) => sum + row.ventes, 0);
  const totalCommissions = operatorRows.reduce((sum, row) => sum + row.commissions, 0);
  const totalMouvements = operatorRows.reduce((sum, row) => sum + row.mouvements, 0);
  const ecartsCalculables = operatorRows.filter((row) => row.ecart != null).length;
  const totalEcart = operatorRows.reduce((sum, row) => sum + toNumber(row.ecart), 0);

  return {
    operators: operatorRows,
    byCode: Object.fromEntries(operatorRows.map((row) => [row.code, row])),
    totalStock,
    totalAppro,
    totalVentes,
    totalCommissions,
    totalMouvements,
    totalEcart: ecartsCalculables ? totalEcart : null,
    ecartsCalculables,
    tracked: operatorRows.length > 0 && operatorRows.every((row) => row.suivi),
    untrackedSessions: operatorRows.reduce((max, row) => Math.max(max, row.untrackedSessions), 0),
    untrackedClosed: sessions
      .filter((session) => session.statut === "cloturee")
      .filter((session) => codes.some((code) => {
        const row = openingRowOf(session, code);
        return !row || row.stock_initial_non_saisi;
      })).length,
    liveSessionIds: liveSessions.map((session) => session.id),
    liveSessionCount: liveSessions.length,
    sessionCount: sessions.length,
    alerts: operatorRows.filter((row) => row.niveau === "rupture" || row.niveau === "bas"),
  };
}

/**
 * Sessions qui portent le stock réellement disponible : les sessions ouvertes.
 * S'il n'y en a aucune, on retombe sur la session la plus récente de chaque point
 * pour afficher le dernier stock connu au lieu de zéro.
 */
function liveSessionsOf(sessions) {
  const open = sessions.filter((session) => session.statut === "ouverte");
  if (open.length || !sessions.length) return open;
  const latestByPoint = new Map();
  for (const session of sessions) {
    const key = session.point_id || "point";
    const stamp = (value) => {
      const time = value ? new Date(value).getTime() : NaN;
      return Number.isFinite(time) ? time : 0;
    };
    const current = latestByPoint.get(key);
    const sessionStamp = Math.max(stamp(session.cloturee_le), stamp(session.ouverte_le), stamp(`${session.date_caisse}T00:00:00Z`));
    if (!current || sessionStamp >= current.stamp) latestByPoint.set(key, { session, stamp: sessionStamp });
  }
  return Array.from(latestByPoint.values()).map((entry) => entry.session);
}

/** Résume les mouvements d'unités d'un journal filtré. */
export function summarizeUnitMovements(transactions = []) {
  const unitTransactions = transactions.filter(isUnitOperation);
  const valid = unitTransactions.filter((transaction) => !transaction.annulee_le);
  const approved = valid
    .filter((transaction) => transaction.type_operation === "approvisionnement_unites")
    .reduce((sum, transaction) => sum + toNumber(transaction.montant), 0);
  const sold = valid
    .filter((transaction) => transaction.type_operation === "transfert_unites")
    .reduce((sum, transaction) => sum + toNumber(transaction.montant), 0);
  const commissions = valid.reduce(
    (sum, transaction) => sum + toNumber(transaction.commission_reelle ?? transaction.commission_estimee),
    0,
  );
  const commissionsToVerify = valid
    .filter((transaction) => transaction.type_operation !== "approvisionnement_unites" && transaction.commission_reelle == null)
    .length;
  const cashIn = valid
    .filter((transaction) => transaction.type_operation === "transfert_unites" && transaction.mode_paiement_unites !== "wallet")
    .reduce((sum, transaction) => sum + toNumber(transaction.montant), 0);
  const cashOut = valid
    .filter((transaction) => transaction.type_operation === "approvisionnement_unites" && transaction.mode_paiement_unites !== "wallet")
    .reduce((sum, transaction) => sum + toNumber(transaction.montant), 0);
  return {
    rows: unitTransactions,
    valid,
    approved,
    sold,
    commissions,
    commissionsToVerify,
    cashIn,
    cashOut,
    netCash: cashIn - cashOut,
    count: unitTransactions.length,
    cancelled: unitTransactions.length - valid.length,
  };
}

/** Un mouvement d'unités est-il autorisé par rapport au stock disponible ? */
export function canSellUnits({ available = 0, amount = 0 }) {
  const stock = Number(available || 0);
  const requested = Number(amount || 0);
  if (!Number.isFinite(requested) || requested <= 0) return { ok: false, message: "Saisissez une valeur d'unités supérieure à zéro." };
  if (requested > stock) {
    return { ok: false, message: `Stock insuffisant : disponible ${stock} FCFA pour cet opérateur.` };
  }
  return { ok: true, message: "" };
}
