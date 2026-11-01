import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  ClipboardList,
  HandCoins,
  MessageCircle,
  Minus,
  Plus,
  QrCode,
  ReceiptText,
  Send,
  Users,
} from "lucide-react";
import { formatDate, formatMoney, formatTime } from "../domain/ledger.js";
import { KpiCard, PageHeading } from "../ui/atoms.jsx";
import { HistoryPanel } from "./PilotagePage.jsx";

const CREDIT_SOURCES = [
  { code: "unites", label: "Unités à crédit" },
  { code: "float", label: "Float / dépôt" },
  { code: "marchandise", label: "Marchandise" },
  { code: "autre", label: "Autre" },
];

export default function ClientsPage({
  credit, creditMovements = [], points = [], pointById = new Map(), encaissements = [], messages = [],
  auditLog = [], agents = new Map(), canWrite, onOpenModal, onGo, onShareReminder, today,
}) {
  const [tab, setTab] = useState("credit");
  const overdue = credit.rows.filter((row) => row.overdue > 0);

  return <main className="content-area">
    <PageHeading
      eyebrow={`CLIENTS · ${formatDate(today)}`}
      title="Clients & encaissements"
      description="Carnet de crédit du comptoir, encaissements marchands (QR/lien) et rappels WhatsApp — sans stocker de numéro complet."
      actions={<>
        {canWrite && <button className="button button-outline" onClick={() => onOpenModal("encaissement")}><QrCode size={16} />Encaissement</button>}
        {canWrite && <button className="button button-dark" onClick={() => onOpenModal("credit")}><Plus size={16} />Crédit client</button>}
      </>}
    />

    {credit.overdueTotal > 0 && <div className="alert-card">
      <div className="alert-mark"><AlertTriangle size={18} /></div>
      <div>
        <strong>{formatMoney(credit.overdueTotal)} de crédit en retard</strong>
        <span>{credit.overdueCount} client(s) au-delà de l'échéance : {overdue.slice(0, 3).map((row) => `${row.nom} (${formatMoney(row.overdue)})`).join(" · ")}.</span>
      </div>
      <button className="text-button" onClick={() => onShareReminder?.(overdue)}>Rappel WhatsApp <Send size={14} /></button>
    </div>}

    <div className="kpi-grid">
      <KpiCard label="Crédit en cours" value={formatMoney(credit.outstanding)} hint={`${credit.rows.filter((row) => row.balance > 0).length} client(s) avec un solde`} icon={ClipboardList} tone="gold" />
      <KpiCard label="En retard" value={formatMoney(credit.overdueTotal)} hint={`${credit.overdueCount} client(s) au-delà de l'échéance`} icon={AlertTriangle} tone={credit.overdueCount ? "red" : "ink"} />
      <KpiCard label="Encaissements marchands" value={formatMoney(credit.encaissementsTotal)} hint={`${credit.encaissementsCount} encaissement(s) · commission ${formatMoney(credit.encaissementsCommission)}`} icon={QrCode} tone="blue" />
      <KpiCard label="Messages préparés" value={String(messages.length)} hint="Récapitulatifs et reçus prêts à envoyer depuis votre téléphone" icon={MessageCircle} tone="teal" />
    </div>

    <div className="segmented-tabs">
      <button className={tab === "credit" ? "active" : ""} onClick={() => setTab("credit")}><ClipboardList size={15} />Carnet de crédit</button>
      <button className={tab === "encaissements" ? "active" : ""} onClick={() => setTab("encaissements")}><QrCode size={15} />Encaissements</button>
      <button className={tab === "messages" ? "active" : ""} onClick={() => setTab("messages")}><MessageCircle size={15} />Messages</button>
      <button className={tab === "audit" ? "active" : ""} onClick={() => setTab("audit")}><Banknote size={15} />Audit</button>
    </div>

    {tab === "credit" && <section className="panel">
      <div className="panel-heading">
        <div><h2>Carnet de crédit</h2><p>Un crédit accordé reste une créance de l'agence : à suivre, pas à oublier.</p></div>
        <HandCoins size={19} className="panel-heading-icon" />
      </div>
      {credit.rows.length ? <div className="table-scroll"><table className="data-table">
        <thead><tr><th>Client</th><th>Point</th><th>Crédit cumulé</th><th>Remboursé</th><th>Solde dû</th><th>Échéance</th><th>Statut</th><th /></tr></thead>
        <tbody>{credit.rows.map((row) => <tr key={row.key}>
          <td><div className="operation-cell"><strong>{row.nom}</strong><small>{row.telephone || "numéro masqué"}</small></div></td>
          <td>{pointById.get(row.pointId)?.nom || "—"}</td>
          <td>{formatMoney(row.credit)}</td>
          <td>{formatMoney(row.repaid)}</td>
          <td className="amount-cell">{formatMoney(row.balance)}</td>
          <td>{row.dueDate ? formatDate(row.dueDate) : "—"}</td>
          <td>{row.balance <= 0 ? <span className="unit-status">Soldé</span> : row.overdue > 0 ? <span className="unit-status cancelled">En retard</span> : <span className="credit-status">En cours</span>}</td>
          <td>{canWrite && row.balance > 0 && <button className="row-action" onClick={() => onOpenModal("credit-remboursement", row)}>Rembourser</button>}</td>
        </tr>)}</tbody>
      </table></div> : <div className="empty-state compact"><Users size={22} /><strong>Aucun crédit client enregistré.</strong><span>Enregistrez une avance d'unités ou de float pour la suivre et relancer le client au bon moment.</span>{canWrite && <button className="button button-dark" onClick={() => onOpenModal("credit")}>Accorder un crédit</button>}</div>}
      <div className="ledger-footnote"><AlertTriangle size={16} /><span>Kaisse ne fait pas de scoring de crédit et n'envoie pas de relance automatique. Le nom et le numéro masqué sont saisis par l'agence, sous sa responsabilité.</span></div>
    </section>}

    {tab === "encaissements" && <section className="panel">
      <div className="panel-heading">
        <div><h2>Encaissements marchands</h2><p>QR code, lien de paiement ou espèces reçues pour un service.</p></div>
        <QrCode size={19} className="panel-heading-icon" />
      </div>
      {encaissements.length ? <div className="table-scroll"><table className="data-table">
        <thead><tr><th>Heure</th><th>Opérateur</th><th>Mode</th><th>Montant</th><th>Commission</th><th>Référence</th><th>Note</th></tr></thead>
        <tbody>{encaissements.map((row) => <tr key={row.id}>
          <td className="time-cell">{formatTime(row.created_at)}</td>
          <td>{row.operateur_code}</td>
          <td>{row.mode === "qrcode" ? "QR code" : row.mode === "lien" ? "Lien" : "Espèces"}</td>
          <td className="amount-cell">{formatMoney(row.montant)}</td>
          <td>{formatMoney(row.commission)}</td>
          <td className="reference-cell">{row.reference || "—"}</td>
          <td>{row.note || "—"}</td>
        </tr>)}</tbody>
      </table></div> : <div className="empty-state compact"><QrCode size={22} /><strong>Aucun encaissement marchand.</strong><span>Suivez les paiements reçus par QR code ou lien de paiement, avec la commission marchand.</span>{canWrite && <button className="button button-dark" onClick={() => onOpenModal("encaissement")}>Enregistrer un encaissement</button>}</div>}
      <div className="ledger-footnote"><Banknote size={16} /><span>Le paiement est encaissé dans l'application de l'opérateur (Wave, Orange…) ; Kaisse en garde la trace pour la caisse et les commissions.</span></div>
    </section>}

    {tab === "messages" && <section className="panel">
      <div className="panel-heading">
        <div><h2>Messages préparés</h2><p>Récapitulatifs et reçus prêts à copier dans WhatsApp.</p></div>
        <MessageCircle size={19} className="panel-heading-icon" />
      </div>
      {messages.length ? <div className="message-list">{messages.map((message) => <div className="message-row" key={message.id}>
        <span className={`message-canal ${message.canal}`}><MessageCircle size={14} />{message.canal}</span>
        <div><strong>{message.destinataire || "Destinataire"}</strong><p>{message.contenu}</p></div>
        <button className="button button-outline" onClick={() => navigator.clipboard?.writeText(message.contenu)}>Copier</button>
      </div>)}</div> : <div className="empty-state compact"><MessageCircle size={22} /><strong>Aucun message préparé.</strong><span>Utilisez « Récap du soir » ou « Reçu » pour générer un message à envoyer.</span></div>}
      <div className="ledger-footnote"><CheckCircle2 size={16} /><span>Aucun message n'est envoyé automatiquement : Kaisse prépare le texte, vous choisissez le destinataire dans WhatsApp ou par SMS.</span></div>
    </section>}

    {tab === "audit" && <HistoryPanel auditLog={auditLog} agents={agents} />}

    <div className="clients-links">
      <button className="text-button" onClick={() => onGo("caisse")}><Minus size={14} />Mouvements de caisse<ArrowRight size={14} /></button>
      <button className="text-button" onClick={() => onGo("pilotage")}><ReceiptText size={14} />Pilotage & relevés<ArrowRight size={14} /></button>
    </div>
  </main>;
}

export { CREDIT_SOURCES };
