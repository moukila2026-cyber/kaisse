import React from "react";
import { renderToString } from "react-dom/server";
import {
  CashPage,
  CloseSessionModal,
  OpenSessionModal,
  OperationsPage,
  OverviewPage,
  SettingsPage,
  TeamPage,
  TransactionModal,
  UnitsPage,
  UnitMovementModal,
} from "../src/App.jsx";
import PilotagePage, { AlertsCenter, AuditList } from "../src/pages/PilotagePage.jsx";
import ClientsPage from "../src/pages/ClientsPage.jsx";
import { CashMovementModal, CreditModal, EncaissementModal, StatementModal, TariffModal } from "../src/pages/OperationsModals.jsx";
import { createDemoWorkspace, DEFAULT_OPERATORS } from "../src/data/demo.js";
import { computeUnitStock, isUnitOperation, summarizeUnitMovements } from "../src/domain/units.js";
import { buildLastCountByPoint, calculateSession } from "../src/domain/ledger.js";
import { buildAlerts } from "../src/domain/alerts.js";
import {
  buildAgentPerformance,
  buildCommissionReconciliation,
  buildCreditBook,
  buildEncaissementSummary,
  buildPointConsolidation,
} from "../src/domain/consolidation.js";
import { buildFloatForecastFor, buildUnitForecastFor } from "../src/domain/forecast.js";

const date = "2026-11-01";
const workspace = createDemoWorkspace(date);
const sessions = workspace.sessions.filter((session) => session.date_caisse === date);
const openSession = sessions.find((session) => session.statut === "ouverte");
const thresholds = Object.fromEntries(DEFAULT_OPERATORS.map((operator) => [operator.code, 25_000]));
const stock = computeUnitStock({
  operators: DEFAULT_OPERATORS,
  sessions,
  sessionUnits: workspace.session_units,
  transactions: workspace.transactions,
  thresholds,
});
const journal = workspace.transactions.filter(isUnitOperation);
const summary = summarizeUnitMovements(journal);
const pointById = new Map(workspace.points.map((point) => [point.id, point]));
const agents = new Map(workspace.profiles.map((profile) => [profile.id, profile]));

const consolidation = buildPointConsolidation({
  points: workspace.points,
  sessions,
  transactions: workspace.transactions,
  expenses: workspace.expenses,
  sessionFloats: workspace.session_floats,
  sessionUnits: workspace.session_units,
  cashMovements: workspace.cash_movements,
  operators: DEFAULT_OPERATORS,
  thresholds: Object.fromEntries(workspace.points.map((point) => [point.id, point.seuil_alerte_unites])),
});
const unitForecasts = buildUnitForecastFor({
  operators: DEFAULT_OPERATORS,
  transactions: workspace.transactions,
  stock: stock.byCode,
  endDate: date,
  days: 7,
});
const floatForecasts = buildFloatForecastFor({
  operators: DEFAULT_OPERATORS,
  transactions: workspace.transactions,
  expenses: workspace.expenses,
  floats: { orange: { theorique: 120_000 }, mtn: { theorique: 60_000 } },
  endDate: date,
  days: 7,
});
const performances = buildAgentPerformance({
  profiles: workspace.profiles,
  sessions,
  transactions: workspace.transactions,
});
const reconciliation = buildCommissionReconciliation({
  transactions: workspace.transactions,
  statements: workspace.commission_statements,
  operators: DEFAULT_OPERATORS,
});
const credit = buildCreditBook({ movements: workspace.credit_movements, points: workspace.points, today: date });
const encaissements = buildEncaissementSummary(workspace.encaissements);
const alerts = buildAlerts({
  unitStock: stock,
  floatMap: { orange: { theorique: 0 }, mtn: { theorique: 5_000 } },
  point: workspace.points[0],
  subscription: { canWrite: true, daysLeft: 4 },
  forecasts: [...unitForecasts, ...floatForecasts],
  sessions,
  today: date,
  credit,
  now: Date.now(),
});

