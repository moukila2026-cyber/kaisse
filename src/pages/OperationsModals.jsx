import { useState } from "react";
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, Landmark, MessageCircle, PiggyBank, ReceiptText, Send } from "lucide-react";
import { CASH_MOVEMENT_SOURCES, formatMoney, todayInAbidjan } from "../domain/ledger.js";
import { FormField, ModalActions, ModalError, ModalShell } from "../ui/atoms.jsx";
import { safeAmount } from "../ui/helpers.js";

export function CashMovementModal({ sessions, points, onClose, onSave }) {
  const [sessionId, setSessionId] = useState(sessions[0]?.id || "");
  const [sens, setSens] = useState("entree");
  const [source, setSource] = useState(CASH_MOVEMENT_SOURCES[0].code);
  const [amount, setAmount] = useState("");
  const [motif, setMotif] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      if (!sessionId) throw new Error("Aucune session de caisse ouverte.");
      const money = safeAmount(amount, "Le montant");
      if (motif.trim().length < 3) throw new Error("Indiquez le motif du mouvement (3 caractères minimum).");
      setLoading(true);
      await onSave({ session_id: sessionId, sens, source, montant: money, motif: motif.trim() });
      onClose();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setLoading(false);
    }
  }

  return <ModalShell title="Mouvement de caisse" subtitle="Dépôt en banque, renfort de fonds de caisse ou alimentation du coffre." onClose={onClose}>
    {sessions.length ? <form className="modal-form" onSubmit={submit}>
      <FormField label="Session de caisse"><select value={sessionId} onChange={(event) => setSessionId(event.target.value)}>{sessions.map((session) => <option key={session.id} value={session.id}>{points.find((point) => point.id === session.point_id)?.nom || "Point"}</option>)}</select></FormField>
      <div className="operation-type-picker unit-mode-picker">
        <button type="button" className={sens === "entree" ? "active" : ""} onClick={() => setSens("entree")}><ArrowDownCircle size={15} />Entrée d'espèces</button>
        <button type="button" className={sens === "sortie" ? "active" : ""} onClick={() => setSens("sortie")}><ArrowUpCircle size={15} />Sortie d'espèces</button>
      </div>
      <div className="form-row">
        <FormField label="Origine / destination"><select value={source} onChange={(event) => setSource(event.target.value)}>{CASH_MOVEMENT_SOURCES.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></FormField>
        <FormField label="Montant (FCFA)"><input required autoFocus type="number" min="1" step="1" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Ex. 100 000" /></FormField>
      </div>
      <FormField label="Motif" hint="Ex. dépôt des excédents, renfort pour les retraits, alimentation du coffre."><input required value={motif} onChange={(event) => setMotif(event.target.value)} maxLength={160} placeholder="Pourquoi cet argent entre ou sort de la caisse" /></FormField>
      <div className="movement-hint"><Landmark size={14} /><span>{sens === "entree" ? "La caisse espèces augmente" : "La caisse espèces diminue"} de {formatMoney(amount)}.</span></div>
      <ModalError>{error}</ModalError>
      <ModalActions onCancel={onClose} loading={loading} label="Enregistrer le mouvement" />
    </form> : <div className="modal-empty"><PiggyBank size={24} /><strong>Aucune session ouverte.</strong><span>Ouvrez une caisse avant de déplacer des espèces.</span><button type="button" className="button button-outline" onClick={onClose}>Fermer</button></div>}
  </ModalShell>;
}

