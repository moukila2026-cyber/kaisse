import test from "node:test";
import assert from "node:assert/strict";
import { calculateCommission, calculateSession } from "./ledger.js";

const session = {
  id: "shift-1",
  statut: "ouverte",
  caisse_ouverture: 200_000,
};

const floats = [
  { session_id: "shift-1", operateur_code: "orange", solde_ouverture: 500_000 },
  { session_id: "shift-1", operateur_code: "mtn", solde_ouverture: 300_000 },
  { session_id: "shift-1", operateur_code: "wave", solde_ouverture: 100_000 },
];

test("calcule les mouvements de caisse et de float des opérations", () => {
  const result = calculateSession(session, floats, [
    { session_id: "shift-1", type_operation: "depot", operateur_code: "orange", montant: 50_000 },
    { session_id: "shift-1", type_operation: "retrait", operateur_code: "mtn", montant: 20_000 },
    { session_id: "shift-1", type_operation: "transfert", operateur_code: "orange", operateur_destination_code: "wave", montant: 10_000 },
    { session_id: "shift-1", type_operation: "achat_credit", operateur_code: "wave", montant: 5_000 },
  ], [
    { session_id: "shift-1", mode_paiement: "especes", montant: 2_000 },
    { session_id: "shift-1", mode_paiement: "wallet", operateur_code: "mtn", montant: 3_000 },
  ]);

  assert.equal(result.cashExpected, 233_000);
  assert.equal(result.floatMap.orange.theorique, 440_000);
  assert.equal(result.floatMap.mtn.theorique, 317_000);
  assert.equal(result.floatMap.wave.theorique, 105_000);
  assert.equal(result.volume, 85_000);
  assert.equal(result.expenseTotal, 5_000);
});

test("ignore les opérations annulées dans le rapprochement", () => {
  const result = calculateSession(session, floats, [
    { session_id: "shift-1", type_operation: "depot", operateur_code: "orange", montant: 50_000, annulee_le: "2026-10-03T12:00:00Z" },
  ]);

  assert.equal(result.operationCount, 0);
  assert.equal(result.cashExpected, 200_000);
  assert.equal(result.floatMap.orange.theorique, 500_000);
});

test("mesure un écart déclaré moins solde théorique à la clôture", () => {
  const result = calculateSession({ ...session, statut: "cloturee", caisse_cloture_declaree: 198_000 }, floats, [
    { session_id: "shift-1", type_operation: "depot", operateur_code: "orange", montant: 50_000 },
  ]);

  assert.equal(result.cashExpected, 250_000);
  assert.equal(result.cashVariance, -52_000);
  assert.equal(result.floatMap.orange.theorique, 450_000);
});

test("sélectionne le barème correspondant et calcule la commission en FCFA", () => {
  const commission = calculateCommission({
    type_operation: "depot",
    operateur_code: "orange",
    montant: 50_000,
  }, [
    { operateur_code: "orange", type_operation: "depot", montant_minimum: 0, montant_maximum: null, commission_fixe: 100, taux_points_base: 0, actif: true },
    { operateur_code: "orange", type_operation: "depot", montant_minimum: 25_000, montant_maximum: 99_999, commission_fixe: 250, taux_points_base: 50, actif: true },
  ]);

  assert.equal(commission, 500);
});