const unitsHtml = renderToString(
  <UnitsPage
    date={date}
    reportRange={{ startDate: "2026-10-26", endDate: date, days: 7 }}
    period="week"
    onPeriodChange={() => {}}
    stock={stock}
    journal={journal}
    summary={summary}
    operators={DEFAULT_OPERATORS}
    points={workspace.points}
    pointById={pointById}
    agents={agents}
    canManage
    canWrite
    onOpenModal={() => {}}
    onOpenUnit={() => {}}
    onCancel={() => {}}
    onExport={() => {}}
    onGo={() => {}}
    forecasts={unitForecasts}
    tariffs={workspace.unit_tariffs}
    onOpenReceipt={() => {}}
    onOpenTariff={() => {}}
  />,
);

const pilotageHtml = renderToString(
  <PilotagePage
    date={date}
    reportRange={{ startDate: "2026-10-26", endDate: date, days: 7 }}
    period="week"
    onPeriodChange={() => {}}
    consolidation={consolidation}
    unitForecasts={unitForecasts}
    floatForecasts={floatForecasts}
    performances={performances}
    reconciliation={reconciliation}
    alerts={alerts}
    operators={DEFAULT_OPERATORS}
    canManage
    canWrite
    onGo={() => {}}
    onOpenModal={() => {}}
    onShareRecap={() => {}}
  />,
);

const clientsHtml = renderToString(
  <ClientsPage
    credit={{ ...credit, encaissementsTotal: encaissements.total, encaissementsCount: encaissements.count, encaissementsCommission: encaissements.commission }}
    creditMovements={workspace.credit_movements}
    points={workspace.points}
    pointById={pointById}
    encaissements={workspace.encaissements}
    messages={workspace.messages}
    auditLog={workspace.audit_log}
    agents={agents}
    canWrite
    onOpenModal={() => {}}
    onGo={() => {}}
    onShareReminder={() => {}}
    today={date}
  />,
);

const modalsHtml = renderToString(<div>
  <CashMovementModal sessions={[openSession]} points={workspace.points} onClose={() => {}} onSave={async () => {}} />
  <CreditModal variant="credit" points={workspace.points} onClose={() => {}} onSave={async () => {}} />
  <CreditModal variant="remboursement" row={credit.rows[0]} points={workspace.points} onClose={() => {}} onSave={async () => {}} />
  <StatementModal operators={DEFAULT_OPERATORS} onClose={() => {}} onSave={async () => {}} />
  <TariffModal operators={DEFAULT_OPERATORS} onClose={() => {}} onSave={async () => {}} />
  <EncaissementModal points={workspace.points} operators={DEFAULT_OPERATORS} onClose={() => {}} onSave={async () => {}} />
  <UnitMovementModal
    variant="ajustement"
    sessions={[openSession]}
    summaries={[{ session: openSession, totals: { unitTracked: true, unitMap: stock.byCode } }]}
    points={workspace.points}
    operators={DEFAULT_OPERATORS}
    rules={workspace.commission_baremes}
    stock={stock}
    tariffs={workspace.unit_tariffs}
    onClose={() => {}}
    onSave={async () => {}}
  />
</div>);

const alertsHtml = renderToString(<AlertsCenter alerts={alerts} onGo={() => {}} />);
const auditHtml = renderToString(<AuditList entries={workspace.audit_log} agents={agents} />);


const operatorByCode = new Map(DEFAULT_OPERATORS.map((operator) => [operator.code, operator]));
const sessionSummaries = sessions.map((session) => ({
  session,
  totals: calculateSession(
    session,
    workspace.session_floats,
    workspace.transactions,
    workspace.expenses,
    workspace.session_units,
    DEFAULT_OPERATORS,
    workspace.cash_movements,
  ),
}));
const sessionDateById = new Map(workspace.sessions.map((session) => [session.id, session.date_caisse]));
const selectedSummary = sessionSummaries.find(({ session }) => session.id === openSession?.id)?.totals;
const dayTransactions = workspace.transactions.filter((transaction) => sessionDateById.get(transaction.session_id) === date);
const dayExpenses = workspace.expenses.filter((expense) => expense.session_id === openSession?.id);
const owner = workspace.profiles.find((profile) => profile.role === "proprietaire") || workspace.profiles[0];
const subscription = { canWrite: true, daysLeft: 12, plan: "pro", label: "Pro" };