export function CreditModal({ variant = "credit", row = null, points, onClose, onSave }) {
  const isRepayment = variant === "remboursement";
  const [pointId, setPointId] = useState(points[0]?.id || "");
  const [nom, setNom] = useState(row?.nom || "");
  const [telephone, setTelephone] = useState(row?.telephone || "");
  const [amount, setAmount] = useState("");
  const [source, setSource] = useState("unites");
  const [dueDate, setDueDate] = useState(todayInAbidjan());
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      const money = safeAmount(amount, "Le montant");
      if (!isRepayment && nom.trim().length < 2) throw new Error("Renseignez le nom du client.");
      setLoading(true);
      await onSave({
        point_id: isRepayment ? row.pointId : pointId,
        client_nom: isRepayment ? row.nom : nom.trim(),
        client_telephone: isRepayment ? row.telephone : telephone.trim(),
        sens: isRepayment ? "remboursement" : "credit",
        montant: money,
        source: isRepayment ? row.source || "autre" : source,
        echeance: isRepayment ? null : dueDate,
        note: note.trim(),
      });
      onClose();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setLoading(false);
    }
  }

  return <ModalShell
    title={isRepayment ? "Enregistrer un remboursement" : "Accorder un crédit client"}
    subtitle={isRepayment ? `${row?.nom || "Client"} · solde dû ${formatMoney(row?.balance || 0)}` : "Crédit d'unités, de float ou de marchandise accordé à un client de confiance."}
    onClose={onClose}
  >
    <form className="modal-form" onSubmit={submit}>
      {!isRepayment && <>
        <FormField label="Point de vente"><select value={pointId} onChange={(event) => setPointId(event.target.value)}>{points.map((point) => <option key={point.id} value={point.id}>{point.nom}</option>)}</select></FormField>
        <div className="form-row">
          <FormField label="Nom du client"><input required value={nom} onChange={(event) => setNom(event.target.value)} maxLength={60} placeholder="Ex. Fatou B." /></FormField>
          <FormField label="Téléphone (facultatif)" hint="Seuls 2 chiffres au début et 2 à la fin sont conservés."><input value={telephone} onChange={(event) => setTelephone(event.target.value)} inputMode="tel" maxLength={20} placeholder="07 00 00 00 00" /></FormField>
        </div>
        <FormField label="Nature du crédit"><select value={source} onChange={(event) => setSource(event.target.value)}><option value="unites">Unités à crédit</option><option value="float">Float / dépôt</option><option value="marchandise">Marchandise</option><option value="autre">Autre</option></select></FormField>
      </>}
      <div className="form-row">
        <FormField label="Montant (FCFA)"><input required autoFocus type="number" min="1" step="1" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Ex. 5 000" /></FormField>
        {!isRepayment && <FormField label="Échéance"><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></FormField>}
      </div>
      <FormField label="Note (facultative)"><input value={note} onChange={(event) => setNote(event.target.value)} maxLength={160} placeholder="Ex. remboursement prévu vendredi" /></FormField>
      {isRepayment && Number(amount) > Number(row?.balance || 0) && <div className="field-note"><AlertTriangle size={14} />Le montant dépasse le solde dû : vérifiez la saisie.</div>}
      <ModalError>{error}</ModalError>
      <ModalActions onCancel={onClose} loading={loading} label={isRepayment ? "Enregistrer le remboursement" : "Enregistrer le crédit"} />
    </form>
  </ModalShell>;
}

export function StatementModal({ operators, onClose, onSave }) {
  const [operatorCode, setOperatorCode] = useState(operators[0]?.code || "orange");
  const [start, setStart] = useState(todayInAbidjan());
  const [end, setEnd] = useState(todayInAbidjan());
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [source, setSource] = useState("SMS opérateur");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      if (start > end) throw new Error("La date de début doit précéder la date de fin.");
      setLoading(true);
      await onSave({
        operateur_code: operatorCode,
        periode_debut: start,
        periode_fin: end,
        montant_recu: safeAmount(amount, "La commission reçue", true),
        reference: reference.trim(),
        source: source.trim(),
      });
      onClose();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setLoading(false);
    }
  }

  return <ModalShell title="Ajouter un relevé de commissions" subtitle="Comparez ce que l'opérateur a réellement versé aux commissions constatées." onClose={onClose}>
    <form className="modal-form" onSubmit={submit}>
      <FormField label="Opérateur"><select value={operatorCode} onChange={(event) => setOperatorCode(event.target.value)}>{operators.map((operator) => <option key={operator.code} value={operator.code}>{operator.nom}</option>)}</select></FormField>
      <div className="form-row">
        <FormField label="Début de période"><input type="date" required value={start} onChange={(event) => setStart(event.target.value)} /></FormField>
        <FormField label="Fin de période"><input type="date" required value={end} onChange={(event) => setEnd(event.target.value)} /></FormField>
      </div>
      <FormField label="Commission réellement reçue (FCFA)"><input required type="number" min="0" step="1" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Ex. 12 500" /></FormField>
      <div className="form-row">
        <FormField label="Référence du relevé"><input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={80} placeholder="Ex. RELEVE-OM-1026" /></FormField>
        <FormField label="Source" hint="SMS, portail opérateur, relevé papier…"><input value={source} onChange={(event) => setSource(event.target.value)} maxLength={120} /></FormField>
      </div>
      <ModalError>{error}</ModalError>
      <ModalActions onCancel={onClose} loading={loading} label="Enregistrer le relevé" />
    </form>
  </ModalShell>;
}

