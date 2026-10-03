import { supabase } from "../supabaseClient.js";

function throwIfError(result) {
  if (result.error) throw result.error;
  return result.data;
}

export async function loadWorkspace(userId, date) {
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
  const [pointsResult, profilesResult, operatorsResult, sessionsResult, rulesResult] = await Promise.all([
    supabase.from("points").select("*").eq("agence_id", agencyId).eq("actif", true).order("nom"),
    supabase.from("profils").select("id, nom, prenom, telephone, role, agence_id, actif").eq("agence_id", agencyId).eq("actif", true).order("prenom"),
    supabase.from("operateurs").select("code, nom, couleur, ordre").order("ordre"),
    supabase.from("sessions_caisse").select("*").eq("agence_id", agencyId).eq("date_caisse", date).order("ouverte_le", { ascending: false }),
    supabase.from("commission_baremes").select("*").eq("agence_id", agencyId).eq("actif", true).order("operateur_code"),
  ]);
  const points = throwIfError(pointsResult) || [];
  const profiles = throwIfError(profilesResult) || [];
  const operators = throwIfError(operatorsResult) || [];
  const sessions = throwIfError(sessionsResult) || [];
  const commissionRules = throwIfError(rulesResult) || [];

  const sessionIds = sessions.map((session) => session.id);
  let sessionFloats = [];
  let transactions = [];
  let expenses = [];

  if (sessionIds.length) {
    const [floatResult, transactionsResult, expensesResult] = await Promise.all([
      supabase.from("soldes_session_operateur").select("*").in("session_id", sessionIds),
      supabase.from("transactions").select("*").in("session_id", sessionIds).order("created_at", { ascending: false }),
      supabase.from("depenses").select("*").in("session_id", sessionIds).order("created_at", { ascending: false }),
    ]);
    sessionFloats = throwIfError(floatResult) || [];
    transactions = throwIfError(transactionsResult) || [];
    expenses = throwIfError(expensesResult) || [];
  }

  const { agences, ...user } = profile;
  return {
    demo: false,
    user,
    agency: agences,
    profiles,
    points,
    operators,
    sessions,
    session_floats: sessionFloats,
    transactions,
    expenses,
    commission_baremes: commissionRules,
  };
}

export async function openCashSession({ pointId, date, cashOpening, openingBalances }) {
  const result = await supabase.rpc("ouvrir_session", {
    p_point_id: pointId,
    p_date_caisse: date,
    p_caisse_ouverture: Number(cashOpening),
    p_soldes: openingBalances,
  });
  return throwIfError(result);
}

export async function closeCashSession({ sessionId, cashDeclared, declaredBalances }) {
  const result = await supabase.rpc("cloturer_session", {
    p_session_id: sessionId,
    p_caisse_declaree: Number(cashDeclared),
    p_soldes: declaredBalances,
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