const overviewHtml = renderToString(<OverviewPage
  agency={workspace.agency}
  user={owner}
  selectedDate={date}
  pointFilter={workspace.points[0].id}
  selectedSession={openSession}
  selectedSummary={selectedSummary}
  sessionSummaries={sessionSummaries}
  selectedSessionId={openSession?.id}
  onSessionChange={() => {}}
  transactions={dayTransactions}
  sessionDateById={sessionDateById}
  expenses={dayExpenses}
  volume={dayTransactions.reduce((sum, item) => sum + Number(item.montant || 0), 0)}
  commissions={summary.commission}
  commissionEstimate={0}
  commissionNeedsReview={0}
  resultEstimate={12500}
  closedWithDifference={0}
  operatorOrder={DEFAULT_OPERATORS}
  operatorByCode={operatorByCode}
  pointById={pointById}
  agentById={agents}
  canManage
  canWrite
  onGo={() => {}}
  onOpenModal={() => {}}
  onShare={() => {}}
  onOpenOwnSession={() => {}}
  onCancel={() => {}}
  unitAlerts={stock.alerts}
  alerts={alerts}
  unitMargin={stock.totalMargin}
  cashMovements={workspace.cash_movements}
  onShareRecap={() => {}}
  onOpenReceipt={() => {}}
  onOpenAlertCenter={() => {}}
/>);

const operationsHtml = renderToString(<OperationsPage
  date={date}
  reportRange={{ startDate: "2026-10-26", endDate: date }}
  period="week"
  onPeriodChange={() => {}}
  transactions={dayTransactions}
  sessionDateById={sessionDateById}
  operators={operatorByCode}
  points={pointById}
  agents={agents}
  sessionCount={sessions.length}
  canManage
  canWrite
  onOpenModal={() => {}}
  onExport={() => {}}
  onExportPdf={() => {}}
  onCancel={() => {}}
  onReceipt={() => {}}
  onCashMovement={() => {}}
  onCreateReceipt={() => {}}
/>);

const cashHtml = renderToString(<CashPage
  date={date}
  isHistorical={false}
  user={owner}
  points={workspace.points}
  operators={DEFAULT_OPERATORS}
  selectedSession={openSession}
  selectedSummary={selectedSummary}
  summaries={sessionSummaries}
  selectedSessionId={openSession?.id}
  onSessionChange={() => {}}
  units={workspace.session_units}
  expenses={workspace.expenses}
  agents={agents}
  canWrite
  onOpenModal={() => {}}
  onOpenOwnSession={() => {}}
  cashMovements={workspace.cash_movements}
/>);

const teamHtml = renderToString(<TeamPage
  agency={workspace.agency}
  user={owner}
  profiles={workspace.profiles}
  points={workspace.points}
  sessions={sessions}
  summaries={sessionSummaries}
  performances={performances}
  canManage
  canWrite
  onOpenModal={() => {}}
  onCopyCode={() => {}}
/>);

const settingsHtml = renderToString(<SettingsPage
  agency={workspace.agency}
  user={owner}
  subscription={subscription}
  operators={DEFAULT_OPERATORS}
  rules={workspace.commission_baremes}
  onOpenModal={() => {}}
  onResetDemo={() => {}}
  canManage
  canWrite
  tariffs={workspace.unit_tariffs}
  auditLog={workspace.audit_log}
  agents={agents}
  points={workspace.points}
  statements={workspace.commission_statements}
  onShareRecap={() => {}}
  onOpenUnit={() => {}}
  messages={workspace.messages}
  onSaveThreshold={() => {}}
/>);