export function TariffModal({ operators, onClose, onSave }) {
  const [operatorCode, setOperatorCode] = useState(operators[0]?.code || "orange");
  const [base, setBase] = useState("100");
  const [sale, setSale] = useState("105");
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const margin = Number(sale) - Number(base);

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      const baseValue = safeAmount(base, "La valeur faciale de référence");
      const saleValue = safeAmount(sale, "Le prix de vente");
      setLoading(true);
      await onSave({ operateur_code: operatorCode, prix_valeur_faciale: baseValue, prix_vente: saleValue, source: source.trim() });
      onClose();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setLoading(false);
    }
  }

  return <ModalShell title="Barème de vente d'unités" subtitle="Prix d'achat et prix de vente pour 100 F de valeur faciale." onClose={onClose}>
    <form className="modal-form" onSubmit={submit}>
      <FormField label="Opérateur"><select value={operatorCode} onChange={(event) => setOperatorCode(event.target.value)}>{operators.map((operator) => <option key={operator.code} value={operator.code}>{operator.nom}</option>)}</select></FormField>
      <div className="form-row">
        <FormField label="Valeur faciale de référence (FCFA)"><input required type="number" min="1" step="1" value={base} onChange={(event) => setBase(event.target.value)} /></FormField>
        <FormField label="Prix de vente au client (FCFA)"><input required type="number" min="1" step="1" value={sale} onChange={(event) => setSale(event.target.value)} /></FormField>
      </div>
      <div className="movement-hint"><ReceiptText size={14} /><span>Marge prévue : {formatMoney(margin)} par {formatMoney(base)} de crédit, soit {base ? ((margin / Number(base)) * 100).toFixed(1) : "0"} %.</span></div>
      <FormField label="Source / date de vérification"><input value={source} onChange={(event) => setSource(event.target.value)} maxLength={160} placeholder="Ex. tarif grossiste du 01/11/2026" /></FormField>
      <ModalError>{error}</ModalError>
      <ModalActions onCancel={onClose} loading={loading} label="Enregistrer le barème" />
    </form>
  </ModalShell>;
}

export function EncaissementModal({ points, operators, onClose, onSave }) {
  const [pointId, setPointId] = useState(points[0]?.id || "");
  const [operatorCode, setOperatorCode] = useState(operators[0]?.code || "orange");
  const [mode, setMode] = useState("qrcode");
  const [amount, setAmount] = useState("");
  const [commission, setCommission] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      setLoading(true);
      await onSave({
        point_id: pointId,
        operateur_code: operatorCode,
        mode,
        montant: safeAmount(amount, "Le montant encaissé"),
        commission: commission.trim() === "" ? 0 : safeAmount(commission, "La commission", true),
        reference: reference.trim(),
        note: note.trim(),
      });
      onClose();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setLoading(false);
    }
  }

  return <ModalShell title="Encaissement marchand" subtitle="Paiement reçu par QR code, lien de paiement ou espèces." onClose={onClose}>
    <form className="modal-form" onSubmit={submit}>
      <div className="form-row">
        <FormField label="Point de vente"><select value={pointId} onChange={(event) => setPointId(event.target.value)}>{points.map((point) => <option key={point.id} value={point.id}>{point.nom}</option>)}</select></FormField>
        <FormField label="Opérateur"><select value={operatorCode} onChange={(event) => setOperatorCode(event.target.value)}>{operators.map((operator) => <option key={operator.code} value={operator.code}>{operator.nom}</option>)}</select></FormField>
      </div>
      <FormField label="Mode"><select value={mode} onChange={(event) => setMode(event.target.value)}><option value="qrcode">QR code</option><option value="lien">Lien de paiement</option><option value="especes">Espèces</option></select></FormField>
      <div className="form-row">
        <FormField label="Montant encaissé (FCFA)"><input required type="number" min="1" step="1" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Ex. 15 000" /></FormField>
        <FormField label="Commission marchand (FCFA)" hint="Facultatif : la commission prélevée par l'opérateur."><input type="number" min="0" step="1" inputMode="numeric" value={commission} onChange={(event) => setCommission(event.target.value)} placeholder="0" /></FormField>
      </div>
      <FormField label="Référence (facultatif)"><input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={80} placeholder="Référence de la transaction" /></FormField>
      <FormField label="Note (facultative)"><input value={note} onChange={(event) => setNote(event.target.value)} maxLength={160} placeholder="Ex. vente de crédit prépayé" /></FormField>
      <ModalError>{error}</ModalError>
      <ModalActions onCancel={onClose} loading={loading} label="Enregistrer l'encaissement" />
    </form>
  </ModalShell>;
}

export function MessageModal({ title = "Message client", text = "", destinataire = "", onClose, onSend }) {
  const [content, setContent] = useState(text);
  return <ModalShell title={title} subtitle="Message préparé — aucun envoi automatique." onClose={onClose}>
    <div className="modal-form">
      <FormField label="Destinataire"><input value={destinataire} readOnly /></FormField>
      <FormField label="Message"><textarea rows={9} value={content} onChange={(event) => setContent(event.target.value)} /></FormField>
      <div className="modal-actions">
        <button type="button" className="button button-outline" onClick={onClose}>Fermer</button>
        <button type="button" className="button button-soft" onClick={() => navigator.clipboard?.writeText(content)}>Copier</button>
        <button type="button" className="button button-dark" onClick={() => onSend(content)}><MessageCircle size={15} />Partager<Send size={14} /></button>
      </div>
    </div>
  </ModalShell>;
}

export function ReceiptModal({ receipt, onClose, onSend }) {
  return <MessageModal title="Reçu client" text={receipt.text} destinataire={receipt.destinataire || "Client"} onClose={onClose} onSend={onSend} />;
}
