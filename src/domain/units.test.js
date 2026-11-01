import test from "node:test";
import assert from "node:assert/strict";
import {
  canSellUnits,
  computeUnitStock,
  isUnitOperation,
  maskBeneficiary,
  summarizeUnitMovements,
  unitStockLevel,
} from "./units.js";

const operators = [
  { code: "orange", nom: "Orange Money", couleur: "#ff7900" },
  { code: "mtn", nom: "MTN MoMo", couleur: "#ffcc08" },
];

function session(id, statut = "ouverte") {
  return { id, statut, date_caisse: "2026-11-01" };
}

test("unitStockLevel distingue rupture, stock bas et disponible", () => {
  assert.equal(unitStockLevel(0, 10_000), "rupture");
  assert.equal(unitStockLevel(5_000, 10_000), "bas");
  assert.equal(unitStockLevel(25_000, 10_000), "ok");
  assert.equal(unitStockLevel(25_000, null), "ok");
  assert.equal(unitStockLevel(25_000, 0), "ok");
});

test("maskBeneficiary ne conserve jamais un numéro complet", () => {
  assert.equal(maskBeneficiary("07 09 12 34 56"), "07 ** ** 56");
  assert.equal(maskBeneficiary("0709123456"), "07 ** ** 56");
  assert.equal(maskBeneficiary("12"), "");
  assert.equal(maskBeneficiary(""), "");
});

test("isUnitOperation ne retient que les deux mouvements d'unités", () => {
  assert.equal(isUnitOperation({ type_operation: "approvisionnement_unites" }), true);
  assert.equal(isUnitOperation({ type_operation: "transfert_unites" }), true);
  assert.equal(isUnitOperation({ type_operation: "depot" }), false);
  assert.equal(isUnitOperation(null), false);
});

test("computeUnitStock applique ouverture + approvisionnements − transferts", () => {
  const result = computeUnitStock({
    operators,
    sessions: [session("s1")],
    sessionUnits: [
      { session_id: "s1", operateur_code: "orange", unites_ouverture: 20_000, stock_initial_non_saisi: false },
      { session_id: "s1", operateur_code: "mtn", unites_ouverture: 5_000, stock_initial_non_saisi: false },
    ],
    transactions: [
      { session_id: "s1", operateur_code: "orange", type_operation: "approvisionnement_unites", montant: 10_000 },
      { session_id: "s1", operateur_code: "orange", type_operation: "transfert_unites", montant: 12_000, commission_reelle: 500 },
      { session_id: "s1", operateur_code: "mtn", type_operation: "transfert_unites", montant: 1_000, commission_estimee: 100 },
      { session_id: "s1", operateur_code: "orange", type_operation: "depot", montant: 99_000 },
      { session_id: "s1", operateur_code: "orange", type_operation: "transfert_unites", montant: 50_000, annulee_le: "2026-11-01T10:00:00Z" },
    ],
    thresholds: { orange: 10_000, mtn: 10_000 },
  });

  const orange = result.byCode.orange;
  assert.equal(orange.ouverture, 20_000);
  assert.equal(orange.approvisionnements, 10_000);
  assert.equal(orange.ventes, 12_000);
  assert.equal(orange.theorique, 18_000);
  assert.equal(orange.commissions, 500);
  assert.equal(orange.niveau, "ok");

  const mtn = result.byCode.mtn;
  assert.equal(mtn.theorique, 4_000);
  assert.equal(mtn.niveau, "bas");

  assert.equal(result.totalStock, 22_000);
  assert.equal(result.totalVentes, 13_000);
  assert.equal(result.alerts.length, 1);
  assert.equal(result.tracked, true);
});

test("computeUnitStock calcule l'écart sur les sessions clôturées, sans mélanger leur stock au stock disponible", () => {
  const result = computeUnitStock({
    operators: [operators[0]],
    sessions: [session("s1", "cloturee"), session("s2", "ouverte")],
    sessionUnits: [
      { session_id: "s1", operateur_code: "orange", unites_ouverture: 10_000, unites_cloture_declare: 7_500 },
      { session_id: "s2", operateur_code: "orange", unites_ouverture: 4_000, unites_cloture_declare: null },
    ],
    transactions: [
      { session_id: "s1", operateur_code: "orange", type_operation: "transfert_unites", montant: 3_000 },
    ],
  });
  const orange = result.byCode.orange;
  // Stock disponible = ouverture de la seule session ouverte.
  assert.equal(orange.theorique, 4_000);
  assert.equal(result.liveSessionCount, 1);
  // Écart = stock compté à la clôture de s1 (7 500) − (10 000 − 3 000).
  assert.equal(orange.declare, 7_500);
  assert.equal(orange.ecart, 500);
  assert.equal(result.totalEcart, 500);
});

