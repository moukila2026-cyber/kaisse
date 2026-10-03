import test from "node:test";
import assert from "node:assert/strict";
import { getSubscriptionState, PAID_PERIOD_DAYS, TRIAL_DURATION_DAYS } from "./subscription.js";

test("les agences inscrites avant le trial conservent l'accès sans migration de données", () => {
  assert.deepEqual(getSubscriptionState({ id: "legacy", statut_abonnement: null }, Date.now()), {
    mode: "legacy", canWrite: true, daysLeft: null,
  });
});

test("un essai valide donne 14 jours au moment de l'inscription", () => {
  const now = Date.parse("2026-10-03T12:00:00.000Z");
  const state = getSubscriptionState({
    statut_abonnement: "essai",
    essai_debute_le: new Date(now).toISOString(),
    essai_termine_le: new Date(now + TRIAL_DURATION_DAYS * 86_400_000).toISOString(),
  }, now);

  assert.equal(state.mode, "trial");
  assert.equal(state.canWrite, true);
  assert.equal(state.daysLeft, 14);
});

test("un essai expiré conserve les données en lecture seule", () => {
  const now = Date.parse("2026-10-20T00:00:00.000Z");
  const state = getSubscriptionState({
    statut_abonnement: "essai",
    essai_termine_le: "2026-10-17T00:00:00.000Z",
  }, now);

  assert.equal(state.mode, "expired");
  assert.equal(state.canWrite, false);
  assert.equal(state.daysLeft, 0);
});

test("un abonnement activé sans échéance historique reste actif", () => {
  const state = getSubscriptionState({ statut_abonnement: "actif" }, Date.now());
  assert.equal(state.mode, "active");
  assert.equal(state.canWrite, true);
});

test("un forfait payé donne 30 jours puis repasse en lecture seule", () => {
  const now = Date.parse("2026-10-03T12:00:00.000Z");
  const agency = {
    statut_abonnement: "actif",
    plan_abonnement: "starter",
    abonnement_termine_le: new Date(now + PAID_PERIOD_DAYS * 86_400_000).toISOString(),
  };
  const active = getSubscriptionState(agency, now);
  assert.equal(active.mode, "active");
  assert.equal(active.canWrite, true);
  assert.equal(active.daysLeft, 30);
  assert.equal(active.planCode, "starter");

  const expired = getSubscriptionState(agency, now + PAID_PERIOD_DAYS * 86_400_000);
  assert.equal(expired.mode, "expired");
  assert.equal(expired.reason, "subscription");
  assert.equal(expired.canWrite, false);
});
