import test from "node:test";
import assert from "node:assert/strict";
import { addDays, buildForecast, buildUnitForecastFor, dateRange, floatConsumptionEvents } from "./forecast.js";
import { buildAgentPerformance, buildCommissionReconciliation, buildCreditBook, buildEncaissementSummary, buildPointConsolidation } from "./consolidation.js";
import { buildLastCountByPoint, calculateSession, settlementAmount, unitAdjustmentDirection } from "./ledger.js";

const operators = [
  { code: "orange", nom: "Orange Money", couleur: "#ff7900" },
  { code: "mtn", nom: "MTN MoMo", couleur: "#ffcc08" },
];

function iso(date, hour = 10) {
  return `${date}T${String(hour).padStart(2, "0")}:00:00.000Z`;
}

test("dateRange et addDays restent en jours calendaires", () => {
  assert.deepEqual(dateRange("2026-11-01", 3), ["2026-10-30", "2026-10-31", "2026-11-01"]);
  assert.equal(addDays("2026-11-01", -1), "2026-10-31");
  assert.equal(addDays("2026-11-30", 1), "2026-12-01");
});

test("buildForecast calcule la couverture et la quantité à recommander", () => {
  const forecast = buildForecast({
    events: [
      { date: "2026-10-30", consumption: 10_000 },
      { date: "2026-10-31", consumption: 10_000 },
      { date: "2026-11-01", consumption: 10_000 },
    ],
    stock: 15_000,
    endDate: "2026-11-01",
    days: 3,
  });
  assert.equal(forecast.total, 30_000);
  assert.equal(forecast.averageDaily, 10_000);
  assert.equal(forecast.daysOfCover, 1.5);
  assert.equal(forecast.ruptureDate, "2026-11-02");
  assert.equal(forecast.recommended, 55_000);
  assert.equal(forecast.level, "critique");
});

test("buildForecast ignore les jours hors fenêtre et gère un stock nul", () => {
  const forecast = buildForecast({
    events: [{ date: "2026-10-20", consumption: 50_000 }],
    stock: 0,
    endDate: "2026-11-01",
    days: 7,
  });
  assert.equal(forecast.total, 0);
  assert.equal(forecast.daysOfCover, null);
  assert.equal(forecast.level, "rupture");
  assert.equal(forecast.recommended, 0);
});

test("buildUnitForecastFor agrège les ventes d'unités par opérateur", () => {
  const transactions = [
    { operateur_code: "orange", type_operation: "transfert_unites", montant: 5_000, created_at: iso("2026-10-31") },
    { operateur_code: "orange", type_operation: "transfert_unites", montant: 5_000, created_at: iso("2026-11-01") },
    { operateur_code: "orange", type_operation: "transfert_unites", montant: 99_000, created_at: iso("2026-11-01"), annulee_le: "2026-11-01T11:00:00Z" },
    { operateur_code: "orange", type_operation: "approvisionnement_unites", montant: 40_000, created_at: iso("2026-11-01") },
    { operateur_code: "mtn", type_operation: "transfert_unites", montant: 2_000, created_at: iso("2026-11-01") },
  ];
  const rows = buildUnitForecastFor({
    operators,
    transactions,
    stock: { orange: { theorique: 20_000 }, mtn: { theorique: 1_000 } },
    endDate: "2026-11-01",
    days: 2,
  });
  const orange = rows.find((row) => row.code === "orange");
  assert.equal(orange.total, 10_000);
  assert.equal(orange.averageDaily, 5_000);
  assert.equal(orange.daysOfCover, 4);
  assert.equal(orange.recommended, 15_000);
  const mtn = rows.find((row) => row.code === "mtn");
  assert.equal(mtn.averageDaily, 1_000);
  assert.equal(mtn.level, "critique");
});

test("floatConsumptionEvents traduit dépôts, retraits, transferts et règlements wallet", () => {
  const transactions = [
    { operateur_code: "orange", type_operation: "depot", montant: 10_000, created_at: iso("2026-11-01") },
    { operateur_code: "orange", type_operation: "retrait", montant: 4_000, created_at: iso("2026-11-01") },
    { operateur_code: "mtn", operateur_destination_code: "orange", type_operation: "transfert", montant: 6_000, created_at: iso("2026-11-01") },
    { operateur_code: "mtn", type_operation: "approvisionnement_unites", montant: 3_000, mode_paiement_unites: "wallet", operateur_paiement_code: "orange", created_at: iso("2026-11-01") },
  ];
  const events = floatConsumptionEvents(transactions, "orange");
  const total = events.reduce((sum, event) => sum + event.consumption, 0);
  assert.equal(total, 10_000 - 4_000 - 6_000 + 3_000);
});

