import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BellRing,
  CalendarClock,
  CheckCircle2,
  Download,
  HandCoins,
  History,
  Landmark,
  LineChart,
  Package,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { formatDate, formatMoney, getReportDateRange } from "../domain/ledger.js";
import { forecastLabel } from "../domain/forecast.js";
import { PageHeading } from "../ui/atoms.jsx";

const SEVERITY_TONE = { critique: "red", haute: "gold", moyenne: "blue", info: "ink" };

export function AlertsCenter({ alerts = [], onGo, compact = false }) {
  if (!alerts.length) {
    return <div className="alert-center empty">
      <CheckCircle2 size={19} />
      <div><strong>Aucune alerte</strong><span>Stock, float, sessions et abonnement sont dans les repères configurés.</span></div>
    </div>;
  }
  return <div className={`alert-center ${compact ? "compact" : ""}`}>
    {alerts.map((alert) => <div className={`alert-line ${alert.severity}`} key={alert.id}>
      <span className={`alert-severity ${alert.severity}`}>{SEVERITY_TONE[alert.severity] === "red" ? "!" : alert.severity === "haute" ? "▲" : "•"}</span>
      <div><strong>{alert.title}</strong><span>{alert.detail}</span></div>
      {alert.action && <button className="text-button" onClick={() => onGo(alert.action.page)}>{alert.action.label}<ArrowRight size={14} /></button>}
    </div>)}
  </div>;
}

