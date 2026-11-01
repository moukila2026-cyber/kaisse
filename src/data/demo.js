import { todayInAbidjan } from "../domain/ledger.js";

export const DEMO_DATA_KEY = "kaisse-pro-demo-v3";
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
      code_invitation: "KSSPAB26",
      proprietaire_id: ownerId,
    },
    profiles: [
      { id: ownerId, nom: "Traoré", prenom: "Koffi", telephone: "+225 07 00 00 00 00", role: "proprietaire", agence_id: "demo-agence", actif: true },
      { id: agentId, nom: "Koné", prenom: "Awa", telephone: "+225 05 00 00 00 00", role: "agent", agence_id: "demo-agence", actif: true },
    ],
    points: [
      {
        id: pointId, agence_id: "demo-agence", nom: "Centre-ville", ville: "Daloa",
        seuil_alerte_float: 100_000, seuil_alerte_unites: 25_000, actif: true,
      },
      {
        id: "demo-point-marche", agence_id: "demo-agence", nom: "Marché de Daloa", ville: "Daloa",
        seuil_alerte_float: 150_000, seuil_alerte_unites: 40_000, actif: true,
      },
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
    session_units: [
      ...[
        ["orange", 50_000, null],
        ["mtn", 30_000, null],
        ["moov", 20_000, null],
        ["wave", 15_000, null],
      ].map(([operateur_code, unites_ouverture, unites_cloture_declare]) => ({
        session_id: openingSessionId, operateur_code, unites_ouverture, unites_cloture_declare,
      })),
      ...[
        ["orange", 20_000, 10_000],
        ["mtn", 10_000, 10_000],
        ["moov", 5_000, 5_000],
        ["wave", 8_000, 8_000],
      ].map(([operateur_code, unites_ouverture, unites_cloture_declare]) => ({
        session_id: closedSessionId, operateur_code, unites_ouverture, unites_cloture_declare,
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
        id: "demo-tx-6", agence_id: "demo-agence", point_id: pointId, session_id: openingSessionId,
        agent_id: ownerId, operateur_code: "orange", operateur_destination_code: null,
        type_operation: "approvisionnement_unites", montant: 30_000, commission_estimee: 0, commission_reelle: 0,
        mode_paiement_unites: "especes", operateur_paiement_code: null,
        reference: "STK-0204", created_at: new Date(now - 12 * 60 * 1000).toISOString(), annulee_le: null,
      },
      {
        id: "demo-tx-7", agence_id: "demo-agence", point_id: pointId, session_id: openingSessionId,
        agent_id: ownerId, operateur_code: "orange", operateur_destination_code: null,
        type_operation: "transfert_unites", montant: 12_000, montant_reglement: 12_600,
        commission_estimee: 100, commission_reelle: 100,
        mode_paiement_unites: "especes", operateur_paiement_code: null,
        beneficiaire_masque: "05 ** ** 41",
        reference: "UNIT-8832", created_at: new Date(now - 8 * 60 * 1000).toISOString(), annulee_le: null,
      },
      {
        id: "demo-tx-8", agence_id: "demo-agence", point_id: pointId, session_id: openingSessionId,
        agent_id: ownerId, operateur_code: "mtn", operateur_destination_code: null,
        type_operation: "approvisionnement_unites", montant: 20_000, commission_estimee: 0, commission_reelle: 0,
        mode_paiement_unites: "wallet", operateur_paiement_code: "wave",
        reference: "GROS-118", created_at: new Date(now - 34 * 60 * 1000).toISOString(), annulee_le: null,
      },
      {
        id: "demo-tx-9", agence_id: "demo-agence", point_id: pointId, session_id: openingSessionId,
        agent_id: ownerId, operateur_code: "wave", operateur_destination_code: null,
        type_operation: "transfert_unites", montant: 6_000, montant_reglement: 6_300,
        commission_estimee: 300, commission_reelle: 300,
        mode_paiement_unites: "especes", operateur_paiement_code: null,
        beneficiaire_masque: "07 ** ** 56", reference: "WV-2210",
        created_at: new Date(now - 26 * 60 * 1000).toISOString(), annulee_le: null,
      },
      {
        id: "demo-tx-5", agence_id: "demo-agence", point_id: pointId, session_id: closedSessionId,
        agent_id: agentId, operateur_code: "orange", operateur_destination_code: null,
        type_operation: "retrait", montant: 20_000, commission_estimee: 100, commission_reelle: 100,
        reference: "OM-9931", created_at: new Date(now - 5 * 60 * 60 * 1000).toISOString(), annulee_le: null,
      },
    ],
    cash_movements: [
      {
        id: "demo-cash-1", agence_id: "demo-agence", point_id: pointId, session_id: openingSessionId,
        agent_id: ownerId, sens: "entree", source: "fond_caisse", montant: 50_000,
        motif: "Renfort de caisse pour les retraits", created_at: new Date(now - 62 * 60 * 1000).toISOString(),
      },
      {
        id: "demo-cash-2", agence_id: "demo-agence", point_id: pointId, session_id: openingSessionId,
        agent_id: ownerId, sens: "sortie", source: "banque", montant: 120_000,
        motif: "Dépôt des excédents à la banque", created_at: new Date(now - 42 * 60 * 1000).toISOString(),
      },
    ],
    credit_movements: [
      {
        id: "demo-credit-1", agence_id: "demo-agence", point_id: pointId, client_nom: "Fatou B.",
        client_telephone: "07 ** ** 12", sens: "credit", montant: 5_000, echeance: date,
        note: "Unités à crédit", created_at: new Date(now - 5 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: "demo-credit-2", agence_id: "demo-agence", point_id: pointId, client_nom: "Ibrahim K.",
        client_telephone: "05 ** ** 78", sens: "credit", montant: 10_000, echeance: date,
        note: "Avance accordée (démonstration)", created_at: new Date(now - 30 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: "demo-credit-3", agence_id: "demo-agence", point_id: pointId, client_nom: "Fatou B.",
        client_telephone: "07 ** ** 12", sens: "remboursement", montant: 2_000, echeance: null,
        note: "Remboursement partiel", created_at: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
      },
    ],
    commission_statements: [
      {
        id: "demo-releve-1", agence_id: "demo-agence", operateur_code: "orange",
        periode_debut: "2026-10-01", periode_fin: new Date(now - 86_400_000).toISOString().slice(0, 10),
        montant_recu: 990, reference: "RELEVE-OM-1026", source: "SMS opérateur (démo) le 31/10",
        created_at: new Date(now - 20 * 60 * 60 * 1000).toISOString(),
      },
    ],
    unit_tariffs: [
      {
        id: "demo-tarif-1", agence_id: "demo-agence", operateur_code: "orange",
        prix_valeur_faciale: 100, prix_vente: 105, actif: true, source: "Barème de démonstration fictif",
        created_at: new Date(now - 86_400_000).toISOString(),
      },
      {
        id: "demo-tarif-2", agence_id: "demo-agence", operateur_code: "wave",
        prix_valeur_faciale: 100, prix_vente: 100, actif: true, source: "Barème de démonstration fictif",
        created_at: new Date(now - 86_400_000).toISOString(),
      },
    ],
    encaissements: [
      {
        id: "demo-enc-1", agence_id: "demo-agence", point_id: pointId, operateur_code: "wave",
        montant: 35_000, commission: 350, mode: "qrcode", reference: "WV-QR-778",
        note: "Vente de crédit prépayé au comptoir", created_at: new Date(now - 65 * 60 * 1000).toISOString(),
      },
      {
        id: "demo-enc-2", agence_id: "demo-agence", point_id: pointId, operateur_code: "orange",
        montant: 20_000, commission: 300, mode: "lien", reference: "OM-LINK-441",
        note: "Encaissement à distance (démo)", created_at: new Date(now - 110 * 60 * 1000).toISOString(),
      },
    ],
    messages: [
      {
        id: "demo-message-1", agence_id: "demo-agence", canal: "whatsapp", destinataire: "Propriétaire",
        contenu: "Récapitulatif du soir : 4 opérations, commissions 1 250 F, stock d'unités à surveiller sur Wave.",
        statut: "prepare", created_at: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
      },
    ],
    audit_log: [
      {
        id: "demo-audit-1", agence_id: "demo-agence", acteur_id: ownerId, action: "session.ouverture",
        entite: "sessions_caisse", entite_id: openingSessionId,
        detail: "Ouverture avec 300 000 F d'espèces et 4 soldes opérateur",
        created_at: new Date(now - 240 * 60 * 1000).toISOString(),
      },
      {
        id: "demo-audit-2", agence_id: "demo-agence", acteur_id: ownerId, action: "transaction.annulation",
        entite: "transactions", entite_id: "demo-tx-10",
        detail: "Transfert annulé — erreur de saisie", created_at: new Date(now - 95 * 60 * 1000).toISOString(),
      },
    ],
    expenses: [
      {
        id: "demo-expense-1", agence_id: "demo-agence", point_id: pointId, session_id: openingSessionId,
        agent_id: ownerId, categorie: "Transport", mode_paiement: "especes", operateur_code: null,
        montant: 8_500, note: "Course de réapprovisionnement", created_at: new Date(now - 25 * 60 * 1000).toISOString(),
      },
    ],
    commission_baremes: [
      {
        id: "demo-bareme-1", agence_id: "demo-agence", operateur_code: "orange", type_operation: "transfert_unites",
        montant_minimum: 0, montant_maximum: null, commission_fixe: 100, taux_points_base: 200,
        source: "Barème de démonstration fictif", actif: true,
      },
      {
        id: "demo-bareme-2", agence_id: "demo-agence", operateur_code: "wave", type_operation: "transfert_unites",
        montant_minimum: 0, montant_maximum: null, commission_fixe: 0, taux_points_base: 500,
        source: "Barème de démonstration fictif", actif: true,
      },
    ],
  };
}

export function readDemoWorkspace() {
  try {
    const stored = localStorage.getItem(DEMO_DATA_KEY);
    if (stored) {
      const workspace = JSON.parse(stored);
      return {
        ...workspace,
        session_units: workspace.session_units || [],
        points: (workspace.points || []).map((point) => ({
          ...point,
          seuil_alerte_unites: point.seuil_alerte_unites ?? 25_000,
        })),
        cash_movements: workspace.cash_movements || [],
        credit_movements: workspace.credit_movements || [],
        commission_statements: workspace.commission_statements || [],
        unit_tariffs: workspace.unit_tariffs || [],
        encaissements: workspace.encaissements || [],
        messages: workspace.messages || [],
        audit_log: workspace.audit_log || [],
      };
    }
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