test("calculateSession intègre marge d'unités, ajustement de stock et mouvements de caisse", () => {
  const session = { id: "s1", statut: "ouverte", caisse_ouverture: 100_000 };
  const totals = calculateSession(
    session,
    [{ session_id: "s1", operateur_code: "orange", solde_ouverture: 50_000 }],
    [
      { session_id: "s1", operateur_code: "orange", type_operation: "transfert_unites", montant: 10_000, montant_reglement: 11_000, mode_paiement_unites: "especes" },
      { session_id: "s1", operateur_code: "orange", type_operation: "approvisionnement_unites", montant: 20_000, montant_reglement: 19_000, mode_paiement_unites: "especes" },
      { session_id: "s1", operateur_code: "orange", type_operation: "ajustement_unites", montant: 2_000, ajustement_sens: "sortie" },
    ],
    [],
    [{ session_id: "s1", operateur_code: "orange", unites_ouverture: 30_000 }],
    operators,
    [{ session_id: "s1", sens: "entree", montant: 25_000 }, { session_id: "s1", sens: "sortie", montant: 5_000 }],
  );
  assert.equal(totals.cashExpected, 100_000 + 11_000 - 19_000 + 25_000 - 5_000);
  assert.equal(totals.unitMargin, 1_000 + 1_000);
  assert.equal(totals.unitMap.orange.theorique, 30_000 - 10_000 + 20_000 - 2_000);
  assert.equal(totals.cashInMovements, 25_000);
  assert.equal(totals.cashOutMovements, 5_000);
});

test("settlementAmount et unitAdjustmentDirection restent explicites", () => {
  assert.equal(settlementAmount({ montant: 5_000 }), 5_000);
  assert.equal(settlementAmount({ montant: 5_000, montant_reglement: 5_500 }), 5_500);
  assert.equal(settlementAmount({ montant: 5_000, montant_reglement: null }), 5_000);
  assert.equal(unitAdjustmentDirection({ type_operation: "ajustement_unites", ajustement_sens: "entree" }), 1);
  assert.equal(unitAdjustmentDirection({ type_operation: "ajustement_unites", ajustement_sens: "sortie" }), -1);
  assert.equal(unitAdjustmentDirection({ type_operation: "depot" }), 0);
});

test("buildPointConsolidation additionne les sessions ouvertes et signale les alertes", () => {
  const points = [
    { id: "p1", nom: "Centre", seuil_alerte_float: 10_000, seuil_alerte_unites: 30_000 },
    { id: "p2", nom: "Marché" },
  ];
  const sessions = [
    { id: "s1", point_id: "p1", statut: "ouverte", caisse_ouverture: 50_000, date_caisse: "2026-11-01" },
    { id: "s2", point_id: "p1", statut: "cloturee", caisse_ouverture: 20_000, caisse_cloture_declaree: 19_000, date_caisse: "2026-11-01" },
    { id: "s3", point_id: "p2", statut: "ouverte", caisse_ouverture: 10_000, date_caisse: "2026-11-01" },
  ];
  const transactions = [
    { id: "t1", session_id: "s1", point_id: "p1", operateur_code: "orange", type_operation: "depot", montant: 10_000, commission_reelle: 500 },
    { id: "t2", session_id: "s1", point_id: "p1", operateur_code: "orange", type_operation: "transfert_unites", montant: 5_000, montant_reglement: 5_500, commission_reelle: 300 },
  ];
  const result = buildPointConsolidation({
    points,
    sessions,
    transactions,
    expenses: [{ session_id: "s1", montant: 1_000 }],
    sessionFloats: [
      { session_id: "s1", operateur_code: "orange", solde_ouverture: 5_000 },
      { session_id: "s3", operateur_code: "orange", solde_ouverture: 60_000 },
    ],
    sessionUnits: [{ session_id: "s1", operateur_code: "orange", unites_ouverture: 20_000 }],
    operators: [operators[0]],
    thresholds: { p1: 30_000 },
  });
  const centre = result.rows.find((row) => row.point.id === "p1");
  assert.equal(centre.openSessions, 1);
  assert.equal(centre.operations, 2);
  assert.equal(centre.unitMargin, 500);
  assert.equal(centre.result, 800 - 1_000 + 500);
  assert.ok(centre.alerts.some((alert) => alert.code === "unites"));
  assert.ok(centre.alerts.some((alert) => alert.code === "float"));
  assert.ok(centre.alerts.some((alert) => alert.code === "ecart"));
  assert.equal(result.totals.operations, 2);
});

