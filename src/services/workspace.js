import { supabase } from "../supabaseClient.js";

function throwIfError(result) {
  if (result.error) throw result.error;
  return result.data;
}

async function selectAllRows(buildPage, pageSize = 1000) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = throwIfError(await buildPage(offset, offset + pageSize - 1)) || [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

export async function loadWorkspace(userId, date, reportRange = { startDate: date, endDate: date }) {
  if (!supabase) throw new Error("Supabase n'est pas configuré.");

  const profileResult = await supabase
    .from("profils")
    .select("*, agences(*)")
    .eq("id", userId)
    .single();
  const profile = throwIfError(profileResult);
  if (!profile?.agences) {
    throw new Error("Le profil de cette agence est introuvable. Vérifiez la migration Supabase puis reconnectez-vous.");
  }

  const agencyId = profile.agence_id;
  const [pointsResult, profilesResult, operatorsResult, sessionsResult, rulesResult, reportSessionsResult] = await Promise.all([
    supabase.from("points").select("*").eq("agence_id", agencyId).eq("actif", true).order("nom"),
    supabase.from("profils").select("id, nom, prenom, telephone, role, agence_id, actif").eq("agence_id", agencyId).eq("actif", true).order("prenom"),
    supabase.from("operateurs").select("code, nom, couleur, ordre").order("ordre"),
    supabase.from("sessions_caisse").select("*").eq("agence_id", agencyId).eq("date_caisse", date).order("ouverte_le", { ascending: false }),
    supabase.from("commission_baremes").select("*").eq("agence_id", agencyId).eq("actif", true).order("operateur_code"),
    reportRange.startDate === date && reportRange.endDate === date
      ? Promise.resolve(null)
      : selectAllRows((from, to) => supabase.from("sessions_caisse").select("*")
        .eq("agence_id", agencyId)
        .gte("date_caisse", reportRange.startDate)
        .lte("date_caisse", reportRange.endDate)
        .order("date_caisse", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to)),
  ]);
  const points = throwIfError(pointsResult) || [];
  const profiles = throwIfError(profilesResult) || [];
  const operators = throwIfError(operatorsResult) || [];
  const sessions = throwIfError(sessionsResult) || [];
  const commissionRules = throwIfError(rulesResult) || [];
  const reportSessions = reportSessionsResult || sessions;

  const sessionIds = sessions.map((session) => session.id);
  const reportSessionIds = reportSessions.map((session) => session.id);
  let sessionFloats = [];
  let sessionUnits = [];
  let reportTransactions = [];
  let expenses = [];

  if (sessionIds.length) {
    const [floatResult, expensesResult, unitResult] = await Promise.all([
      supabase.from("soldes_session_operateur").select("*").in("session_id", sessionIds),
      supabase.from("depenses").select("*").in("session_id", sessionIds).order("created_at", { ascending: false }),
      supabase.from("soldes_session_unites").select("*").in("session_id", sessionIds),
    ]);
    sessionFloats = throwIfError(floatResult) || [];
    expenses = throwIfError(expensesResult) || [];
    sessionUnits = throwIfError(unitResult) || [];
  }

  if (reportSessionIds.length) {
    const batches = [];
    for (let index = 0; index < reportSessionIds.length; index += 200) {
      batches.push(reportSessionIds.slice(index, index + 200));
    }
    const transactionPages = await Promise.all(batches.map((sessionIdBatch) => selectAllRows((from, to) => supabase
      .from("transactions")
      .select("*")
      .in("session_id", sessionIdBatch)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to))));
    reportTransactions = transactionPages.flat()
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  const sessionIdSet = new Set(sessionIds);
  const transactions = reportTransactions.filter((transaction) => sessionIdSet.has(transaction.session_id));
  const { agences, ...user } = profile;
  return {
    demo: false,
    user,
    agency: agences,
    profiles,
    points,
    operators,
    sessions,
    report_sessions: reportSessions,
    session_floats: sessionFloats,
    session_units: sessionUnits,
    transactions,
    report_transactions: reportTransactions,
    expenses,
    commission_baremes: commissionRules,
  };
}

export async function openCashSession({ pointId, date, cashOpening, openingBalances, unitOpeningBalances }) {
  const result = await supabase.rpc("ouvrir_session_avec_unites", {
    p_point_id: pointId,
    p_date_caisse: date,
    p_caisse_ouverture: Number(cashOpening),
    p_soldes: openingBalances,
    p_unites: unitOpeningBalances,
  });
  return throwIfError(result);
}

export async function closeCashSession({ sessionId, cashDeclared, declaredBalances, declaredUnitBalances }) {
  const result = await supabase.rpc("cloturer_session_avec_unites", {
    p_session_id: sessionId,
    p_caisse_declaree: Number(cashDeclared),
    p_soldes: declaredBalances,
    p_unites: declaredUnitBalances,
  });
  return throwIfError(result);
}

export async function addTransaction(transaction) {
  const result = await supabase.from("transactions").insert(transaction).select().single();
  return throwIfError(result);
}

export async function addExpense(expense) {
  const result = await supabase.from("depenses").insert(expense).select().single();
  return throwIfError(result);
}

export async function addPoint(point) {
  const result = await supabase.from("points").insert(point).select().single();
  return throwIfError(result);
}

export async function addCommissionRule(rule) {
  const result = await supabase.from("commission_baremes").insert(rule).select().single();
  return throwIfError(result);
}

export async function cancelTransaction(transactionId, reason) {
  const result = await supabase
    .from("transactions")
    .update({ annulee_le: new Date().toISOString(), motif_annulation: reason })
    .eq("id", transactionId)
    .select()
    .single();
  return throwIfError(result);
}
