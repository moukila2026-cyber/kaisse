import { AlertTriangle, ArrowRight, Check, Wallet, X } from "lucide-react";
import { formatMoney } from "../domain/ledger.js";

export function LogoMark({ light = false }) {
  return <div className={`brand-mark ${light ? "light" : ""}`}><Wallet size={20} strokeWidth={2} /></div>;
}

export function FormField({ label, hint, children }) {
  return <label className="form-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export function PageHeading({ eyebrow, title, description, actions }) {
  return <div className="page-heading"><div><div className="page-eyebrow">{eyebrow}</div><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="heading-actions">{actions}</div>}</div>;
}

export function KpiCard({ label, value, hint, icon: Icon, tone = "ink" }) {
  return <article className="kpi-card"><div className={`kpi-icon ${tone}`}><Icon size={19} strokeWidth={1.8} /></div><div className="kpi-label">{label}</div><div className="kpi-value">{value}</div>{hint && <div className="kpi-hint">{hint}</div>}</article>;
}

export function ModalShell({ title, subtitle, onClose, children, wide = false }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={`modal-card ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}><div className="modal-header"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Fermer"><X size={18} /></button></div>{children}</section></div>;
}

export function ModalError({ children }) {
  return children ? <div className="form-alert error"><AlertTriangle size={15} />{children}</div> : null;
}

export function ModalActions({ onCancel, loading, label = "Enregistrer" }) {
  return <div className="modal-actions"><button type="button" className="button button-outline" onClick={onCancel} disabled={loading}>Annuler</button><button type="submit" className="button button-dark" disabled={loading}>{loading ? "Enregistrement…" : label}<ArrowRight size={15} /></button></div>;
}

export function SettingRow({ label, value }) {
  return <div className="setting-row"><span>{label}</span><strong>{value}</strong></div>;
}

export function VarianceBox({ declared, theoretical, variance }) {
  const isZero = Number(variance || 0) === 0;
  return <div className={`variance-box ${isZero ? "zero" : "has-variance"}`}><div className="variance-main"><span>Écart = déclaré − théorique</span><strong>{variance > 0 ? "+" : ""}{formatMoney(variance)}</strong></div><div className="variance-detail"><span>Déclaré {formatMoney(declared)}</span><span>Théorique {formatMoney(theoretical)}</span></div></div>;
}

export function BalanceLine({ icon: Icon, operator, label, amount, declared, variance, closed }) {
  return <div className="balance-line"><div className="balance-label">{operator ? <span className="operator-dot" style={{ "--operator-color": operator.couleur }} /> : <span className="balance-icon"><Icon size={15} /></span>}<span>{label}</span></div><div className="balance-amounts"><strong>{formatMoney(amount)}</strong>{closed && <span className={variance === 0 ? "variance zero" : "variance"}>Déclaré {Number(declared || 0).toLocaleString("fr-FR")} F · {variance > 0 ? "+" : ""}{formatMoney(variance)}</span>}</div></div>;
}

export function EmptyState({ icon: Icon, title, text, children, compact = false }) {
  return <div className={`empty-state ${compact ? "compact" : ""}`}>{Icon && <Icon size={22} />}<strong>{title}</strong>{text && <span>{text}</span>}{children}</div>;
}

export function ProgressBar({ value, max = 100, color = "#2f7d68", label }) {
  const ratio = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return <div className="bar-track" role="img" aria-label={label}><div className="bar-fill" style={{ width: `${value > 0 ? Math.max(ratio, 4) : 0}%`, "--operator-color": color }} /></div>;
}

export function StatusPill({ tone = "ink", children }) {
  return <span className={`status-pill ${tone}`}>{children}</span>;
}

export function CheckLine({ children }) {
  return <li><Check size={14} />{children}</li>;
}