test("buildAgentPerformance classe les agents par volume", () => {
  const profiles = [{ id: "a1", prenom: "Awa" }, { id: "a2", prenom: "Koffi" }];
  const sessions = [
    { id: "s1", agent_id: "a1", statut: "ouverte" },
    { id: "s2", agent_id: "a2", statut: "cloturee" },
  ];
  const transactions = [
    { session_id: "s1", type_operation: "depot", montant: 10_000, created_at: iso("2026-11-01") },
    { session_id: "s2", type_operation: "transfert_unites", montant: 30_000, created_at: iso("2026-11-01") },
    { session_id: "s1", type_operation: "depot", montant: 99_000, created_at: iso("2026-11-01"), annulee_le: "2026-11-01T12:00:00Z" },
  ];
  const rows = buildAgentPerformance({ profiles, sessions, transactions });
  assert.equal(rows[0].profile.id, "a2");
  assert.equal(rows[0].unitsSold, 30_000);
  assert.equal(rows[1].volume, 10_000);
  assert.equal(rows[1].operations, 1);
});

test("buildCommissionReconciliation compare attendu, déclaré et reçu", () => {
  const rows = buildCommissionReconciliation({
    operators,
    transactions: [
      { operateur_code: "orange", commission_estimee: 500, commission_reelle: 500, type_operation: "depot" },
      { operateur_code: "orange", commission_estimee: 300, commission_reelle: null, type_operation: "retrait" },
    ],
    statements: [{ operateur_code: "orange", montant_recu: 500 }],
  });
  const orange = rows.find((row) => row.operator.code === "orange");
  assert.equal(orange.expected, 800);
  assert.equal(orange.declared, 500);
  assert.equal(orange.gap, 0);
  assert.equal(orange.coverage, 100);
  const mtn = rows.find((row) => row.operator.code === "mtn");
  assert.equal(mtn.coverage, null);
});

test("buildCreditBook agrège crédits, remboursements et retards par client", () => {
  const book = buildCreditBook({
    today: "2026-11-01",
    points: [{ id: "p1", nom: "Centre" }],
    movements: [
      { point_id: "p1", client_nom: "Fatou", client_telephone: "07 ** ** 12", sens: "credit", montant: 5_000, echeance: "2026-10-30", created_at: "2026-10-25T10:00:00Z" },
      { point_id: "p1", client_nom: "Fatou", client_telephone: "07 ** ** 12", sens: "remboursement", montant: 2_000, created_at: "2026-10-31T10:00:00Z" },
      { point_id: "p1", client_nom: "Ibrahim", client_telephone: "", sens: "credit", montant: 4_000, echeance: "2026-11-10", created_at: "2026-11-01T09:00:00Z" },
    ],
  });
  assert.equal(book.rows.length, 2);
  const fatou = book.rows.find((row) => row.nom === "Fatou");
  assert.equal(fatou.balance, 3_000);
  assert.equal(fatou.overdue, 3_000);
  assert.equal(book.overdueTotal, 3_000);
  assert.equal(book.outstanding, 7_000);
  assert.equal(book.overdueCount, 1);
});

test("buildEncaissementSummary additionne montants et commissions", () => {
  const summary = buildEncaissementSummary([{ montant: 10_000, commission: 100 }, { montant: 5_000, commission: 0 }]);
  assert.equal(summary.total, 15_000);
  assert.equal(summary.commission, 100);
  assert.equal(summary.count, 2);
});

test("buildLastCountByPoint reprend le dernier comptage déclaré de chaque point", () => {
  const points = [{ id: "p1" }, { id: "p2" }];
  const operators = [{ code: "orange" }, { code: "mtn" }];
  const sessions = [
    { id: "s1", point_id: "p1", statut: "cloturee", date_caisse: "2026-10-30", caisse_ouverture: 100_000, caisse_cloture_declaree: 150_000 },
    { id: "s2", point_id: "p1", statut: "cloturee", date_caisse: "2026-10-31", caisse_ouverture: 150_000, caisse_cloture_declaree: 175_000 },
    { id: "s3", point_id: "p1", statut: "ouverte", date_caisse: "2026-11-01", caisse_ouverture: 175_000 },
  ];
  const sessionFloats = [
    { session_id: "s2", operateur_code: "orange", solde_ouverture: 20_000, solde_cloture_declare: 32_000 },
    { session_id: "s2", operateur_code: "mtn", solde_ouverture: 10_000, solde_cloture_declare: null },
  ];
  const sessionUnits = [
    { session_id: "s2", operateur_code: "orange", unites_ouverture: 5_000, unites_cloture_declare: 3_500, stock_initial_non_saisi: false },
  ];
  const counts = buildLastCountByPoint({
    points, sessions, sessionFloats, sessionUnits, operators,
  });
  assert.equal(counts.p1.date, "2026-10-31");
  assert.equal(counts.p1.cash, 175_000);
  assert.equal(counts.p1.balances.orange, 32_000);
  assert.equal(counts.p1.balances.mtn, 10_000);
  assert.equal(counts.p1.units.orange, 3_500);
  assert.equal(counts.p2, undefined);
  assert.equal(counts.p1.unitsTracked, false);
});
