import React from "react";
import { renderToString } from "react-dom/server";
import { UnitsPage, UnitMovementModal } from "../src/App.jsx";
import { createDemoWorkspace, DEFAULT_OPERATORS } from "../src/data/demo.js";
import { computeUnitStock, isUnitOperation, summarizeUnitMovements } from "../src/domain/units.js";

const workspace = createDemoWorkspace("2026-11-01");
const openSession = workspace.sessions.find((session) => session.statut === "ouverte");
const daySessions = workspace.sessions.filter((session) => session.date_caisse === "2026-11-01");
const transactions = workspace.transactions;
const thresholds = Object.fromEntries(DEFAULT_OPERATORS.map((operator) => [operator.code, 25_000]));
const stock = computeUnitStock({
  operators: DEFAULT_OPERATORS,
  sessions: daySessions,
  sessionUnits: workspace.session_units,
  transactions,
  thresholds,
});
const journal = transactions.filter(isUnitOperation);
const summary = summarizeUnitMovements(journal);

const pages = renderToString(
  <UnitsPage
    date="2026-11-01"
    reportRange={{ startDate: "2026-10-26", endDate: "2026-11-01" }}
    period="week"
    onPeriodChange={() => {}}
    stock={stock}
    journal={journal}
    summary={summary}
    operators={DEFAULT_OPERATORS}
    points={workspace.points}
    pointById={new Map(workspace.points.map((point) => [point.id, point]))}
    agents={new Map(workspace.profiles.map((profile) => [profile.id, profile]))}
    canManage
    canWrite
    onOpenModal={() => {}}
    onOpenUnit={() => {}}
    onCancel={() => {}}
    onExport={() => {}}
    onGo={() => {}}
  />,
);

const modal = renderToString(
  <UnitMovementModal
    variant="vente"
    sessions={[openSession]}
    summaries={[{ session: openSession, totals: { unitTracked: true, unitMap: { orange: { theorique: 68_000, suivi: true }, mtn: { theorique: 50_000, suivi: true }, moov: { theorique: 20_000, suivi: true }, wave: { theorique: 9_000, suivi: true } } } }]}
    points={workspace.points}
    operators={DEFAULT_OPERATORS}
    rules={workspace.commission_baremes}
    stock={stock}
    onClose={() => {}}
    onSave={async () => {}}
  />,
);

console.log("UnitsPage HTML:", pages.length, "chars");
console.log("Modal HTML:", modal.length, "chars");
console.log("Alertes:", stock.alerts.map((row) => `${row.nom}:${row.niveau}:${row.theorique}`).join(" | "));
console.log("Stock total:", stock.totalStock, "Ventes:", stock.totalVentes, "Achats:", stock.totalAppro);
console.log("Contient 'Unités & transferts':", pages.includes("Unités &amp; transferts"));
console.log("Contient 'Stock bas':", pages.includes("Stock bas"));
console.log("Contient bénéficiaire masqué:", pages.includes("07 ** ** 56"));