const lastCounts = buildLastCountByPoint({
  points: workspace.points,
  sessions: workspace.sessions,
  sessionFloats: workspace.session_floats,
  sessionUnits: workspace.session_units,
  transactions: workspace.transactions,
  expenses: workspace.expenses,
  cashMovements: workspace.cash_movements,
  operators: DEFAULT_OPERATORS,
});
const closedSession = workspace.sessions.find((session) => session.statut === "cloturee");
const sessionFormsHtml = renderToString(<div>
  <TransactionModal
    sessions={[openSession]}
    summaries={sessionSummaries}
    points={workspace.points}
    operators={DEFAULT_OPERATORS}
    rules={workspace.commission_baremes}
    onClose={() => {}}
    onSave={async () => {}}
  />
  <OpenSessionModal
    points={workspace.points}
    operators={DEFAULT_OPERATORS}
    selectedDate={date}
    isHistorical={false}
    lastCounts={lastCounts}
    onClose={() => {}}
    onSave={async () => {}}
  />
  {closedSession && <CloseSessionModal
    session={closedSession}
    point={workspace.points.find((point) => point.id === closedSession.point_id)}
    summary={selectedSummary}
    operators={DEFAULT_OPERATORS}
    floats={workspace.session_floats}
    units={workspace.session_units}
    onClose={() => {}}
    onSave={async () => {}}
  />}
</div>);

const checks = [
  ["UnitsPage", unitsHtml, ["Unités &amp; transferts", "Prévision de rupture", "Barèmes de vente", "Marge sur les unités", "Reçu"]],
  ["PilotagePage", pilotageHtml, ["Pilotage &amp; prévisions", "Centre d&#x27;alertes", "Consolidation par point", "Rupture prévue", "Performance de l&#x27;équipe", "Commissions opérateur"]],
  ["ClientsPage", clientsHtml, ["Clients &amp; encaissements", "Carnet de crédit", "Fatou B.", "En retard"]],
  ["Modals", modalsHtml, ["Mouvement de caisse", "Accorder un crédit client", "Enregistrer un remboursement", "Ajouter un relevé de commissions", "Barème de vente d&#x27;unités", "Encaissement marchand", "Ajuster le stock"]],
  ["OverviewPage", overviewHtml, ["Centre d&#x27;alertes", "Récap du soir", "Mouvements d&#x27;espèces", "Marge sur les unités"]],
  ["OperationsPage", operationsHtml, ["Opérations", "Mouvement de caisse", "Journal des transactions"]],
  ["CashPage", cashHtml, ["Caisse &amp; clôture", "Mouvement d&#x27;espèces", "Mouvements d&#x27;espèces de la session"]],
  ["TeamPage", teamHtml, ["Équipe", "Performance de l&#x27;équipe", "Ticket moyen"]],
  ["SettingsPage", settingsHtml, ["Réglages", "Barèmes de vente d&#x27;unités", "Seuils d&#x27;alerte", "Journal d&#x27;audit", "Récapitulatifs"]],
  ["Formulaires de session", sessionFormsHtml, ["Nouvelle opération", "Ouvrir une session de caisse", "Dernier comptage", "Clôturer la session"]],
  ["AlertsCenter", alertsHtml, ["Float épuisé", "Float bas", "Accès à renouveler", "Voir la caisse"]],
  ["AuditList", auditHtml, ["session.ouverture", "transaction.annulation"]],
];

let failures = 0;
for (const [name, html, expected] of checks) {
  const missing = expected.filter((needle) => !html.includes(needle));
  if (missing.length) {
    failures += 1;
    console.error(`✗ ${name} : ${missing.join(", ")} introuvable(s) (${html.length} chars)`);
  } else {
    console.log(`✓ ${name} (${html.length} chars)`);
  }
}

console.log("Alertes générées :", alerts.length, "·", alerts.map((alert) => alert.code).join(", "));
console.log("Consolidation :", consolidation.rows.length, "points · résultat", consolidation.totals.result);
console.log("Stock unités :", stock.totalStock, "· marge", stock.totalMargin);
console.log("Crédit :", credit.outstanding, "· retard", credit.overdueTotal);

if (failures) {
  console.error(`${failures} vérification(s) en échec`);
  process.exitCode = 1;
} else {
  console.log("Rendu complet : OK");
}
