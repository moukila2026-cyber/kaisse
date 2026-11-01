import test from "node:test";
import assert from "node:assert/strict";
import { alertCounts, buildAlerts } from "./alerts.js";

const unitStock = {
  operators: [
    { code: "orange", nom: "Orange Money", theorique: 0, suivi: true },
    { code: "mtn", nom: "MTN MoMo", theorique: 15_000, suivi: true },
    { code: "wave", nom: "Wave", theorique: 5_000, suivi: false },
  ],
};

test("buildAlerts couvre rupture, stock bas, float, prévision, session oubliée et abonnement", () => {
  const alerts = buildAlerts({
    unitStock,
    floatMap: { orange: { theorique: 0 }, mtn: { theorique: 5_000 } },
    point: { seuil_alerte_unites: 20_000, seuil_alerte_float: 10_000 },
    subscription: { canWrite: true, daysLeft: 3 },
    forecasts: [{ code: "orange", nom: "Orange Money", level: "critique", daysOfCover: 0.4, recommended: 40_000 }],
    sessions: [{ id: "s1", statut: "ouverte", date_caisse: "2026-10-28", ouverte_le: "2026-10-28T08:00:00Z" }],
    today: "2026-11-01",
    now: new Date("2026-11-01T10:00:00Z").getTime(),
    credit: { overdueTotal: 5_000, overdueCount: 2 },
  });
  const codes = alerts.map((alert) => alert.code);
  assert.ok(codes.includes("unites_rupture"));
  assert.ok(codes.includes("unites_bas"));
  assert.ok(codes.includes("float_rupture"));
  assert.ok(codes.includes("float_bas"));
  assert.ok(codes.includes("prevision"));
  assert.ok(codes.includes("session_oubliee"));
  assert.ok(codes.includes("credit_retard"));
  assert.ok(codes.includes("abonnement"));
  assert.equal(alerts[0].severity, "critique");
  assert.equal(alertCounts(alerts).critique, 2);
});

test("buildAlerts ne crée rien quand tout va bien", () => {
  const alerts = buildAlerts({
    unitStock: { operators: [{ code: "orange", nom: "Orange", theorique: 80_000, suivi: true }] },
    floatMap: { orange: { theorique: 200_000 } },
    point: { seuil_alerte_unites: 10_000, seuil_alerte_float: 50_000 },
    subscription: { canWrite: true, daysLeft: 20 },
    sessions: [],
    today: "2026-11-01",
  });
  assert.deepEqual(alerts, []);
});

test("buildAlerts signale l'accès en lecture seule", () => {
  const alerts = buildAlerts({ unitStock: { operators: [] }, subscription: { canWrite: false }, today: "2026-11-01" });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].code, "abonnement_expire");
});