test("computeUnitStock retombe sur la dernière session close quand aucune n'est ouverte", () => {
  const result = computeUnitStock({
    operators: [operators[0]],
    sessions: [session("s0", "cloturee"), session("s1", "cloturee")],
    sessionUnits: [
      { session_id: "s0", operateur_code: "orange", unites_ouverture: 20_000, unites_cloture_declare: 20_000 },
      { session_id: "s1", operateur_code: "orange", unites_ouverture: 8_000, unites_cloture_declare: 8_000 },
    ],
    transactions: [
      { session_id: "s1", operateur_code: "orange", type_operation: "transfert_unites", montant: 2_000 },
    ],
  });
  assert.equal(result.liveSessionCount, 1);
  assert.equal(result.liveSessionIds[0], "s1");
  assert.equal(result.byCode.orange.theorique, 6_000);
});

test("computeUnitStock signale les sessions historiques non suivies", () => {
  const result = computeUnitStock({
    operators,
    sessions: [session("s1"), session("s2", "cloturee")],
    sessionUnits: [
      { session_id: "s1", operateur_code: "orange", unites_ouverture: 10_000 },
      { session_id: "s1", operateur_code: "mtn", unites_ouverture: 10_000 },
      { session_id: "s2", operateur_code: "orange", unites_ouverture: 0, stock_initial_non_saisi: true, unites_cloture_declare: 2_000 },
    ],
    transactions: [],
  });
  assert.equal(result.untrackedClosed, 1);
  assert.equal(result.tracked, true);
  assert.equal(result.byCode.orange.niveau, "ok");
  assert.equal(result.byCode.orange.ecart, null);
});

test("summarizeUnitMovements sépare achats, ventes, commissions et espèces", () => {
  const summary = summarizeUnitMovements([
    { type_operation: "approvisionnement_unites", montant: 10_000, mode_paiement_unites: "especes" },
    { type_operation: "transfert_unites", montant: 4_000, mode_paiement_unites: "especes", commission_reelle: 200 },
    { type_operation: "transfert_unites", montant: 6_000, mode_paiement_unites: "wallet", commission_estimee: 300 },
    { type_operation: "transfert_unites", montant: 9_000, annulee_le: "2026-11-01T09:00:00Z" },
    { type_operation: "retrait", montant: 1_000 },
  ]);
  assert.equal(summary.count, 4);
  assert.equal(summary.cancelled, 1);
  assert.equal(summary.approved, 10_000);
  assert.equal(summary.sold, 10_000);
  assert.equal(summary.commissions, 500);
  assert.equal(summary.commissionsToVerify, 1);
  assert.equal(summary.cashIn, 4_000);
  assert.equal(summary.cashOut, 10_000);
  assert.equal(summary.netCash, -6_000);
});

test("canSellUnits refuse un transfert supérieur au stock disponible", () => {
  assert.equal(canSellUnits({ available: 5_000, amount: 5_000 }).ok, true);
  assert.equal(canSellUnits({ available: 5_000, amount: 6_000 }).ok, false);
  assert.match(canSellUnits({ available: 5_000, amount: 6_000 }).message, /Stock insuffisant/);
  assert.equal(canSellUnits({ available: 5_000, amount: 0 }).ok, false);
});

test("computeUnitStock ignore les opérateurs absents du référentiel sans casser", () => {
  const result = computeUnitStock({ operators: [], sessions: [session("s1")], sessionUnits: [
    { session_id: "s1", operateur_code: "wave", unites_ouverture: 3_000 },
  ], transactions: [] });
  assert.equal(result.byCode.wave.theorique, 3_000);
  assert.equal(result.totalStock, 3_000);
});
