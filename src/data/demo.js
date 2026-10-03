import { todayInAbidjan } from "../domain/ledger.js";

export const DEMO_DATA_KEY = "kaisse-pro-demo-v1";
export const DEMO_ACTIVE_KEY = "kaisse-pro-demo-active";

export const DEFAULT_OPERATORS = [
  { code: "orange", nom: "Orange Money", couleur: "#ff7900", ordre: 1 },
  { code: "mtn", nom: "MTN MoMo", couleur: "#ffcc08", ordre: 2 },
  { code: "moov", nom: "Moov Money", couleur: "#0072ce", ordre: 3 },
  { code: "wave", nom: "Wave", couleur: "#1dc8e0", ordre: 4 },
];

function makeId(prefix = "demo") {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${suffix}`;
}

export function createDemoWorkspace(date = todayInAbidjan()) {
  const openingSessionId = "demo-session-open";
  const closedSessionId = "demo-session-closed";
  const pointId = "demo-point-centre";
  const ownerId = "demo-owner";
  const agentId = "demo-agent-awa";
  const now = Date.now();

  return {
    demo: true,
    user: {
      id: ownerId,
      nom: "Traoré",
      prenom: "Koffi",
      telephone: "+225 07 00 00 00 00",
      role: "proprietaire",
      agence_id: "demo-agence",
    },
    agency: {
      id: "demo-agence",
      nom: "Agence Centre Daloa",
      ville: "Daloa",
      code_invitation: "DALOA26",
      proprietaire_id: ownerId,
    },
    profiles: [
      { id: ownerId, nom: "Traoré", prenom: "Koffi", telephone: "+225 07 00 00 00 00", role: "proprietaire", agence_id: "demo-agence", actif: true },
      { id: agentId, nom: "Koné", prenom: "Awa", telephone: "+225 05 00 00 00 00", role: "agent", agence_id: "demo-agence", actif: true },
    ],
    points: [
      { id: pointId, agence_id: "demo-agence", nom: "Centre-ville", ville: "Daloa", seuil_alerte_float: 100_000, actif: true },
    ],
    operators: DEFAULT_OPERATORS,
    sessions: [
      {
        id: openingSessionId,
        agence_id: "demo-agence",
        point_id: pointId,
        agent_id: ownerId,
        date_caisse: date,
        statut: "ouverte",
        caisse_ouverture: 300_000,
        caisse_cloture_declaree: null,
        ouverte_le: new Date(now - 4 * 60 * 60 * 1000).toISOString(),
        cloturee_le: null,
      },
      {
        id: closedSessionId,
        agence_id: "demo-agence",
        point_id: pointId,
        agent_id: agentId,
        date_caisse: date,
        statut: "cloturee",
        caisse_ouverture: 100_000,
        caisse_cloture_declaree: 75_000,
        ouverte_le: new Date(now - 8 * 60 * 60 * 1000).toISOString(),
        cloturee_le: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
      },
    ],
    session_floats: [
      ...[
        ["orange", 500_000, null],
        ["mtn", 320_000, null],
        ["moov", 180_000, null],
        ["wave", 250_000, null],
      ].map(([operateur_code, solde_ouverture, solde_cloture_declare]) => ({
        session_id: openingSessionId, operateur_code, solde_ouverture, solde_cloture_declare,
      })),
      ...[
        ["orange", 100_000, 120_000],
        ["mtn", 50_000, 50_000],
        ["moov", 25_000, 25_000],
        ["wave", 80_000, 80_000],
      ].map(([operateur_code, solde_ouverture, solde_cloture_declare]) => ({
        session_id: closedSessionId, operateur_code, solde_ouverture, solde_cloture_declare,
      })),
    ],
    transactions: [
      {
        id: "demo-tx-1", agence_id: "demo-agence", point_id: pointId, session_id: openingSessionId,
        agent_id: ownerId, operateur_code: "orange", operateur_destination_code: null,
        type_operation: "depot", montant: 100_000, commission_estimee: 500, commission_reelle: 500,
        reference: "OM-1042", created_at: new Date(now - 18 * 60 * 1000).toISOString(), annulee_le: null,
      },
      {
        id: "demo-tx-2", agence_id: "demo-agence", point_id: pointId, session_id: openingSessionId,
        agent_id: ownerId, operateur_code: "mtn", operateur_destination_code: null,
        type_operation: "retrait", montant: 75_000, commission_estimee: 350, commission_reelle: 350,
        reference: "MM-0281", created_at: new Date(now - 39 * 60 * 1000).toISOString(), annulee_le: null,
      },
      {
        id: "demo-tx-3", agence_id: "demo-agence", point_id: pointId, session_id: openingSessionId,
        agent_id: ownerId, operateur_code: "wave", operateur_destination_code: null,
        type_operation: "achat_credit", montant: 25_000, commission_estimee: 125, commission_reelle: 125,
        reference: "WV-6018", created_at: new Date(now - 56 * 60 * 1000).toISOString(), annulee_le: null,
      },
      {
        id: "demo-tx-4", agence_id: "demo-agence", point_id: pointId, session_id: openingSessionId,
        agent_id: ownerId, operateur_code: "moov", operateur_destination_code: "orange",
        type_operation: "transfert", montant: 50_000, commission_estimee: 100, commission_reelle: 100,
        reference: "MV-0943", created_at: new Date(now - 80 * 60 * 1000).toISOString(), annulee_le: null,
      },
      {
        id: "demo-tx-5", agence_id: "demo-agence", point_id: pointId, session_id: closedSessionId,
        agent_id: agentId, operateur_code: "orange", operateur_destination_code: null,
        type_operation: "retrait", montant: 20_000, commission_estimee: 100, commission_reelle: 100,
        reference: "OM-9931", created_at: new Date(now - 5 * 60 * 60 * 1000).toISOString(), annulee_le: null,
      },
    ],
    expenses: [
      {
        id: "demo-expense-1", agence_id: "demo-agence", point_id: pointId, session_id: openingSessionId,
        agent_id: ownerId, categorie: "Transport", mode_paiement: "especes", operateur_code: null,
        montant: 8_500, note: "Course de réapprovisionnement", created_at: new Date(now - 25 * 60 * 1000).toISOString(),
      },
    ],
    commission_baremes: [],
  };
}

export function readDemoWorkspace() {
  try {
    const stored = localStorage.getItem(DEMO_DATA_KEY);
    if (stored) return JSON.parse(stored);
  } catch (error) {
    console.warn("Impossible de lire les données de démonstration.", error);
  }
  const workspace = createDemoWorkspace();
  writeDemoWorkspace(workspace);
  return workspace;
}

export function writeDemoWorkspace(workspace) {
  localStorage.setItem(DEMO_DATA_KEY, JSON.stringify(workspace));
}

export function makeDemoId(prefix) {
  return makeId(prefix);
}