function ForecastRow({ row, unitLabel }) {
  const max = Math.max(1, ...row.series.map((point) => point.consumption));
  const tone = row.level === "rupture" ? "red" : row.level === "critique" || row.level === "bas" ? "gold" : "teal";
  return <div className="forecast-row">
    <div className="forecast-head">
      <span className="operator-name"><span className="operator-dot" style={{ "--operator-color": row.couleur }} />{row.nom}</span>
      <span className={`forecast-badge ${tone}`}>{forecastLabel(row.level)}</span>
    </div>
    <div className="forecast-body">
      <div className="forecast-bars" aria-hidden>
        {row.series.map((point) => <span key={point.date} className="forecast-bar" title={`${point.date} : ${formatMoney(point.consumption)}`} style={{ height: `${Math.max(4, (point.consumption / max) * 100)}%` }} />)}
      </div>
      <div className="forecast-stats">
        <div><span>Stock actuel</span><strong>{formatMoney(row.stock)}</strong></div>
        <div><span>Moyenne / jour</span><strong>{formatMoney(Math.round(row.averageDaily))}</strong></div>
        <div><span>Couverture</span><strong>{row.daysOfCover == null ? "—" : `${row.daysOfCover.toFixed(1)} j`}</strong></div>
        <div><span>Rupture estimée</span><strong>{row.ruptureDate ? formatDate(row.ruptureDate) : "—"}</strong></div>
      </div>
    </div>
    <div className="forecast-reco">
      <span>{row.recommended > 0 ? `Recommander ${formatMoney(row.recommended)} pour couvrir ${unitLabel}` : "Aucun réapprovisionnement conseillé"}</span>
      {row.trend !== 0 && <em className={row.trend > 0 ? "negative" : "positive"}>
        {row.trend > 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
        {row.trend > 0 ? "Demande en hausse" : "Demande en baisse"} ({(row.trend * 100).toFixed(0)} %)
      </em>}
    </div>
  </div>;
}

export default function PilotagePage({
  date, reportRange, period, onPeriodChange, consolidation, unitForecasts, floatForecasts,
  performances, reconciliation, alerts, operators, canManage, canWrite, onGo, onOpenModal, onShareRecap,
}) {
  const weekPlan = getReportDateRange(date, "week");
  const planRows = unitForecasts.filter((row) => row.recommended > 0);
  const totalGap = reconciliation.reduce((sum, row) => sum + (row.coverage == null ? 0 : row.gap), 0);

  return <main className="content-area">
    <PageHeading
      eyebrow={`PILOTAGE · ${formatDate(date)}`}
      title="Pilotage & prévisions"
      description="Consolidation multi-points, rupture estimée, performance de l'équipe et rapprochement des commissions opérateur."
      actions={<>
        <button className="button button-outline" onClick={onShareRecap}><BellRing size={16} />Récap du soir</button>
        {canWrite && <button className="button button-dark" onClick={() => onOpenModal("statement")}><Download size={16} />Relevé commissions</button>}
      </>}
    />

    <section className="pilot-top">
      <div className="panel alert-panel">
        <div className="panel-heading">
          <div><h2>Centre d'alertes</h2><p>{alerts.length} point{alerts.length > 1 ? "s" : ""} d'attention · triés par gravité</p></div>
          <BellRing size={19} className="panel-heading-icon" />
        </div>
        <AlertsCenter alerts={alerts} onGo={onGo} />
      </div>

      <div className="panel plan-panel">
        <div className="panel-heading">
          <div><h2>Plan de réapprovisionnement</h2><p>Semaine du {formatDate(weekPlan.startDate)} au {formatDate(weekPlan.endDate)}</p></div>
          <CalendarClock size={19} className="panel-heading-icon" />
        </div>
        {planRows.length ? <div className="plan-list">
          {planRows.map((row) => <div className="plan-row" key={row.code}>
            <span className="operator-name"><span className="operator-dot" style={{ "--operator-color": row.couleur }} />{row.nom}</span>
            <strong>{formatMoney(row.recommended)}</strong>
            <span className={`plan-when ${row.level}`}>{row.level === "rupture" ? "immédiat" : row.daysOfCover == null ? "libre" : `sous ${Math.max(1, Math.floor(row.daysOfCover))} j`}</span>
            {canWrite && <button className="text-button" onClick={() => onGo("unites")}>Approvisionner <ArrowRight size={13} /></button>}
          </div>)}
        </div> : <div className="empty-inline">Stock suffisant sur la semaine d'après les ventes récentes.</div>}
        <div className="plan-note"><ShieldCheck size={14} /><span>Estimation basée sur la moyenne des sorties de la période affichée. Vérifiez vos carnets de commande avant d'acheter.</span></div>
      </div>
    </section>

    <section className="panel points-consolidation">
      <div className="panel-heading">
        <div><h2>Consolidation par point de vente</h2><p>{consolidation.rows.length} point(s) · {formatDate(reportRange.startDate)} → {formatDate(reportRange.endDate)}</p></div>
        <span className="consolidation-total">{formatMoney(consolidation.totals.result)}<small>résultat estimé</small></span>
      </div>
      <div className="table-scroll">
        <table className="data-table consolidation-table">
          <thead><tr><th>Point</th><th>Sessions</th><th>Opérations</th><th>Volume</th><th>Commissions</th><th>Marge unités</th><th>Dépenses</th><th>Résultat</th><th>Soldes disponibles</th><th>Alertes</th></tr></thead>
          <tbody>{consolidation.rows.map((row) => <tr key={row.point.id}>
            <td><div className="operation-cell"><strong>{row.point.nom}</strong><small>{row.point.ville || "—"}</small></div></td>
            <td>{row.openSessions} ouverte(s) · {row.closedSessions} clôturée(s)</td>
            <td>{row.operations}</td>
            <td className="amount-cell">{formatMoney(row.volume)}</td>
            <td>{formatMoney(row.commissions)}</td>
            <td>{formatMoney(row.unitMargin)}</td>
            <td>{formatMoney(row.expenses)}</td>
            <td><strong className={row.result < 0 ? "negative" : "positive"}>{formatMoney(row.result)}</strong></td>
            <td><div className="operation-cell"><small>Espèces {formatMoney(row.cashExpected)}</small><small>Float {formatMoney(row.floatExpected)}</small><small>Unités {row.unitTracked ? formatMoney(row.unitExpected) : "non suivi"}</small></div></td>
            <td>{row.alerts.length ? <div className="alert-chips">{row.alerts.map((alert) => <span key={alert.code} className={`alert-chip ${alert.code}`}>{alert.label}</span>)}</div> : <span className="positive">OK</span>}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="consolidation-foot">
        <div><span>Trésorerie en session</span><strong>{formatMoney(consolidation.totals.cashExpected + consolidation.totals.floatExpected + consolidation.totals.unitExpected)}</strong></div>
        <div><span>Commissions</span><strong>{formatMoney(consolidation.totals.commissions)}</strong></div>
        <div><span>Marge unités</span><strong>{formatMoney(consolidation.totals.unitMargin)}</strong></div>
        <div><span>Dépenses</span><strong>-{formatMoney(consolidation.totals.expenses)}</strong></div>
        <div><span>Alertes</span><strong>{consolidation.alertCount}</strong></div>
      </div>
    </section>

    <div className="pilot-columns">
      <section className="panel forecast-panel">
        <div className="panel-heading">
          <div><h2>Rupture prévue — stock d'unités</h2><p>Sorties des {unitForecasts[0]?.days || 7} derniers jours, stock des sessions ouvertes</p></div>
          <Package size={19} className="panel-heading-icon" />
        </div>
        {unitForecasts.map((row) => <ForecastRow key={row.code} row={row} unitLabel="7 jours" />)}
        <div className="panel-foot-link"><button className="text-button" onClick={() => onGo("unites")}>Gérer les unités <ArrowRight size={14} /></button></div>
      </section>

      <section className="panel forecast-panel">
        <div className="panel-heading">
          <div><h2>Rupture prévue — float</h2><p>Consommation nette du float par opérateur</p></div>
          <Smartphone size={19} className="panel-heading-icon" />
        </div>
        {floatForecasts.map((row) => <ForecastRow key={row.code} row={row} unitLabel="7 jours" />)}
        <div className="panel-foot-link"><button className="text-button" onClick={() => onGo("caisse")}>Voir la caisse <ArrowRight size={14} /></button></div>
      </section>
    </div>

    <div className="pilot-columns">
      <section className="panel performance-panel">
        <div className="panel-heading">
          <div><h2>Performance de l'équipe</h2><p>Période affichée · classement par volume</p></div>
          <Users size={19} className="panel-heading-icon" />
        </div>
        {performances.length ? <div className="table-scroll"><table className="data-table">
          <thead><tr><th>Agent</th><th>Sessions</th><th>Opérations</th><th>Volume</th><th>Ticket moyen</th><th>Commissions</th><th>Unités vendues</th><th>Dernière activité</th></tr></thead>
          <tbody>{performances.map((row) => <tr key={row.profile.id}>
            <td><div className="operation-cell"><strong>{row.profile.prenom} {row.profile.nom}</strong><small>{row.profile.role}{row.openSession ? " · en session" : ""}</small></div></td>
            <td>{row.sessions}</td>
            <td>{row.operations}</td>
            <td className="amount-cell">{formatMoney(row.volume)}</td>
            <td>{formatMoney(row.averageTicket)}</td>
            <td>{formatMoney(row.commissions)}</td>
            <td>{formatMoney(row.unitsSold)}</td>
            <td className="time-cell">{row.lastActivity ? new Date(row.lastActivity).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
          </tr>)}</tbody>
        </table></div> : <div className="empty-inline">Aucune activité sur la période.</div>}
      </section>

      <section className="panel reconciliation-panel">
        <div className="panel-heading">
          <div><h2>Commissions opérateur</h2><p>Attendu = barèmes · constaté = saisie · reçu = relevé importé</p></div>
          <HandCoins size={19} className="panel-heading-icon" />
        </div>
        <div className="reconciliation-list">
          {reconciliation.map((row) => <div className="recon-row" key={row.operator.code}>
            <span className="operator-name"><span className="operator-dot" style={{ "--operator-color": row.operator.couleur }} />{row.operator.nom}</span>
            <div className="recon-values">
              <span>Attendu <strong>{formatMoney(row.expected)}</strong></span>
              <span>Constaté <strong>{formatMoney(row.declared)}</strong></span>
              <span>Reçu <strong>{formatMoney(row.received)}</strong></span>
            </div>
            <span className={`recon-gap ${row.coverage == null ? "unknown" : Math.abs(row.gap) <= 1 ? "ok" : "warn"}`}>
              {row.coverage == null ? "non rapproché" : Math.abs(row.gap) <= 1 ? "rapproché" : `écart ${formatMoney(row.gap)}`}
            </span>
          </div>)}
        </div>
        <div className="recon-foot">
          <Activity size={15} />
          <span>{totalGap === 0 ? "Aucun écart entre relevés importés et commissions constatées." : `Écart cumulé relevés / constaté : ${formatMoney(totalGap)}.`}</span>
          {canManage && canWrite && <button className="text-button" onClick={() => onOpenModal("statement")}>Ajouter un relevé <ArrowRight size={13} /></button>}
        </div>
        <div className="panel-foot-link"><button className="text-button" onClick={() => onGo("reglages")}>Configurer les barèmes <ArrowRight size={14} /></button></div>
      </section>
    </div>

    <div className="ledger-footnote"><LineChart size={17} /><span>Les prévisions sont des estimations arithmétiques (moyenne des sorties, stock déclaré). Elles ne remplacent pas les relevés opérateur ni le comptage physique.</span></div>
  </main>;
}

export function AuditList({ entries = [], agents = new Map() }) {
  if (!entries.length) return <div className="empty-inline">Aucun événement enregistré.</div>;
  return <div className="audit-list">{entries.map((entry) => <div className="audit-row" key={entry.id}>
    <span className={`audit-dot ${entry.action?.split(".")[0] || "info"}`} />
    <div><strong>{entry.action}</strong><span>{entry.detail || entry.entite}</span></div>
    <span className="audit-meta">{agents.get(entry.acteur_id)?.prenom || "Agent"} · {new Date(entry.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
  </div>)}</div>;
}

export function WeeklyPlanCard({ unitForecasts, onGo }) {
  const rows = unitForecasts.filter((row) => row.recommended > 0);
  return <section className="panel weekly-plan">
    <div className="panel-heading"><div><h2>À commander cette semaine</h2><p>Recommandation de stock par opérateur</p></div><Landmark size={19} className="panel-heading-icon" /></div>
    {rows.length ? rows.map((row) => <div className="weekly-row" key={row.code}>
      <span className="operator-name"><span className="operator-dot" style={{ "--operator-color": row.couleur }} />{row.nom}</span>
      <strong>{formatMoney(row.recommended)}</strong>
      <button className="text-button" onClick={() => onGo("unites")}>Voir <ArrowRight size={13} /></button>
    </div>) : <div className="empty-inline">Rien à commander : le stock couvre la semaine.</div>}
    <div className="plan-note"><BarChart3 size={14} /><span>Calcul : moyenne des sorties récentes × 7 jours − stock actuel.</span></div>
  </section>;
}

export function HistoryPanel({ auditLog, agents }) {
  return <section className="panel history-panel">
    <div className="panel-heading"><div><h2>Journal d'audit</h2><p>Ouvertures, annulations, ajustements et paiements</p></div><History size={19} className="panel-heading-icon" /></div>
    <AuditList entries={auditLog} agents={agents} />
  </section>;
}

export const PILOTAGE_ICONS = { AlertTriangle, RefreshCw };
