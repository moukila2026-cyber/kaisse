import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownCircle,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpCircle,
  Banknote,
  Bell,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  FileText,
  HandCoins,
  History,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Mail,
  MapPin,
  MessageCircle,
  Package,
  PackageSearch,
  Plus,
  QrCode,
  ReceiptText,
  Send,
  Settings,
  Share2,
  ShieldCheck,
  Smartphone,
  Landmark,
  PiggyBank,
  CalendarClock,
  Store,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  X,
} from "lucide-react";
import {
  calculateCommission,
  buildLastCountByPoint,
  calculateSession,
  CASH_MOVEMENT_SOURCES,
  COMMISSION_OPERATION_TYPES,
  csvCell,
  EXPENSE_CATEGORIES,
  filterReportTransactions,
  formatDate,
  formatMoney,
  formatTime,
  getReportDateRange,
  OPERATION_TYPES,
  OPERATION_TYPES_SAISIE,
  settlementAmount,
  todayInAbidjan,
} from "./domain/ledger.js";
import { buildAlerts } from "./domain/alerts.js";
import {
  buildAgentPerformance,
  buildCommissionReconciliation,
  buildCreditBook,
  buildEncaissementSummary,
  buildPointConsolidation,
} from "./domain/consolidation.js";
import { buildFloatForecastFor, buildUnitForecastFor, dateRange } from "./domain/forecast.js";
import { getSubscriptionState } from "./domain/subscription.js";
import {
  canSellUnits,
  computeUnitStock,
  isUnitOperation,
  maskBeneficiary,
  summarizeUnitMovements,
  UNIT_LEVELS,
  UNIT_OPERATION_TYPES,
  unitOperationLabel,
  unitSettlement,
} from "./domain/units.js";
import {
  createDemoWorkspace,
  DEFAULT_OPERATORS,
  DEMO_ACTIVE_KEY,
  DEMO_DATA_KEY,
  makeDemoId,
  readDemoWorkspace,
  writeDemoWorkspace,
} from "./data/demo.js";
import { isSupabaseConfigured, supabase } from "./supabaseClient.js";
import { watchConnectivity } from "./pwa.js";
import {
  addCashMovement,
  addCommissionRule,
  addCommissionStatement,
  addCreditMovement,
  addEncaissement,
  addExpense,
  addPoint,
  addTransaction,
  addUnitTariff,
  cancelTransaction,
  closeCashSession,
  loadWorkspace,
  openCashSession,
  updatePointThresholds,
} from "./services/workspace.js";
import PilotagePage, { AlertsCenter, AuditList } from "./pages/PilotagePage.jsx";
import ClientsPage from "./pages/ClientsPage.jsx";
import {
  CashMovementModal,
  CreditModal,
  EncaissementModal,
  ReceiptModal,
  StatementModal,
  TariffModal,
} from "./pages/OperationsModals.jsx";
import {
  BalanceLine,
  FormField,
  KpiCard,
  LogoMark,
  ModalActions,
  ModalError,
  ModalShell,
  PageHeading,
  SettingRow,
  VarianceBox,
} from "./ui/atoms.jsx";
import {
  escapeHtml,
  getInitials,
  isManager,
  makeErrorMessage,
  safeAmount,
} from "./ui/helpers.js";
import "./styles.css";

const NAV_ITEMS = [
  { id: "apercu", label: "Vue d'ensemble", short: "Accueil", icon: LayoutDashboard },
  { id: "operations", label: "Opérations", short: "Opér.", icon: ArrowLeftRight },
  { id: "unites", label: "Unités & transferts", short: "Unités", icon: Package },
  { id: "caisse", label: "Caisse & clôture", short: "Caisse", icon: Wallet },
  { id: "pilotage", label: "Pilotage & prévisions", short: "Pilote", icon: Activity },
  { id: "clients", label: "Clients & crédit", short: "Clients", icon: HandCoins },
  { id: "equipe", label: "Équipe & points", short: "Équipe", icon: Users },
  { id: "reglages", label: "Réglages", short: "Régl.", icon: Settings },
];

const OPERATION_LABELS = Object.fromEntries(OPERATION_TYPES.map((item) => [item.code, item.label]));
const DEMO_WARNING = "Démonstration — montants et commissions fictifs, enregistrés uniquement sur cet appareil.";

function App() {
  const [screen, setScreen] = useState("landing");
  const [page, setPage] = useState("apercu");
  const [workspace, setWorkspace] = useState(null);
  const [authUser, setAuthUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [loadingDay, setLoadingDay] = useState(false);
  const [selectedDate, setSelectedDate] = useState(todayInAbidjan());
  const [reportPeriod, setReportPeriod] = useState("day");
  const reportRange = useMemo(() => getReportDateRange(selectedDate, reportPeriod), [selectedDate, reportPeriod]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pointFilter, setPointFilter] = useState("tous");
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [modal, setModal] = useState("");
  const [unitTargetOperator, setUnitTargetOperator] = useState("");
  const [modalData, setModalData] = useState(null);
  const [alertDrawer, setAlertDrawer] = useState(false);
  const [online, setOnline] = useState(true);
  const [notice, setNotice] = useState(null);
  const [authMessage, setAuthMessage] = useState("");
  const [authError, setAuthError] = useState("");
  const [clock, setClock] = useState(Date.now());
  const subscription = useMemo(() => getSubscriptionState(workspace?.agency, clock), [workspace?.agency, clock]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => watchConnectivity(setOnline), []);

  useEffect(() => {
    let stillHere = true;
    const restore = async () => {
      try {
        if (localStorage.getItem(DEMO_ACTIVE_KEY) === "true") {
          const demoWorkspace = readDemoWorkspace();
          if (!stillHere) return;
          setWorkspace(demoWorkspace);
          setSelectedDate(demoWorkspace.sessions?.find((session) => session.statut === "ouverte")?.date_caisse || todayInAbidjan());
          setScreen("app");
          setBooting(false);
          return;
        }

        if (isSupabaseConfigured) {
          const { data, error } = await supabase.auth.getSession();
          if (error) throw error;
          if (data.session?.user) {
            if (!stillHere) return;
            setAuthUser(data.session.user);
            setScreen("app");
          }
        }
      } catch (error) {
        console.error("Restauration de session impossible", error);
        if (stillHere) setNotice({ type: "error", text: makeErrorMessage(error) });
      } finally {
        if (stillHere) setBooting(false);
      }
    };
    restore();
    return () => { stillHere = false; };
  }, []);

  useEffect(() => {
    if (!authUser || screen !== "app") return undefined;
    let stillHere = true;
    setLoadingDay(true);
    loadWorkspace(authUser.id, selectedDate, reportRange)
      .then((nextWorkspace) => {
        if (stillHere) {
          setWorkspace(nextWorkspace);
          setNotice(null);
        }
      })
      .catch((error) => {
        if (stillHere) setNotice({ type: "error", text: makeErrorMessage(error) });
      })
      .finally(() => {
        if (stillHere) setLoadingDay(false);
      });
    return () => { stillHere = false; };
  }, [authUser, screen, selectedDate, reportRange, refreshKey]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(null), notice.type === "error" ? 7000 : 3800);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const daySessions = useMemo(() => {
    if (!workspace) return [];
    return workspace.sessions.filter((session) => session.date_caisse === selectedDate)
      .filter((session) => pointFilter === "tous" || session.point_id === pointFilter);
  }, [workspace, selectedDate, pointFilter]);

  const sessionIds = useMemo(() => new Set(daySessions.map((session) => session.id)), [daySessions]);
  const dayTransactions = useMemo(() => (workspace?.transactions || [])
    .filter((transaction) => sessionIds.has(transaction.session_id))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)), [workspace, sessionIds]);
  const reportSessions = useMemo(() => (workspace?.report_sessions || workspace?.sessions || [])
    .filter((session) => session.date_caisse >= reportRange.startDate && session.date_caisse <= reportRange.endDate)
    .filter((session) => pointFilter === "tous" || session.point_id === pointFilter), [workspace, reportRange, pointFilter]);
  const reportSessionIds = useMemo(() => new Set(reportSessions.map((session) => session.id)), [reportSessions]);
  const reportSessionDateById = useMemo(() => new Map(reportSessions.map((session) => [session.id, session.date_caisse])), [reportSessions]);
  const reportTransactions = useMemo(() => (workspace?.report_transactions || workspace?.transactions || [])
    .filter((transaction) => reportSessionIds.has(transaction.session_id))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)), [workspace, reportSessionIds]);
  const dayExpenses = useMemo(() => (workspace?.expenses || [])
    .filter((expense) => sessionIds.has(expense.session_id))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)), [workspace, sessionIds]);
  const sessionSummaries = useMemo(() => daySessions.map((session) => ({
    session,
    totals: calculateSession(
      session,
      workspace?.session_floats || [],
      dayTransactions,
      dayExpenses,
      workspace?.session_units || [],
      workspace?.operators || DEFAULT_OPERATORS,
      workspace?.cash_movements || [],
    ),
  })), [daySessions, workspace, dayTransactions, dayExpenses]);
  const lastCountByPoint = useMemo(() => buildLastCountByPoint({
    points: workspace?.points || [],
    sessions: workspace?.sessions || [],
    sessionFloats: workspace?.session_floats || [],
    sessionUnits: workspace?.session_units || [],
    transactions: workspace?.transactions || [],
    expenses: workspace?.expenses || [],
    cashMovements: workspace?.cash_movements || [],
    operators: workspace?.operators || DEFAULT_OPERATORS,
  }), [workspace]);

  const selectableSessions = sessionSummaries;
  const selectedSession = sessionSummaries.find(({ session }) => session.id === selectedSessionId)?.session || null;
  const selectedSummary = sessionSummaries.find(({ session }) => session.id === selectedSession?.id)?.totals || null;

  useEffect(() => {
    if (!sessionSummaries.length) {
      setSelectedSessionId("");
      return;
    }
    if (sessionSummaries.some(({ session }) => session.id === selectedSessionId)) return;
    const preferred = sessionSummaries.find(({ session }) => session.agent_id === workspace?.user?.id && session.statut === "ouverte")
      || sessionSummaries.find(({ session }) => session.statut === "ouverte")
      || sessionSummaries[0];
    setSelectedSessionId(preferred?.session.id || "");
  }, [sessionSummaries, selectedSessionId, workspace?.user?.id]);

  const ownOpenSessions = daySessions.filter((session) => session.agent_id === workspace?.user?.id && session.statut === "ouverte");
  const commissionDeclaredTotal = dayTransactions.filter((transaction) => !transaction.annulee_le)
    .reduce((sum, transaction) => sum + Number(transaction.commission_reelle || 0), 0);
  const commissionEstimatedTotal = dayTransactions.filter((transaction) => !transaction.annulee_le)
    .reduce((sum, transaction) => sum + Number(transaction.commission_estimee || 0), 0);
  const commissionNeedsReview = dayTransactions.filter((transaction) => !transaction.annulee_le && transaction.type_operation !== "approvisionnement_unites" && transaction.commission_reelle == null).length;
  const volumeTotal = dayTransactions.filter((transaction) => !transaction.annulee_le)
    .reduce((sum, transaction) => sum + Number(transaction.montant || 0), 0);
  const closedWithDifference = sessionSummaries.filter(({ session, totals }) => session.statut === "cloturee"
    && (Number(totals.cashVariance || 0) !== 0 || totals.floatHasDifference || totals.unitHasDifference || !totals.unitTracked));
  const expensesTotal = dayExpenses.reduce((sum, expense) => sum + Number(expense.montant || 0), 0);
  const resultEstimate = commissionDeclaredTotal - expensesTotal;

  const agentById = useMemo(() => new Map((workspace?.profiles || []).map((profile) => [profile.id, profile])), [workspace]);
  const pointById = useMemo(() => new Map((workspace?.points || []).map((point) => [point.id, point])), [workspace]);
  const operatorByCode = useMemo(() => new Map((workspace?.operators || []).map((operator) => [operator.code, operator])), [workspace]);

  // --- Suivi des unités téléphoniques (section « Unités & transferts ») ---
  const unitThresholdByOperator = useMemo(() => {
    const visiblePoints = (workspace?.points || []).filter((point) => pointFilter === "tous" || point.id === pointFilter);
    const thresholds = visiblePoints
      .map((point) => (point.seuil_alerte_unites == null ? null : Number(point.seuil_alerte_unites)))
      .filter((value) => value != null && Number.isFinite(value) && value > 0);
    const threshold = thresholds.length ? Math.max(...thresholds) : null;
    const operators = workspace?.operators?.length ? workspace.operators : DEFAULT_OPERATORS;
    return Object.fromEntries(operators.map((operator) => [operator.code, threshold]));
  }, [workspace, pointFilter]);

  const unitStockOverview = useMemo(() => computeUnitStock({
    operators: workspace?.operators?.length ? workspace.operators : DEFAULT_OPERATORS,
    sessions: daySessions,
    sessionUnits: workspace?.session_units || [],
    transactions: dayTransactions,
    thresholds: unitThresholdByOperator,
  }), [workspace, daySessions, dayTransactions, unitThresholdByOperator]);

  const unitJournal = useMemo(() => reportTransactions.filter(isUnitOperation), [reportTransactions]);
  const unitPeriodSummary = useMemo(() => summarizeUnitMovements(unitJournal), [unitJournal]);

  const forecastDays = Math.min(14, Math.max(3, reportRange.days));
  const unitForecasts = useMemo(() => buildUnitForecastFor({
    operators: workspace?.operators?.length ? workspace.operators : DEFAULT_OPERATORS,
    transactions: reportTransactions,
    stock: unitStockOverview.byCode,
    endDate: selectedDate,
    days: forecastDays,
  }), [workspace, reportTransactions, unitStockOverview, selectedDate, forecastDays]);

  const floatStockByOperator = useMemo(() => {
    const totals = {};
    for (const { session, totals: sessionTotals } of sessionSummaries) {
      if (session.statut !== "ouverte") continue;
      for (const [code, row] of Object.entries(sessionTotals.floatMap || {})) {
        totals[code] = (totals[code] || 0) + Number(row.theorique || 0);
      }
    }
    return Object.fromEntries(Object.entries(totals).map(([code, theorique]) => [code, { theorique }]));
  }, [sessionSummaries]);

  const floatForecasts = useMemo(() => buildFloatForecastFor({
    operators: workspace?.operators?.length ? workspace.operators : DEFAULT_OPERATORS,
    transactions: reportTransactions,
    expenses: workspace?.expenses || [],
    floats: floatStockByOperator,
    endDate: selectedDate,
    days: forecastDays,
  }), [workspace, reportTransactions, floatStockByOperator, selectedDate, forecastDays]);

  const consolidation = useMemo(() => buildPointConsolidation({
    points: (workspace?.points || []).filter((point) => pointFilter === "tous" || point.id === pointFilter),
    sessions: reportSessions,
    transactions: reportTransactions,
    expenses: workspace?.expenses || [],
    sessionFloats: workspace?.session_floats || [],
    sessionUnits: workspace?.session_units || [],
    cashMovements: workspace?.cash_movements || [],
    operators: workspace?.operators?.length ? workspace.operators : DEFAULT_OPERATORS,
    thresholds: unitThresholdByOperator,
  }), [workspace, reportSessions, reportTransactions, pointFilter, unitThresholdByOperator]);

  const performances = useMemo(() => buildAgentPerformance({
    profiles: workspace?.profiles || [],
    sessions: reportSessions,
    transactions: reportTransactions,
  }), [workspace, reportSessions, reportTransactions]);

  const reconciliation = useMemo(() => buildCommissionReconciliation({
    transactions: reportTransactions,
    statements: workspace?.commission_statements || [],
    operators: workspace?.operators?.length ? workspace.operators : DEFAULT_OPERATORS,
  }), [workspace, reportTransactions]);

  const creditBook = useMemo(() => buildCreditBook({
    movements: workspace?.credit_movements || [],
    points: workspace?.points || [],
    today: selectedDate,
  }), [workspace, selectedDate]);

  const encaissementSummary = useMemo(
    () => buildEncaissementSummary(workspace?.encaissements || []),
    [workspace],
  );

  const creditSummary = {
    ...creditBook,
    encaissementsTotal: encaissementSummary.total,
    encaissementsCount: encaissementSummary.count,
    encaissementsCommission: encaissementSummary.commission,
  };

  const alertList = useMemo(() => buildAlerts({
    unitStock: unitStockOverview,
    floatMap: Object.fromEntries(Object.entries(floatStockByOperator).map(([code, row]) => [code, row])),
    point: pointFilter === "tous"
      ? (workspace?.points?.[0] || null)
      : (workspace?.points || []).find((point) => point.id === pointFilter) || null,
    subscription,
    forecasts: [...unitForecasts, ...floatForecasts].map((row) => ({
      ...row,
      nom: row.nom,
    })),
    sessions: workspace?.sessions || [],
    today: todayInAbidjan(),
    credit: creditBook,
    now: Date.now(),
  }), [unitStockOverview, floatStockByOperator, workspace, subscription, unitForecasts, floatForecasts, creditBook, pointFilter]);


  function updateDemo(updater) {
    setWorkspace((previous) => {
      if (!previous?.demo) return previous;
      const next = updater(previous);
      writeDemoWorkspace(next);
      return next;
    });
  }

  async function refreshAfterSave() {
    if (workspace?.demo) {
      setWorkspace(readDemoWorkspace());
    } else {
      setRefreshKey((key) => key + 1);
    }
  }

  function ensureCanWrite() {
    if (!subscription.canWrite) {
      throw new Error("La période d'accès est terminée. Vos données restent consultables et exportables; contactez Kaisse pour réactiver l'agence.");
    }
  }

  async function handleAuthSubmit({ mode, kind, form }) {
    setAuthError("");
    setAuthMessage("");
    if (!isSupabaseConfigured) {
      setAuthError("La connexion à Supabase n'est pas configurée. Vous pouvez tester l'application en mode démonstration.");
      return;
    }

    try {
      if (mode === "connexion") {
        const { data, error } = await supabase.auth.signInWithPassword({ email: form.email.trim(), password: form.password });
        if (error) throw error;
        setAuthUser(data.user);
        setSelectedDate(todayInAbidjan());
        setReportPeriod("day");
        setScreen("app");
        setPage("apercu");
        return;
      }

      const metadata = {
        mode_inscription: kind,
        nom: form.nom.trim(),
        prenom: form.prenom.trim(),
        telephone: form.telephone.trim(),
      };
      if (kind === "creation_agence") {
        metadata.nom_agence = form.nom_agence.trim();
        metadata.ville = form.ville.trim() || "Daloa";
        metadata.premier_point = form.premier_point.trim() || "Point principal";
      } else {
        metadata.code_invitation = form.code_invitation.trim().toUpperCase();
      }

      const { data, error } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: { data: metadata },
      });
      if (error) throw error;
      if (data.session?.user) {
        setAuthUser(data.session.user);
        setSelectedDate(todayInAbidjan());
        setReportPeriod("day");
        setScreen("app");
        setPage("apercu");
      } else {
        setAuthMessage("Compte créé. Confirmez votre adresse email, puis connectez-vous : votre agence ou votre profil d'agent sera prêt.");
      }
    } catch (error) {
      setAuthError(makeErrorMessage(error));
    }
  }

  function startDemo() {
    const demoWorkspace = readDemoWorkspace();
    localStorage.setItem(DEMO_ACTIVE_KEY, "true");
    setAuthUser(null);
    setWorkspace(demoWorkspace);
    setSelectedDate(demoWorkspace.sessions?.find((session) => session.statut === "ouverte")?.date_caisse || todayInAbidjan());
    setReportPeriod("day");
    setPointFilter("tous");
    setPage("apercu");
    setScreen("app");
    setNotice({ type: "success", text: "Démo ouverte. Toutes les modifications restent dans ce navigateur." });
  }

  async function signOut() {
    if (workspace?.demo) {
      localStorage.removeItem(DEMO_ACTIVE_KEY);
    } else if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
    setAuthUser(null);
    setWorkspace(null);
    setScreen("landing");
    setNotice(null);
  }

  async function saveTransaction(payload) {
    const session = ownOpenSessions.find((item) => item.id === payload.session_id);
    if (!session) throw new Error("Ouvrez d'abord une session de caisse avec votre compte agent.");
    if (payload.type_operation === "approvisionnement_unites" || payload.type_operation === "transfert_unites" || payload.type_operation === "ajustement_unites") {
      const totals = sessionSummaries.find(({ session: item }) => item.id === payload.session_id)?.totals;
      if (!totals?.unitTracked) throw new Error("Le stock initial n'est pas suivi sur cette ancienne session. Clôturez-la, puis ouvrez une nouvelle session avec le stock de départ.");
      const available = totals.unitMap[payload.operateur_code]?.theorique || 0;
      if (payload.type_operation === "transfert_unites") {
        const check = canSellUnits({ available, amount: payload.montant });
        if (!check.ok) throw new Error(check.message);
      }
      if (payload.type_operation === "ajustement_unites" && payload.ajustement_sens === "sortie") {
        const check = canSellUnits({ available, amount: payload.montant });
        if (!check.ok) throw new Error(check.message.replace("Stock insuffisant", "Stock insuffisant pour cet ajustement"));
      }
    }
    // Le bénéficiaire masqué n'est envoyé que s'il existe : un projet Supabase qui
    // n'a pas encore reçu la migration 004 continue de fonctionner.
    const { beneficiaire_masque: beneficiary, ...rest } = payload;
    const row = {
      ...rest,
      ...(beneficiary ? { beneficiaire_masque: maskBeneficiary(beneficiary) } : {}),
      agence_id: workspace.agency.id,
      point_id: session.point_id,
      agent_id: workspace.user.id,
    };

    if (workspace.demo) {
      const transaction = { ...row, id: makeDemoId("tx"), created_at: new Date().toISOString(), annulee_le: null, annulee_par: null, motif_annulation: null };
      updateDemo((previous) => ({ ...previous, transactions: [transaction, ...previous.transactions] }));
    } else {
      await addTransaction(row);
      await refreshAfterSave();
    }
    setNotice({ type: "success", text: "Opération enregistrée dans le journal." });
  }

  async function saveExpense(payload) {
    const session = ownOpenSessions.find((item) => item.id === payload.session_id);
    if (!session) throw new Error("Ouvrez d'abord une session de caisse avec votre compte agent.");
    const row = {
      ...payload,
      agence_id: workspace.agency.id,
      point_id: session.point_id,
      agent_id: workspace.user.id,
    };
    if (workspace.demo) {
      const expense = { ...row, id: makeDemoId("depense"), created_at: new Date().toISOString() };
      updateDemo((previous) => ({ ...previous, expenses: [expense, ...previous.expenses] }));
    } else {
      await addExpense(row);
      await refreshAfterSave();
    }
    setNotice({ type: "success", text: "Dépense ajoutée à la session." });
  }

  async function saveOpenSession(payload) {
    let sessionId;
    if (workspace.demo) {
      sessionId = makeDemoId("session");
      const session = {
        id: sessionId,
        agence_id: workspace.agency.id,
        point_id: payload.point_id,
        agent_id: workspace.user.id,
        date_caisse: selectedDate,
        statut: "ouverte",
        caisse_ouverture: payload.caisse_ouverture,
        caisse_cloture_declaree: null,
        ouverte_le: new Date().toISOString(),
        cloturee_le: null,
      };
      const floats = Object.entries(payload.soldes).map(([operateur_code, solde_ouverture]) => ({
        session_id: sessionId, operateur_code, solde_ouverture, solde_cloture_declare: null,
      }));
      const units = Object.entries(payload.unites).map(([operateur_code, unites_ouverture]) => ({
        session_id: sessionId, operateur_code, unites_ouverture, unites_cloture_declare: null, stock_initial_non_saisi: false,
      }));
      updateDemo((previous) => ({ ...previous, sessions: [session, ...previous.sessions], session_floats: [...previous.session_floats, ...floats], session_units: [...(previous.session_units || []), ...units] }));
    } else {
      sessionId = await openCashSession({ pointId: payload.point_id, date: selectedDate, cashOpening: payload.caisse_ouverture, openingBalances: payload.soldes, unitOpeningBalances: payload.unites });
      await refreshAfterSave();
    }
    setSelectedSessionId(sessionId);
    setNotice({ type: "success", text: "Session ouverte. Les prochains mouvements seront rapprochés avec ces soldes." });
  }

  async function saveCloseSession(payload) {
    if (!ownOpenSessions.some((session) => session.id === payload.session_id)) {
      throw new Error("Vous ne pouvez clôturer et compter que votre propre session.");
    }
    if (workspace.demo) {
      updateDemo((previous) => ({
        ...previous,
        sessions: previous.sessions.map((session) => session.id === payload.session_id ? {
          ...session,
          statut: "cloturee",
          caisse_cloture_declaree: payload.caisse_declaree,
          cloturee_le: new Date().toISOString(),
        } : session),
        session_floats: previous.session_floats.map((row) => row.session_id === payload.session_id ? {
          ...row,
          solde_cloture_declare: payload.soldes[row.operateur_code],
        } : row),
        session_units: [
          ...(previous.session_units || []).map((row) => row.session_id === payload.session_id ? {
            ...row,
            unites_cloture_declare: payload.unites[row.operateur_code],
          } : row),
          ...Object.entries(payload.unites)
            .filter(([operateur_code]) => !(previous.session_units || []).some((row) => row.session_id === payload.session_id && row.operateur_code === operateur_code))
            .map(([operateur_code, unites_cloture_declare]) => ({ session_id: payload.session_id, operateur_code, unites_ouverture: unites_cloture_declare, unites_cloture_declare, stock_initial_non_saisi: true })),
        ],
      }));
    } else {
      await closeCashSession({ sessionId: payload.session_id, cashDeclared: payload.caisse_declaree, declaredBalances: payload.soldes, declaredUnitBalances: payload.unites });
      await refreshAfterSave();
    }
    setNotice({ type: "success", text: "Clôture enregistrée. Consultez les écarts déclarés / théoriques." });
  }

  async function savePoint(payload) {
    const pointPayload = { ...payload, agence_id: workspace.agency.id };
    if (pointPayload.seuil_alerte_unites == null) delete pointPayload.seuil_alerte_unites;
    if (workspace.demo) {
      const point = { ...pointPayload, id: makeDemoId("point"), actif: true, created_at: new Date().toISOString() };
      updateDemo((previous) => ({ ...previous, points: [...previous.points, point] }));
    } else {
      await addPoint(pointPayload);
      await refreshAfterSave();
    }
    setNotice({ type: "success", text: "Point ajouté à l'agence." });
  }

  async function saveThresholds(pointId, values) {
    ensureCanWrite();
    if (!isManager(workspace?.user)) throw new Error("Seuls le propriétaire et les gérants peuvent modifier les seuils.");
    if (workspace.demo) {
      updateDemo((previous) => ({
        ...previous,
        points: previous.points.map((point) => (point.id === pointId ? { ...point, ...values } : point)),
      }));
    } else {
      await updatePointThresholds(pointId, values);
      await refreshAfterSave();
    }
    setNotice({ type: "success", text: "Seuils d'alerte mis à jour." });
  }

  async function saveRule(payload) {
    ensureCanWrite();
    if (workspace.demo) {
      const rule = { ...payload, id: makeDemoId("bareme"), agence_id: workspace.agency.id, actif: true, created_at: new Date().toISOString() };
      updateDemo((previous) => ({ ...previous, commission_baremes: [...previous.commission_baremes, rule] }));
    } else {
      await addCommissionRule({ ...payload, agence_id: workspace.agency.id });
      await refreshAfterSave();
    }
    setNotice({ type: "success", text: "Barème enregistré. Vérifiez sa source avant de l'utiliser." });
  }

  async function voidTransaction(transaction) {
    if (!isManager(workspace?.user)) return;
    if (!subscription.canWrite) {
      setNotice({ type: "error", text: "La période d'accès est terminée; l'historique reste disponible en lecture seule." });
      return;
    }
    const reason = window.prompt("Motif obligatoire de l'annulation :", "Erreur de saisie");
    if (!reason?.trim()) return;
    try {
      if (workspace.demo) {
        updateDemo((previous) => ({
          ...previous,
          transactions: previous.transactions.map((item) => item.id === transaction.id ? {
            ...item, annulee_le: new Date().toISOString(), annulee_par: workspace.user.id, motif_annulation: reason.trim(),
          } : item),
        }));
      } else {
        await cancelTransaction(transaction.id, reason.trim());
        await refreshAfterSave();
      }
      setNotice({ type: "success", text: "Transaction annulée; elle reste visible dans l'historique." });
    } catch (error) {
      setNotice({ type: "error", text: makeErrorMessage(error) });
    }
  }

  function pushAudit(action, detail, entite = "application", entiteId = null) {
    const entry = {
      id: makeDemoId("audit"), agence_id: workspace?.agency?.id || null, acteur_id: workspace?.user?.id || null,
      action, entite, entite_id: entiteId, detail, created_at: new Date().toISOString(),
    };
    if (workspace?.demo) {
      updateDemo((previous) => ({ ...previous, audit_log: [entry, ...(previous.audit_log || [])] }));
    }
    return entry;
  }

  async function saveCashMovement(payload) {
    const session = ownOpenSessions.find((item) => item.id === payload.session_id);
    if (!session) throw new Error("Ouvrez d'abord une session de caisse avec votre compte agent.");
    const row = {
      ...payload,
      agence_id: workspace.agency.id,
      point_id: session.point_id,
      agent_id: workspace.user.id,
    };
    if (workspace.demo) {
      const movement = { ...row, id: makeDemoId("caisse"), created_at: new Date().toISOString() };
      updateDemo((previous) => ({ ...previous, cash_movements: [movement, ...(previous.cash_movements || [])] }));
      pushAudit("caisse.mouvement", `${payload.sens === "entree" ? "Entrée" : "Sortie"} ${payload.montant} F — ${payload.motif}`);
    } else {
      await addCashMovement(row);
      await refreshAfterSave();
    }
    setNotice({ type: "success", text: "Mouvement de caisse enregistré." });
  }

  async function saveCreditMovement(payload) {
    const row = { ...payload, agence_id: workspace.agency.id, agent_id: workspace.user.id };
    if (workspace.demo) {
      const movement = { ...row, id: makeDemoId("credit"), created_at: new Date().toISOString() };
      updateDemo((previous) => ({ ...previous, credit_movements: [movement, ...(previous.credit_movements || [])] }));
      pushAudit(`credit.${payload.sens}`, `${payload.client_nom} — ${payload.montant} F`);
    } else {
      await addCreditMovement(row);
      await refreshAfterSave();
    }
    setNotice({ type: "success", text: payload.sens === "remboursement" ? "Remboursement enregistré." : "Crédit client enregistré." });
  }

  async function saveStatement(payload) {
    const row = { ...payload, agence_id: workspace.agency.id };
    if (workspace.demo) {
      const statement = { ...row, id: makeDemoId("releve"), created_at: new Date().toISOString() };
      updateDemo((previous) => ({ ...previous, commission_statements: [statement, ...(previous.commission_statements || [])] }));
      pushAudit("commissions.releve", `${payload.operateur_code} — ${payload.montant_recu} F reçus`);
    } else {
      await addCommissionStatement(row);
      await refreshAfterSave();
    }
    setNotice({ type: "success", text: "Relevé de commissions enregistré." });
  }

  async function saveTariff(payload) {
    const row = { ...payload, agence_id: workspace.agency.id, actif: true };
    if (workspace.demo) {
      const tariff = { ...row, id: makeDemoId("tarif"), created_at: new Date().toISOString() };
      updateDemo((previous) => ({ ...previous, unit_tariffs: [tariff, ...(previous.unit_tariffs || [])] }));
      pushAudit("tarif.creation", `${payload.operateur_code} — vente ${payload.prix_vente} / ${payload.prix_valeur_faciale}`);
    } else {
      await addUnitTariff(row);
      await refreshAfterSave();
    }
    setNotice({ type: "success", text: "Barème de vente d'unités enregistré." });
  }

  async function saveEncaissement(payload) {
    const row = { ...payload, agence_id: workspace.agency.id, agent_id: workspace.user.id };
    if (workspace.demo) {
      const payment = { ...row, id: makeDemoId("encaissement"), created_at: new Date().toISOString() };
      updateDemo((previous) => ({ ...previous, encaissements: [payment, ...(previous.encaissements || [])] }));
      pushAudit("encaissement.marchand", `${payload.montant} F — ${payload.operateur_code}`);
    } else {
      await addEncaissement(row);
      await refreshAfterSave();
    }
    setNotice({ type: "success", text: "Encaissement marchand enregistré." });
  }

  function buildDailyRecap() {
    const openTotals = sessionSummaries.filter(({ session }) => session.statut === "ouverte");
    const cash = openTotals.reduce((sum, { totals }) => sum + Number(totals.cashExpected || 0), 0);
    const floatTotal = openTotals.reduce((sum, { totals }) => sum + Number(totals.floatExpected || 0), 0);
    const units = openTotals.reduce((sum, { totals }) => sum + (totals.unitTracked ? Number(totals.unitExpected || 0) : 0), 0);
    const alerts = alertList.slice(0, 4).map((alert) => `• ${alert.title}`);
    return [
      `KAISSE — RÉCAP DU ${formatDate(selectedDate)}`,
      `${workspace.agency.nom}`,
      `Opérations : ${dayTransactions.filter((transaction) => !transaction.annullee_le).length} · volume ${formatMoney(volumeTotal)}`,
      `Commissions déclarées : ${formatMoney(commissionDeclaredTotal)}`,
      `Marge unités : ${formatMoney(unitStockOverview.totalMargin)}`,
      `Dépenses : ${formatMoney(expensesTotal)} · résultat estimé ${formatMoney(resultEstimate + unitStockOverview.totalMargin)}`,
      `Caisse espèces : ${formatMoney(cash)}`,
      `Float électronique : ${formatMoney(floatTotal)}`,
      `Stock d'unités : ${formatMoney(units)}`,
      alerts.length ? "Points d'attention :" : "Aucune alerte.",
      ...alerts,
      "Montants saisis manuellement — vérifiez les relevés opérateur.",
    ].join("\n");
  }

  function prepareMessage(content, destinataire = "Propriétaire", canal = "whatsapp") {
    const message = {
      id: makeDemoId("message"), agence_id: workspace?.agency?.id, canal, destinataire, contenu: content,
      statut: "prepare", created_at: new Date().toISOString(),
    };
    if (workspace?.demo) {
      updateDemo((previous) => ({ ...previous, messages: [message, ...(previous.messages || [])] }));
    }
    return message;
  }

  async function sendExternal(text) {
    try {
      if (navigator.share) {
        await navigator.share({ title: "Kaisse", text });
      } else {
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      if (error?.name !== "AbortError") setNotice({ type: "error", text: "Partage impossible : copiez le message affiché." });
    }
  }

  function shareRecap() {
    const text = buildDailyRecap();
    prepareMessage(text, "Propriétaire");
    setModalData({ text, destinataire: "Propriétaire" });
    setModal("receipt");
  }

  function shareCreditReminder(rows = []) {
    const text = [
      `Rappel crédit — ${workspace.agency.nom}`,
      ...rows.map((row) => `• ${row.nom} : ${formatMoney(row.overdue || row.balance)} échéance ${row.dueDate ? formatDate(row.dueDate) : "non précisée"}`),
      "Merci de régulariser au comptoir. Ce message est préparé par Kaisse, aucun envoi automatique.",
    ].join("\n");
    setModalData({ text, destinataire: "Clients concernés" });
    setModal("receipt");
  }

  function openReceiptFor(transaction) {
    const operator = operatorByCode.get(transaction.operateur_code)?.nom || transaction.operateur_code;
    const text = [
      `${workspace.agency.nom} — REÇU`,
      `${formatDate(selectedDate)} ${formatTime(transaction.created_at)}`,
      `${unitOperationLabel(transaction.type_operation)} · ${operator}`,
      `Valeur : ${formatMoney(transaction.montant)}`,
      `Réglé : ${formatMoney(settlementAmount(transaction))} (${transaction.mode_paiement_unites === "wallet" ? "mobile money" : "espèces"})`,
      `Référence : ${transaction.reference || "—"}`,
      "Merci de votre confiance.",
    ].join("\n");
    prepareMessage(text, transaction.beneficiaire_masque || "Client");
    setModalData({ text, destinataire: transaction.beneficiaire_masque || "Client" });
    setModal("receipt");
  }

  function openUnitModal(variant, operatorCode = "") {
    setUnitTargetOperator(operatorCode);
    setModal(variant);
  }

  function resetDemo() {
    if (!window.confirm("Réinitialiser les données de démonstration sur cet appareil ?")) return;
    const fresh = createDemoWorkspace();
    writeDemoWorkspace(fresh);
    setWorkspace(fresh);
    setSelectedDate(todayInAbidjan());
    setReportPeriod("day");
    setPointFilter("tous");
    setSelectedSessionId("demo-session-open");
    setNotice({ type: "success", text: "La démonstration a été réinitialisée." });
  }

  async function shareDailyReport() {
    const selectedPoint = pointFilter === "tous" ? "Tous les points" : pointById.get(pointFilter)?.nom || "Point";
    const cashLines = selectedSummary
      ? `Caisse théorique : ${formatMoney(selectedSummary.cashExpected)}\nFloat électronique théorique : ${formatMoney(selectedSummary.floatExpected)}\nStock unités théorique : ${selectedSummary.unitTracked ? formatMoney(selectedSummary.unitExpected) : "non suivi"}`
      : "Aucune session de caisse sélectionnée.";
    const varianceLines = selectedSummary?.cashVariance == null
      ? "Écarts : à confirmer à la clôture"
      : `Écart espèces : ${formatMoney(selectedSummary.cashVariance)}\nÉcart float : ${formatMoney(selectedSummary.floatVariance)}\n${selectedSummary.unitTracked ? `Écart stock unités : ${formatMoney(selectedSummary.unitVariance)}` : "Écart stock unités : non calculable"}`;
    const report = [
      `KAISSE PRO — RAPPORT ${selectedDate}`,
      `${workspace.agency.nom} · ${selectedPoint}`,
      `Opérations : ${dayTransactions.filter((row) => !row.annulee_le).length}`,
      `Volume : ${formatMoney(volumeTotal)}`,
      `Commissions déclarées : ${formatMoney(commissionDeclaredTotal)}`,
      `Commissions estimées : ${formatMoney(commissionEstimatedTotal)}`,
      `Dépenses : ${formatMoney(expensesTotal)}`,
      `Résultat estimé : ${formatMoney(resultEstimate)}`,
      cashLines,
      varianceLines,
      "Rapport saisi manuellement — soldes opérateurs non vérifiés par API.",
    ].join("\n");

    try {
      if (navigator.share) {
        await navigator.share({ title: "Rapport Kaisse Pro", text: report });
      } else {
        window.open(`https://wa.me/?text=${encodeURIComponent(report)}`, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      if (error?.name !== "AbortError") setNotice({ type: "error", text: "Impossible d'ouvrir le partage. Vérifiez le navigateur." });
    }
  }

  function exportCsv(transactions = reportTransactions) {
    const sessionById = new Map((workspace?.report_sessions || workspace?.sessions || []).map((session) => [session.id, session]));
    const rows = [
      ["Date", "Heure", "Point", "Agent", "Type", "Opérateur", "Destination", "Montant FCFA", "Montant réglé FCFA", "Marge unités FCFA", "Règlement unités", "Bénéficiaire masqué", "Commission estimée FCFA", "Commission réelle FCFA", "Référence", "Statut"],
      ...transactions.map((transaction) => [
        sessionById.get(transaction.session_id)?.date_caisse || selectedDate,
        formatTime(transaction.created_at),
        pointById.get(transaction.point_id)?.nom || "",
        `${agentById.get(transaction.agent_id)?.prenom || ""} ${agentById.get(transaction.agent_id)?.nom || ""}`.trim(),
        OPERATION_LABELS[transaction.type_operation] || transaction.type_operation,
        operatorByCode.get(transaction.operateur_code)?.nom || transaction.operateur_code,
        operatorByCode.get(transaction.operateur_destination_code)?.nom || "",
        transaction.montant,
        settlementAmount(transaction),
        transaction.type_operation === "transfert_unites"
          ? settlementAmount(transaction) - Number(transaction.montant || 0)
          : transaction.type_operation === "approvisionnement_unites"
            ? Number(transaction.montant || 0) - settlementAmount(transaction)
            : "",
        transaction.type_operation === "approvisionnement_unites" || transaction.type_operation === "transfert_unites"
          ? (transaction.mode_paiement_unites === "wallet" ? `Float ${operatorByCode.get(transaction.operateur_paiement_code)?.nom || transaction.operateur_paiement_code || ""}` : "Espèces")
          : transaction.type_operation === "ajustement_unites" ? `Stock ${transaction.ajustement_sens === "entree" ? "entrée" : "sortie"}` : "",
        transaction.beneficiaire_masque || "",
        transaction.commission_estimee,
        transaction.commission_reelle ?? "",
        transaction.reference || "",
        transaction.annulee_le ? `Annulée — ${transaction.motif_annulation || ""}` : "Validée",
      ]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `kaisse-pro-${reportRange.startDate}-${reportRange.endDate}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function exportUnitsCsv(rows = unitJournal) {
    const sessionById = new Map((workspace?.report_sessions || workspace?.sessions || []).map((session) => [session.id, session]));
    const header = ["Date", "Heure", "Mouvement", "Opérateur", "Valeur faciale FCFA", "Montant réglé FCFA", "Marge FCFA", "Sens ajustement", "Règlement", "Bénéficiaire masqué", "Commission FCFA", "Agent", "Point", "Référence", "Statut"];
    const lines = rows.map((transaction) => {
      const session = sessionById.get(transaction.session_id);
      const isWallet = transaction.mode_paiement_unites === "wallet";
      return [
        session?.date_caisse || selectedDate,
        formatTime(transaction.created_at),
        unitOperationLabel(transaction.type_operation),
        operatorByCode.get(transaction.operateur_code)?.nom || transaction.operateur_code,
        transaction.montant,
        unitSettlement(transaction),
        transaction.type_operation === "transfert_unites"
          ? unitSettlement(transaction) - Number(transaction.montant || 0)
          : transaction.type_operation === "approvisionnement_unites" ? Number(transaction.montant || 0) - unitSettlement(transaction) : 0,
        transaction.ajustement_sens || "",
        isWallet ? `Float ${operatorByCode.get(transaction.operateur_paiement_code)?.nom || transaction.operateur_paiement_code || ""}`.trim() : transaction.type_operation === "ajustement_unites" ? "Stock seul" : "Espèces",
        transaction.beneficiaire_masque || "",
        transaction.type_operation === "approvisionnement_unites" ? 0 : (transaction.commission_reelle ?? transaction.commission_estimee ?? ""),
        `${agentById.get(transaction.agent_id)?.prenom || ""} ${agentById.get(transaction.agent_id)?.nom || ""}`.trim(),
        pointById.get(transaction.point_id)?.nom || "",
        transaction.reference || "",
        transaction.annulee_le ? `Annulée — ${transaction.motif_annulation || ""}` : "Validée",
      ];
    });
    const csv = `\uFEFF${[header, ...lines].map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `kaisse-unites-${reportRange.startDate}-${reportRange.endDate}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function exportPdf(transactions = reportTransactions) {
    const printWindow = window.open("", "_blank", "width=1000,height=760");
    if (!printWindow) {
      setNotice({ type: "error", text: "Autorisez les fenêtres contextuelles pour générer le PDF." });
      return;
    }
    const sessionById = new Map((workspace?.report_sessions || workspace?.sessions || []).map((session) => [session.id, session]));
    const valid = transactions.filter((transaction) => !transaction.annulee_le);
    const totalVolume = valid.reduce((sum, transaction) => sum + Number(transaction.montant || 0), 0);
    const totalCommissions = valid.reduce((sum, transaction) => sum + Number(transaction.commission_reelle ?? transaction.commission_estimee ?? 0), 0);
    const bodyRows = transactions.map((transaction) => {
      const session = sessionById.get(transaction.session_id);
      const agent = agentById.get(transaction.agent_id);
      const operator = operatorByCode.get(transaction.operateur_code);
      const destination = operatorByCode.get(transaction.operateur_destination_code);
      const canceled = Boolean(transaction.annulee_le);
      const commission = transaction.commission_reelle ?? transaction.commission_estimee;
      const commissionEstimated = transaction.type_operation !== "approvisionnement_unites" && transaction.commission_reelle == null;
      const settlement = transaction.type_operation === "approvisionnement_unites" || transaction.type_operation === "transfert_unites"
        ? (transaction.mode_paiement_unites === "wallet" ? `Float ${operatorByCode.get(transaction.operateur_paiement_code)?.nom || transaction.operateur_paiement_code || ""}` : "Espèces")
        : transaction.type_operation === "ajustement_unites" ? `Stock ${transaction.ajustement_sens === "entree" ? "entrée" : "sortie"}` : "—";
      const regulated = settlementAmount(transaction);
      const unitMargin = transaction.type_operation === "transfert_unites"
        ? regulated - Number(transaction.montant || 0)
        : transaction.type_operation === "approvisionnement_unites" ? Number(transaction.montant || 0) - regulated : 0;
      const commissionLabel = transaction.type_operation === "approvisionnement_unites" ? "—" : formatMoney(commission);
      return `<tr class="${canceled ? "cancelled" : ""}"><td>${escapeHtml(formatDate(session?.date_caisse || selectedDate))}</td><td>${escapeHtml(formatTime(transaction.created_at))}</td><td>${escapeHtml(OPERATION_LABELS[transaction.type_operation] || transaction.type_operation)}${destination ? ` → ${escapeHtml(destination.nom)}` : ""}</td><td>${escapeHtml(operator?.nom || transaction.operateur_code)}</td><td class="num">${escapeHtml(formatMoney(transaction.montant))}</td><td class="num">${escapeHtml(formatMoney(regulated))}</td><td class="num">${escapeHtml(formatMoney(unitMargin))}</td><td>${escapeHtml(settlement)}</td><td class="num">${escapeHtml(commissionLabel)}${commissionEstimated ? " <small>(estimée)</small>" : ""}</td><td>${escapeHtml(`${agent?.prenom || ""} ${agent?.nom || ""}`.trim() || "Agent")}</td><td>${escapeHtml(transaction.reference || "—")}</td><td>${canceled ? `Annulée — ${escapeHtml(transaction.motif_annulation || "")}` : "Validée"}</td></tr>`;
    }).join("");
    const periodLabel = reportRange.startDate === reportRange.endDate
      ? formatDate(reportRange.endDate)
      : `${formatDate(reportRange.startDate)} — ${formatDate(reportRange.endDate)}`;
    const selectedPoint = pointFilter === "tous" ? "Tous les points" : pointById.get(pointFilter)?.nom || "Point";
    const printDocument = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Rapport Kaisse — ${escapeHtml(periodLabel)}</title><style>
      *{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#182f38;margin:28px}h1{font-size:22px;margin:0 0 4px}p{color:#637379;margin:4px 0 18px}.summary{display:flex;gap:20px;padding:12px 14px;background:#f3f6f2;border-radius:8px;margin-bottom:18px}.summary strong{display:block;font-size:15px;margin-top:4px}table{border-collapse:collapse;width:100%;font-size:9px}th{text-align:left;background:#17333d;color:#fff;padding:8px 6px}td{padding:7px 6px;border-bottom:1px solid #e7eae6;vertical-align:top}.num{text-align:right;white-space:nowrap}.cancelled{color:#8d594c;background:#fff8f4}small{color:#8c7a53}footer{margin-top:18px;padding-top:9px;border-top:1px solid #ddd;color:#6e7d81;font-size:9px}@page{size:landscape;margin:12mm}@media print{body{margin:0}button{display:none}}
      </style></head><body><h1>Kaisse — rapport des opérations</h1><p>${escapeHtml(agency.nom)} · ${escapeHtml(periodLabel)} · ${escapeHtml(selectedPoint)} · filtres période/type/opérateur/agent appliqués</p><div class="summary"><div>Opérations validées<strong>${valid.length}</strong></div><div>Volume validé<strong>${escapeHtml(formatMoney(totalVolume))}</strong></div><div>Commissions déclarées/estimées<strong>${escapeHtml(formatMoney(totalCommissions))}</strong></div><div>Lignes exportées<strong>${transactions.length}</strong></div></div><table><thead><tr><th>Date</th><th>Heure</th><th>Type</th><th>Opérateur</th><th>Valeur</th><th>Réglé</th><th>Marge unités</th><th>Règlement</th><th>Commission</th><th>Agent</th><th>Référence</th><th>Statut</th></tr></thead><tbody>${bodyRows || `<tr><td colspan="12">Aucune opération pour cette sélection.</td></tr>`}</tbody></table><footer>Rapport généré par Kaisse. Les montants proviennent des saisies manuelles de l'agence et ne sont pas vérifiés par une API opérateur.</footer></body></html>`;
    printWindow.document.open();
    printWindow.document.write(printDocument);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => printWindow.print(), 250);
  }

  if (booting) return <div className="boot-screen"><div className="brand-mark"><Wallet size={20} /></div><span>Préparation de KAISSE PRO…</span></div>;

  if (screen === "landing") {
    return <LandingPage onDemo={startDemo} onLogin={() => { setAuthError(""); setAuthMessage(""); setScreen("auth"); }} />;
  }

  if (screen === "auth") {
    return (
      <AuthPage
        configured={isSupabaseConfigured}
        error={authError}
        message={authMessage}
        onSubmit={handleAuthSubmit}
        onDemo={startDemo}
        onBack={() => setScreen("landing")}
      />
    );
  }

  if (!workspace && !workspace?.demo && !loadingDay && !authUser) {
    return <LandingPage onDemo={startDemo} onLogin={() => setScreen("auth")} />;
  }

  const user = workspace?.user || { id: authUser?.id, prenom: "", nom: "", role: "agent" };
  const agency = workspace?.agency || { nom: "Chargement de l'agence…", ville: "" };
  const visiblePoints = workspace?.points || [];
  const currentSelected = selectedSession || null;
  const currentSummary = selectedSummary || null;
  const selectedPoint = currentSelected ? pointById.get(currentSelected.point_id) : null;
  const canManage = isManager(user);
  const isHistorical = selectedDate !== todayInAbidjan();
  const operatorOrder = workspace?.operators?.length ? workspace.operators : DEFAULT_OPERATORS;
  const reportsAvailable = daySessions.length > 0;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <LogoMark />
          <div><strong>Kaisse<span>Pro</span></strong><small>GESTION DE CAISSE</small></div>
        </div>
        <div className="workspace-label">ESPACE DE TRAVAIL</div>
        <div className="agency-mini"><Store size={15} /><span>{agency.nom}</span><ChevronDown size={14} /></div>
        <nav className="side-nav" aria-label="Navigation principale">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button className={`nav-button ${page === item.id ? "active" : ""}`} key={item.id} onClick={() => setPage(item.id)}>
                <Icon size={18} strokeWidth={1.8} /><span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-icon"><ShieldCheck size={17} /></div>
            <strong>Un doute sur un écart ?</strong>
            <span>Comparez d'abord le solde théorique au solde réellement compté.</span>
          </div>
          <div className="profile-card">
            <div className="avatar">{getInitials(user)}</div>
            <div className="profile-name"><strong>{user.prenom} {user.nom}</strong><span>{user.role === "proprietaire" ? "Propriétaire" : user.role === "gerant" ? "Gérant" : "Agent"}</span></div>
            <button className="icon-button small" title="Se déconnecter" onClick={signOut}><LogOut size={16} /></button>
          </div>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div className="breadcrumb"><span>{agency.ville || "Côte d'Ivoire"}</span><span className="crumb-dot">/</span><strong>{pageLabel(page)}</strong></div>
          <div className="topbar-controls">
            {workspace?.demo && <span className="demo-pill"><span /> DÉMO</span>}
            {subscription.mode === "trial" && <span className="trial-pill"><span /> Essai · {subscription.daysLeft} j</span>}
            {subscription.mode === "active" && <span className="paid-pill"><CheckCircle2 size={13} />{subscription.planCode ? `${subscription.planCode === "starter" ? "Starter" : "Pro"} · ` : ""}{subscription.daysLeft == null ? "Abonnement actif" : `${subscription.daysLeft} j restants`}</span>}
            <label className="date-control"><CalendarDays size={15} /><input aria-label="Date de consultation" type="date" value={selectedDate} max={todayInAbidjan()} onChange={(event) => setSelectedDate(event.target.value)} /></label>
            <label className="point-control"><MapPin size={15} /><select value={pointFilter} onChange={(event) => setPointFilter(event.target.value)}><option value="tous">Tous les points</option>{visiblePoints.map((point) => <option value={point.id} key={point.id}>{point.nom}</option>)}</select></label>
            <button className={`icon-button alert-bell ${alertList.length ? "has-alerts" : ""}`} title="Centre d'alertes" onClick={() => setAlertDrawer((open) => !open)}>
              <Bell size={17} />
              {alertList.length > 0 && <span className="alert-bell-count">{alertList.length}</span>}
            </button>
            <button className="icon-button top-logout" title="Se déconnecter" onClick={signOut}><LogOut size={17} /></button>
          </div>
        </header>

        {alertDrawer && <div className="alert-drawer">
          <div className="alert-drawer-head">
            <div><strong>Centre d'alertes</strong><span>{alertList.length} point(s) d'attention</span></div>
            <button className="icon-button small" onClick={() => setAlertDrawer(false)} aria-label="Fermer les alertes"><X size={16} /></button>
          </div>
          <AlertsCenter alerts={alertList.slice(0, 8)} onGo={(target) => { setAlertDrawer(false); setPage(target); }} compact />
          <button className="text-button drawer-link" onClick={() => { setAlertDrawer(false); setPage("pilotage"); }}>Tout voir dans Pilotage <ArrowRight size={14} /></button>
        </div>}

        {notice && <div className={`notice ${notice.type}`} role="status"><span>{notice.text}</span><button className="notice-close" onClick={() => setNotice(null)} aria-label="Fermer"><X size={15} /></button></div>}
        {!online && <div className="offline-banner"><AlertTriangle size={14} /><span>Hors ligne : l'application reste consultable et la démo fonctionne. Les enregistrements Supabase reprendront au retour du réseau.</span></div>}
        {workspace?.demo && <div className="demo-banner"><AlertTriangle size={16} /><span>{DEMO_WARNING}</span><button onClick={resetDemo}>Réinitialiser</button></div>}
        {workspace && subscription.mode === "trial" && <div className="trial-banner"><Clock3 size={16} /><div><strong>Essai gratuit · {subscription.daysLeft} jour{subscription.daysLeft > 1 ? "s" : ""} restant{subscription.daysLeft > 1 ? "s" : ""}</strong><span>Accès complet pendant 14 jours à compter de la création de l'agence. Aucun prélèvement automatique n'est effectué par cette V1.</span></div></div>}
        {workspace && subscription.mode === "expired" && <div className="trial-banner expired"><LockKeyhole size={16} /><div><strong>{subscription.reason === "subscription" ? "Votre période payée est terminée" : "Votre période d'essai est terminée"}</strong><span>Vos données, rapports et exports sont conservés en lecture seule. La clôture d'une session déjà ouverte reste possible; contactez Kaisse pour réactiver votre agence.</span></div></div>}
        {workspace && subscription.mode === "suspended" && <div className="trial-banner expired"><LockKeyhole size={16} /><div><strong>Accès en lecture seule</strong><span>Vos données sont conservées. Contactez Kaisse pour réactiver votre abonnement.</span></div></div>}
        {loadingDay && <div className="loading-line"><span /> Chargement des données de l'agence et du rapport…</div>}
        {authUser && !workspace && <div className="loading-workspace"><div className="spinner" /><strong>Chargement de votre agence</strong><span>Nous récupérons vos points, sessions et opérations.</span></div>}

        {workspace && page === "apercu" && (
          <OverviewPage
            agency={agency}
            user={user}
            selectedDate={selectedDate}
            pointFilter={pointFilter}
            selectedSession={currentSelected}
            selectedSummary={currentSummary}
            sessionSummaries={selectableSessions}
            selectedSessionId={selectedSessionId}
            onSessionChange={setSelectedSessionId}
            transactions={dayTransactions}
            sessionDateById={reportSessionDateById}
            expenses={dayExpenses}
            volume={volumeTotal}
            commissions={commissionDeclaredTotal}
            commissionEstimate={commissionEstimatedTotal}
            commissionNeedsReview={commissionNeedsReview}
            resultEstimate={resultEstimate}
            closedWithDifference={closedWithDifference}
            operatorOrder={operatorOrder}
            operatorByCode={operatorByCode}
            pointById={pointById}
            agentById={agentById}
            canManage={canManage}
            canWrite={subscription.canWrite}
            onGo={setPage}
            onOpenModal={setModal}
            onCancel={voidTransaction}
            onShare={shareDailyReport}
            onOpenOwnSession={() => setModal("open-session")}
            unitAlerts={unitStockOverview.alerts}
            alerts={alertList}
            unitMargin={unitStockOverview.totalMargin}
            cashMovements={(workspace.cash_movements || []).filter((movement) => sessionIds.has(movement.session_id))}
            onShareRecap={shareRecap}
            onOpenReceipt={openReceiptFor}
            onOpenAlertCenter={() => setAlertDrawer(true)}
          />
        )}

        {workspace && page === "operations" && (
          <OperationsPage
            date={selectedDate}
            reportRange={reportRange}
            period={reportPeriod}
            onPeriodChange={setReportPeriod}
            transactions={reportTransactions}
            sessionDateById={reportSessionDateById}
            operators={operatorByCode}
            points={pointById}
            agents={agentById}
            sessionCount={reportSessions.length}
            canManage={canManage}
            canWrite={subscription.canWrite}
            onOpenModal={setModal}
            onExport={exportCsv}
            onExportPdf={exportPdf}
            onCancel={voidTransaction}
            onReceipt={openReceiptFor}
            onCashMovement={() => setModal("cash")}
            onCreateReceipt={() => setModal("receipt")}
          />
        )}

        {workspace && page === "unites" && (
          <UnitsPage
            date={selectedDate}
            reportRange={reportRange}
            period={reportPeriod}
            onPeriodChange={setReportPeriod}
            stock={unitStockOverview}
            journal={unitJournal}
            summary={unitPeriodSummary}
            operators={operatorOrder}
            points={visiblePoints}
            pointById={pointById}
            agents={agentById}
            canManage={canManage}
            canWrite={subscription.canWrite}
            onOpenModal={setModal}
            onOpenUnit={openUnitModal}
            onCancel={voidTransaction}
            onExport={() => exportUnitsCsv(unitJournal)}
            onGo={setPage}
            forecasts={unitForecasts}
            tariffs={workspace.unit_tariffs || []}
            onOpenReceipt={openReceiptFor}
            onOpenTariff={() => setModal("tarif")}
          />
        )}

        {workspace && page === "caisse" && (
          <CashPage
            date={selectedDate}
            isHistorical={isHistorical}
            user={user}
            points={visiblePoints}
            operators={operatorOrder}
            selectedSession={currentSelected}
            selectedSummary={currentSummary}
            summaries={selectableSessions}
            selectedSessionId={selectedSessionId}
            onSessionChange={setSelectedSessionId}
            units={workspace.session_units || []}
            expenses={dayExpenses}
            agents={agentById}
            canWrite={subscription.canWrite}
            onOpenModal={setModal}
            onOpenOwnSession={() => setModal("open-session")}
            cashMovements={(workspace.cash_movements || []).filter((movement) => movement.session_id === selectedSession?.id)}
          />
        )}

        {workspace && page === "pilotage" && (
          <PilotagePage
            date={selectedDate}
            reportRange={reportRange}
            period={reportPeriod}
            onPeriodChange={setReportPeriod}
            consolidation={consolidation}
            unitForecasts={unitForecasts}
            floatForecasts={floatForecasts}
            performances={performances}
            reconciliation={reconciliation}
            alerts={alertList}
            operators={operatorOrder}
            canManage={canManage}
            canWrite={subscription.canWrite}
            onGo={setPage}
            onOpenModal={setModal}
            onShareRecap={shareRecap}
          />
        )}

        {workspace && page === "clients" && (
          <ClientsPage
            credit={creditSummary}
            creditMovements={workspace.credit_movements || []}
            points={visiblePoints}
            pointById={pointById}
            encaissements={workspace.encaissements || []}
            messages={workspace.messages || []}
            auditLog={workspace.audit_log || []}
            agents={agentById}
            canWrite={subscription.canWrite}
            onOpenModal={(name, data) => { setModalData(data || null); setModal(name); }}
            onGo={setPage}
            onShareReminder={shareCreditReminder}
            today={selectedDate}
          />
        )}

        {workspace && page === "equipe" && (
          <TeamPage
            agency={agency}
            user={user}
            profiles={workspace.profiles || []}
            points={visiblePoints}
            sessions={daySessions}
            summaries={sessionSummaries}
            performances={performances}
            canManage={canManage}
            canWrite={subscription.canWrite}
            onOpenModal={setModal}
            onCopyCode={async () => {
              try {
                await navigator.clipboard.writeText(agency.code_invitation || "");
                setNotice({ type: "success", text: "Code d'invitation copié." });
              } catch {
                setNotice({ type: "error", text: "Copie impossible. Sélectionnez le code et copiez-le manuellement." });
              }
            }}
          />
        )}

        {workspace && page === "reglages" && (
          <SettingsPage
            agency={agency}
            user={user}
            subscription={subscription}
            operators={operatorOrder}
            rules={workspace.commission_baremes || []}
            onOpenModal={setModal}
            onResetDemo={workspace.demo ? resetDemo : null}
            canManage={canManage}
            canWrite={subscription.canWrite}
            tariffs={workspace.unit_tariffs || []}
            auditLog={workspace.audit_log || []}
            agents={agentById}
            points={visiblePoints}
            statements={workspace.commission_statements || []}
            onShareRecap={shareRecap}
            onOpenUnit={openUnitModal}
            messages={workspace.messages || []}
            onSaveThreshold={(pointId, values) => saveThresholds(pointId, values).catch((error) => setNotice({ type: "error", text: makeErrorMessage(error) }))}
          />
        )}
      </div>

      <nav className="mobile-nav" aria-label="Navigation mobile">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return <button key={item.id} className={page === item.id ? "active" : ""} onClick={() => setPage(item.id)}><Icon size={17} /><span>{item.short || item.label.split(" ")[0]}</span></button>;
        })}
      </nav>

      {modal === "transaction" && <TransactionModal
        sessions={ownOpenSessions}
        summaries={sessionSummaries}
        points={visiblePoints}
        operators={operatorOrder}
        rules={workspace.commission_baremes || []}
        onClose={() => setModal("")}
        onSave={saveTransaction}
      />}
      {modal === "unit-appro" && <UnitMovementModal
        variant="appro"
        initialOperator={unitTargetOperator}
        sessions={ownOpenSessions}
        summaries={sessionSummaries}
        points={visiblePoints}
        operators={operatorOrder}
        rules={workspace.commission_baremes || []}
        stock={unitStockOverview}
        tariffs={workspace.unit_tariffs || []}
        onClose={() => setModal("")}
        onSave={saveTransaction}
      />}
      {modal === "unit-vente" && <UnitMovementModal
        variant="vente"
        initialOperator={unitTargetOperator}
        sessions={ownOpenSessions}
        summaries={sessionSummaries}
        points={visiblePoints}
        operators={operatorOrder}
        rules={workspace.commission_baremes || []}
        stock={unitStockOverview}
        tariffs={workspace.unit_tariffs || []}
        onClose={() => setModal("")}
        onSave={saveTransaction}
      />}
      {modal === "cash" && <CashMovementModal
        sessions={ownOpenSessions}
        points={visiblePoints}
        onClose={() => setModal("")}
        onSave={saveCashMovement}
      />}
      {modal === "credit" && <CreditModal
        variant="credit"
        points={visiblePoints}
        onClose={() => setModal("")}
        onSave={saveCreditMovement}
      />}
      {modal === "credit-remboursement" && modalData && <CreditModal
        variant="remboursement"
        row={modalData}
        points={visiblePoints}
        onClose={() => setModal("")}
        onSave={saveCreditMovement}
      />}
      {modal === "statement" && <StatementModal
        operators={operatorOrder}
        onClose={() => setModal("")}
        onSave={saveStatement}
      />}
      {modal === "tarif" && <TariffModal
        operators={operatorOrder}
        onClose={() => setModal("")}
        onSave={saveTariff}
      />}
      {modal === "encaissement" && <EncaissementModal
        points={visiblePoints}
        operators={operatorOrder}
        onClose={() => setModal("")}
        onSave={saveEncaissement}
      />}
      {modal === "receipt" && modalData && <ReceiptModal
        receipt={modalData}
        onClose={() => setModal("")}
        onSend={(content) => sendExternal(content)}
      />}
      {modal === "unit-ajustement" && <UnitMovementModal
        variant="ajustement"
        initialOperator={unitTargetOperator}
        sessions={ownOpenSessions}
        summaries={sessionSummaries}
        points={visiblePoints}
        operators={operatorOrder}
        rules={workspace.commission_baremes || []}
        stock={unitStockOverview}
        tariffs={workspace.unit_tariffs || []}
        onClose={() => setModal("")}
        onSave={saveTransaction}
      />}
      {modal === "expense" && <ExpenseModal
        sessions={ownOpenSessions}
        points={visiblePoints}
        operators={operatorOrder}
        onClose={() => setModal("")}
        onSave={saveExpense}
      />}
      {modal === "open-session" && <OpenSessionModal
        points={visiblePoints}
        operators={operatorOrder}
        selectedDate={selectedDate}
        isHistorical={isHistorical}
        lastCounts={lastCountByPoint}
        onClose={() => setModal("")}
        onSave={saveOpenSession}
      />}
      {modal === "close-session" && currentSelected && currentSummary && <CloseSessionModal
        session={currentSelected}
        point={selectedPoint}
        summary={currentSummary}
        operators={operatorOrder}
        floats={workspace.session_floats || []}
        units={workspace.session_units || []}
        onClose={() => setModal("")}
        onSave={saveCloseSession}
      />}
      {modal === "point" && <PointModal agency={agency} onClose={() => setModal("")} onSave={savePoint} />}
      {modal === "commission" && <CommissionModal operators={operatorOrder} onClose={() => setModal("")} onSave={saveRule} />}
    </div>
  );
}

function pageLabel(id) {
  return NAV_ITEMS.find((item) => item.id === id)?.label || "Vue d'ensemble";
}

function LandingPage({ onDemo, onLogin }) {
  const demoRows = [
    { name: "Orange Money", amount: "450 000 F", color: "#ff7900" },
    { name: "MTN MoMo", amount: "395 000 F", color: "#ffcc08" },
    { name: "Moov Money", amount: "130 000 F", color: "#0072ce" },
    { name: "Wave", amount: "225 000 F", color: "#1dc8e0" },
  ];
  return (
    <main className="landing-page">
      <nav className="landing-nav">
        <div className="brand-lockup"><LogoMark /><div><strong>Kaisse<span>Pro</span></strong><small>LE CONTRÔLE DE VOTRE CAISSE</small></div></div>
        <div className="landing-nav-actions"><button className="button button-quiet" onClick={onLogin}>Connexion</button><button className="button button-dark" onClick={onDemo}>Essayer la démo <ArrowRight size={16} /></button></div>
      </nav>

      <section className="landing-hero">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-dot" /> CONÇU POUR LES POINTS MOBILE MONEY</div>
          <h1>À la fermeture,<br />sachez <em>où est votre argent.</em></h1>
          <p>Kaisse Pro suit les dépôts, retraits et transferts d'unités de votre point : commissions déclarées, float électronique, espèces et stock d'unités par opérateur — puis compare le théorique au montant réellement compté.</p>
          <div className="hero-actions"><button className="button button-dark button-large" onClick={onDemo}>Explorer la démo gratuite <ArrowRight size={17} /></button><button className="button button-outline button-large" onClick={onLogin}>Créer mon espace</button></div>
          <div className="hero-proof"><span><Check size={15} /> Orange · MTN · Moov · Wave</span><span><Check size={15} /> Mobile d'abord, installable</span><span><Check size={15} /> Consultable hors ligne</span><span><Check size={15} /> Pas besoin d'API opérateur</span></div>
        </div>
        <div className="preview-card-wrap">
          <div className="preview-card">
            <div className="preview-top"><div><span className="preview-kicker">APERÇU DE DÉMONSTRATION</span><h2>Centre-ville · Daloa</h2></div><span className="status-chip status-open"><span /> Session ouverte</span></div>
            <div className="preview-main-stat"><span>Float électronique théorique</span><strong>1 200 000 <small>F</small></strong><div><Smartphone size={14} /> Quatre opérateurs · soldes de la session</div></div>
            <div className="preview-operators">{demoRows.map((row) => <div className="preview-operator" key={row.name}><span className="operator-dot" style={{ "--operator-color": row.color }} /><span>{row.name}</span><strong>{row.amount}</strong></div>)}</div>
            <div className="preview-alert"><AlertTriangle size={16} /><span>Écart déclaré sur une clôture précédente</span><strong>-5 000 F</strong></div>
            <div className="preview-note">Exemple fictif · les barèmes et soldes de démo ne sont pas des données opérateur.</div>
          </div>
          <div className="floating-note"><CircleDollarSign size={18} /><div><strong>Théorique ≠ déclaré</strong><span>Un écart devient visible à la clôture.</span></div></div>
        </div>
      </section>

      <section className="landing-value">
        <div className="section-heading"><span>LE MVP, SANS LE SUPERFLU</span><h2>Le cahier devient un journal vérifiable.</h2><p>Un seul flux pour l'ouverture, les opérations, les dépenses et la clôture. Les soldes restent saisis par l'équipe et comparés à un théorique explicite.</p></div>
        <div className="value-grid">
          <FeatureCard icon={ArrowLeftRight} number="01" title="Enregistrer l'opération" text="Dépôts, retraits, transferts de float et mouvements d'unités, chaque ligne attribuée à une session et à un agent." />
          <FeatureCard icon={HandCoins} number="02" title="Voir les commissions" text="Barèmes configurables par agence ou saisie manuelle. Estimé et montant réel restent séparés." />
          <FeatureCard icon={ShieldCheck} number="03" title="Rapprocher la caisse" text="Déclarez les espèces, chaque solde électronique et le stock d'unités à l'ouverture comme à la fermeture." />
          <FeatureCard icon={Users} number="04" title="Suivre les agents" text="Chaque session et chaque opération sont associées à un profil et à un point." />
          <FeatureCard icon={FileText} number="05" title="Partager le rapport" text="Export CSV ou PDF imprimable avec filtres de période, type, opérateur et gérant." />
          <FeatureCard icon={AlertTriangle} number="06" title="Repérer un écart" text="Le montant déclaré moins le théorique est affiché avec un signe clair et un motif à vérifier." />
          <FeatureCard icon={Activity} number="07" title="Prévoir la rupture" text="Moyenne des sorties, couverture en jours et quantité à commander par opérateur, unités et float." />
          <FeatureCard icon={Landmark} number="08" title="Suivre les espèces" text="Dépôts en banque, coffre et renforts de caisse entrent dans le théorique : plus d'argent « disparu »." />
          <FeatureCard icon={HandCoins} number="09" title="Carnet de crédit client" text="Crédits d'unités ou de float, remboursements, échéances en retard et rappel WhatsApp préparé." />
          <FeatureCard icon={Building2} number="10" title="Consolider les points" text="Résultat, commissions, marge et alertes de chaque point sur une seule vue propriétaire." />
          <FeatureCard icon={PiggyBank} number="11" title="Mesurer la marge unités" text="Prix d'achat, prix de vente et valeur faciale séparés : la marge réelle du transfert d'unités." />
          <FeatureCard icon={ShieldCheck} number="12" title="Rapprocher les commissions" text="Comparez le relevé opérateur, les commissions constatées et l'attendu de vos barèmes." />
        </div>
      </section>

      <section className="landing-units">
        <div className="units-spotlight">
          <div className="units-spotlight-copy">
            <span className="eyebrow">MODULE UNITÉS & TRANSFERTS</span>
            <h2>Le stock d'unités, suivi comme le float.</h2>
            <p>Un point qui vend des transferts d'unités gère deux trésoreries : l'argent électronique et le crédit téléphonique. Kaisse les sépare, pour que le comptage de fin de journée ne mélange plus les deux.</p>
            <ul className="units-spotlight-list">
              <li><Check size={15} /><span><strong>Stock par opérateur</strong> — ouverture, approvisionnements, transferts clients, valeur faciale FCFA.</span></li>
              <li><Check size={15} /><span><strong>Règlement explicite</strong> — chaque achat ou vente indique s'il touche les espèces ou le float.</span></li>
              <li><Check size={15} /><span><strong>Seuil d'alerte</strong> — stock bas et rupture signalés avant de refuser un client.</span></li>
              <li><Check size={15} /><span><strong>Écart de comptage</strong> — comparé au stock réellement compté à la clôture.</span></li>
            </ul>
            <button className="button button-dark" onClick={onDemo}>Tester le module en démo <ArrowRight size={16} /></button>
          </div>
          <div className="units-spotlight-card">
            <div className="spotlight-card-head"><span>Stock d'unités · Centre-ville</span><span className="spotlight-pill">Démo</span></div>
            {[
              { name: "Orange Money", stock: "68 000 F", badge: "Disponible", tone: "ok", color: "#ff7900" },
              { name: "MTN MoMo", stock: "50 000 F", badge: "Disponible", tone: "ok", color: "#ffcc08" },
              { name: "Moov Money", stock: "20 000 F", badge: "Stock bas", tone: "bas", color: "#0072ce" },
              { name: "Wave", stock: "9 000 F", badge: "Stock bas", tone: "bas", color: "#1dc8e0" },
            ].map((row) => <div className="spotlight-row" key={row.name}>
              <span className="operator-dot" style={{ "--operator-color": row.color }} />
              <span className="spotlight-name">{row.name}</span>
              <strong>{row.stock}</strong>
              <span className={`unit-level-badge ${row.tone}`}>{row.badge}</span>
            </div>)}
            <div className="spotlight-foot"><span>Approvisionnements du jour</span><strong>+50 000 F</strong><span>Transferts clients</span><strong>−18 000 F</strong></div>
          </div>
        </div>
      </section>

      <section className="landing-pricing">
        <div className="section-heading"><span>OFFRES KAISSE</span><h2>Un tarif clair, sans prélèvement automatique.</h2><p>Choisissez une formule après les 14 jours d'essai gratuit de votre nouvelle agence.</p></div>
        <div className="pricing-grid">
          <article className="pricing-card"><div className="pricing-tag">JUSQU'À 3 AGENTS</div><h3>Starter</h3><p>Pour une petite équipe qui veut fiabiliser sa clôture.</p><div className="pricing-price">10 000 <span>FCFA / 30 jours</span></div><ul><li><Check size={14} />Journal et rapprochement</li><li><Check size={14} />Exports CSV et PDF filtrés</li><li><Check size={14} />Jusqu'à 3 agents</li></ul></article>
          <article className="pricing-card featured"><div className="pricing-tag">ÉQUIPE ÉTENDUE</div><h3>Pro</h3><p>Pour les agences avec plusieurs agents et un suivi renforcé.</p><div className="pricing-price">25 000 <span>FCFA / 30 jours</span></div><ul><li><Check size={14} />Tous les modules Kaisse</li><li><Check size={14} />Exports CSV et PDF filtrés</li><li><Check size={14} />Agents illimités</li></ul></article>
        </div>
        <p className="pricing-note">Essai de 14 jours, puis règlement SasPay par période de 30 jours, sans renouvellement automatique. Le paiement et l'activation restent manuels dans cette version; aucun encaissement n'est déclenché depuis l'application.</p>
      </section>
      <section className="landing-cta"><div><span className="eyebrow">DÉMO INTERACTIVE</span><h2>Testez l'application, puis essayez-la 14 jours.</h2><p>La démo ne demande aucun compte. Le nouvel espace d'agence dispose de 14 jours d'essai; les données restent conservées ensuite en lecture seule si l'accès n'est pas réactivé.</p></div><button className="button button-paper button-large" onClick={onDemo}>Ouvrir la démo <ArrowRight size={17} /></button></section>
      <footer className="landing-footer"><span>© 2026 Kaisse Pro · Côte d'Ivoire</span><span>Outil de suivi manuel — ne remplace pas les relevés opérateurs.</span></footer>
    </main>
  );
}

function FeatureCard({ icon: Icon, number, title, text }) {
  return <article className="feature-card"><div className="feature-card-top"><span>{number}</span><Icon size={20} /></div><h3>{title}</h3><p>{text}</p></article>;
}

function AuthPage({ configured, error, message, onSubmit, onDemo, onBack }) {
  const [mode, setMode] = useState("connexion");
  const [kind, setKind] = useState("creation_agence");
  const [form, setForm] = useState({ nom: "", prenom: "", telephone: "", email: "", password: "", nom_agence: "", ville: "Daloa", premier_point: "Point principal", code_invitation: "" });
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState("");
  const setValue = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setLocalError("");
    if (!form.email.trim() || !form.password) return setLocalError("Renseignez l'email et le mot de passe.");
    if (mode === "inscription") {
      if (!form.nom.trim() || !form.prenom.trim()) return setLocalError("Renseignez votre nom et votre prénom.");
      if (kind === "creation_agence" && !form.nom_agence.trim()) return setLocalError("Renseignez le nom de l'agence.");
      if (kind === "rejoindre_equipe" && !form.code_invitation.trim()) return setLocalError("Renseignez le code transmis par le propriétaire.");
      if (form.password.length < 6) return setLocalError("Le mot de passe doit contenir au moins 6 caractères.");
    }
    if (!configured) return setLocalError("Configurez Supabase avec les variables d'environnement pour créer un vrai compte. La démo reste disponible.");
    setLoading(true);
    try {
      await onSubmit({ mode, kind, form });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel auth-visual">
        <button className="back-link light-back" onClick={onBack}>← Retour à l'accueil</button>
        <div className="auth-visual-content"><LogoMark light /><span className="auth-overline">UN MEILLEUR CONTRÔLE, CHAQUE JOUR</span><h1>Les chiffres de votre point, enfin réunis.</h1><p>Transactions, commissions, caisse physique, float électronique et stock d'unités distinct par opérateur.</p><div className="auth-benefits"><span><CheckCircle2 size={16} /> Une saisie attribuée à chaque agent</span><span><CheckCircle2 size={16} /> Un rapprochement lisible à la clôture</span><span><CheckCircle2 size={16} /> Vos taux restent configurables</span></div></div>
        <div className="auth-footnote">Le solde théorique dépend des opérations saisies. Il ne s'agit pas d'une confirmation par Orange, MTN, Moov ou Wave.</div>
      </section>
      <section className="auth-panel auth-form-panel">
        <div className="auth-mobile-brand"><LogoMark /><strong>Kaisse<span>Pro</span></strong></div>
        <div className="auth-form-wrap">
          <div className="auth-tabs"><button className={mode === "connexion" ? "active" : ""} onClick={() => { setMode("connexion"); setLocalError(""); }}>Connexion</button><button className={mode === "inscription" ? "active" : ""} onClick={() => { setMode("inscription"); setLocalError(""); }}>Créer un compte</button></div>
          <h2>{mode === "connexion" ? "Bon retour." : "Commençons."}</h2>
          <p className="form-subtitle">{mode === "connexion" ? "Connectez-vous à l'espace de votre agence." : "Créez un espace ou rejoignez une équipe existante."}</p>
          {mode === "inscription" && kind === "creation_agence" && <div className="trial-info"><Clock3 size={14} />14 jours d'essai pour une nouvelle agence. Les agences déjà inscrites ne sont pas modifiées; après l'essai, vos données restent consultables.</div>}

          {mode === "inscription" && <div className="join-choice"><button className={kind === "creation_agence" ? "active" : ""} onClick={() => setKind("creation_agence")}><Store size={15} /> Créer une agence</button><button className={kind === "rejoindre_equipe" ? "active" : ""} onClick={() => setKind("rejoindre_equipe")}><Users size={15} /> Rejoindre</button></div>}
          {mode === "inscription" && kind === "rejoindre_equipe" && <div className="trial-info"><Users size={14} />Vous rejoindrez cette agence avec le rôle de gérant, avec votre propre compte.</div>}
          <form onSubmit={submit} className="auth-form">
            {mode === "inscription" && <div className="form-row"><FormField label="Prénom"><input autoComplete="given-name" value={form.prenom} onChange={setValue("prenom")} /></FormField><FormField label="Nom"><input autoComplete="family-name" value={form.nom} onChange={setValue("nom")} /></FormField></div>}
            {mode === "inscription" && <FormField label="Téléphone (facultatif)"><input autoComplete="tel" type="tel" placeholder="07 00 00 00 00" value={form.telephone} onChange={setValue("telephone")} /></FormField>}
            {mode === "inscription" && kind === "creation_agence" && <><FormField label="Nom de l'agence"><input value={form.nom_agence} onChange={setValue("nom_agence")} placeholder="Ex. Agence Centre Daloa" /></FormField><div className="form-row"><FormField label="Ville"><input value={form.ville} onChange={setValue("ville")} /></FormField><FormField label="Premier point"><input value={form.premier_point} onChange={setValue("premier_point")} /></FormField></div></>}
            {mode === "inscription" && kind === "rejoindre_equipe" && <FormField label="Code d'invitation" hint="Utilisez le code exact transmis par le propriétaire; les nouveaux codes font 8 caractères et évitent 0/O/1/I/L."><input autoCapitalize="characters" autoComplete="off" value={form.code_invitation} onChange={setValue("code_invitation")} placeholder="Ex. KSSPAB26" /></FormField>}
            <FormField label="Adresse email"><input autoComplete="email" type="email" value={form.email} onChange={setValue("email")} placeholder="vous@exemple.ci" /></FormField>
            <FormField label="Mot de passe"><input autoComplete={mode === "connexion" ? "current-password" : "new-password"} type="password" value={form.password} onChange={setValue("password")} placeholder={mode === "inscription" ? "6 caractères minimum" : "Votre mot de passe"} /></FormField>
            {(localError || error) && <div className="form-alert error"><AlertTriangle size={15} />{localError || error}</div>}
            {message && <div className="form-alert success"><CheckCircle2 size={15} />{message}</div>}
            {!configured && <div className="config-hint"><LockKeyhole size={15} />Mode connecté indisponible tant que Supabase n'est pas configuré.</div>}
            <button className="button button-dark button-full" disabled={loading || !configured}>{loading ? "Un instant…" : mode === "connexion" ? "Se connecter" : "Continuer"}<ArrowRight size={16} /></button>
          </form>
          <div className="auth-separator"><span /> ou <span /></div>
          <button className="button button-outline button-full" onClick={onDemo}>Essayer la démo sans compte</button>
          <p className="auth-terms">En continuant, vous acceptez que les montants saisis soient traités dans l'espace de votre agence.</p>
        </div>
      </section>
    </main>
  );
}

function OverviewPage({
  agency, user, selectedDate, pointFilter, selectedSession, selectedSummary, sessionSummaries,
  selectedSessionId, onSessionChange, transactions, sessionDateById, expenses, volume, commissions,
  commissionEstimate, commissionNeedsReview, resultEstimate, closedWithDifference,
  operatorOrder, operatorByCode, pointById, agentById, canManage, canWrite, onGo, onOpenModal,
  onShare, onOpenOwnSession, onCancel, unitAlerts = [], alerts = [], unitMargin = 0,
  cashMovements = [], onShareRecap, onOpenReceipt, onOpenAlertCenter,
}) {
  const isToday = selectedDate === todayInAbidjan();
  const operatorVolumes = operatorOrder.map((operator) => ({
    ...operator,
    volume: transactions.filter((transaction) => !transaction.annulee_le && transaction.operateur_code === operator.code)
      .reduce((sum, transaction) => sum + Number(transaction.montant || 0), 0),
  }));
  const maxOperatorVolume = Math.max(1, ...operatorVolumes.map((operator) => operator.volume));
  const dashboardTransactions = transactions;
  const ownOpen = sessionSummaries.find(({ session }) => session.agent_id === user.id && session.statut === "ouverte")?.session;
  const selectedPoint = selectedSession ? pointById.get(selectedSession.point_id) : null;
  const floatBelowThreshold = selectedPoint && selectedSummary
    && selectedSummary.floatExpected < Number(selectedPoint.seuil_alerte_float || 0);
  const sessionFullyReconciled = selectedSummary
    && Number(selectedSummary.cashVariance || 0) === 0
    && !selectedSummary.floatHasDifference
    && selectedSummary.unitTracked
    && !selectedSummary.unitHasDifference;

  return (
    <main className="content-area">
      <PageHeading
        eyebrow={`${agency.ville || "Côte d'Ivoire"} · ${formatDate(selectedDate)}`}
        title={`Bonjour ${user.prenom || ""}`.trim()}
        description="Le point du jour, les mouvements et les écarts à vérifier."
        actions={<>
          <button className="button button-outline" onClick={onShare}><Share2 size={16} />Rapport PDF</button>
          <button className="button button-outline" onClick={onShareRecap}><Send size={16} />Récap du soir</button>
          {canWrite && <button className="button button-dark" onClick={() => onOpenModal("transaction")}><Plus size={16} />Nouvelle opération</button>}
        </>}
      />

      <div className="session-strip">
        <div className="session-strip-icon"><Clock3 size={18} /></div>
        <div className="session-strip-copy"><strong>{selectedSession ? `${pointById.get(selectedSession.point_id)?.nom || "Point"} · ${agentById.get(selectedSession.agent_id)?.prenom || user.prenom || "Agent"}` : "Aucune caisse sélectionnée"}</strong><span>{selectedSession?.statut === "ouverte" ? "Session en cours — les soldes sont théoriques jusqu'à la clôture." : selectedSession?.statut === "cloturee" ? "Session clôturée — comparez le montant déclaré aux soldes théoriques." : isToday ? "Démarrez une session pour enregistrer les mouvements de caisse." : "Aucune session enregistrée pour cette date."}</span></div>
        {sessionSummaries.length > 0 && <label className="session-select"><span>Session affichée</span><select value={selectedSessionId} onChange={(event) => onSessionChange(event.target.value)}>{sessionSummaries.map(({ session }) => <option value={session.id} key={session.id}>{pointById.get(session.point_id)?.nom || "Point"} · {agentById.get(session.agent_id)?.prenom || "Agent"} · {session.statut === "ouverte" ? "ouverte" : "clôturée"}</option>)}</select></label>}
        {!ownOpen && isToday && canWrite && <button className="button button-gold" onClick={onOpenOwnSession}><Plus size={15} />Ouvrir ma caisse</button>}
      </div>

      {closedWithDifference.length > 0 && <div className="alert-card"><div className="alert-mark"><AlertTriangle size={18} /></div><div><strong>{closedWithDifference.length} clôture{closedWithDifference.length > 1 ? "s" : ""} à vérifier</strong><span>Un écart négatif correspond à un montant déclaré inférieur au théorique. Vérifiez les opérations et les comptages espèces, float et unités; certaines anciennes sessions peuvent ne pas avoir de stock initial suivi.</span></div><button className="text-button" onClick={() => onGo("caisse")}>Voir la caisse <ArrowRight size={15} /></button></div>}
      {floatBelowThreshold && <div className="alert-card low-float-alert"><div className="alert-mark"><Smartphone size={18} /></div><div><strong>Float sous le seuil configuré pour {selectedPoint.nom}</strong><span>Solde théorique : {formatMoney(selectedSummary.floatExpected)} · seuil saisi par votre agence : {formatMoney(selectedPoint.seuil_alerte_float)}. Vérifiez les soldes directement auprès des opérateurs.</span></div></div>}
      {unitAlerts.length > 0 && <div className="alert-card low-unit-alert"><div className="alert-mark"><Package size={18} /></div><div><strong>{unitAlerts.length} opérateur{unitAlerts.length > 1 ? "s" : ""} sous le seuil d'unités</strong><span>{unitAlerts.map((alert) => `${alert.nom} : ${formatMoney(alert.theorique)}`).join(" · ")} — seuil saisi {formatMoney(unitAlerts[0].seuil)}. Réapprovisionnez le stock avant la rupture.</span></div><button className="text-button" onClick={() => onGo("unites")}>Gérer les unités <ArrowRight size={15} /></button></div>}

      <section className="panel overview-alerts">
        <div className="panel-heading">
          <div><h2>Centre d'alertes</h2><p>{alerts.length ? `${alerts.length} point(s) d'attention — stock, float, sessions, crédit, abonnement` : "Aucun point d'attention : tout est dans les repères"}</p></div>
          <button className="text-button" onClick={onOpenAlertCenter}><Bell size={15} />Tout voir <ArrowRight size={14} /></button>
        </div>
        <AlertsCenter alerts={alerts.slice(0, 3)} onGo={onGo} compact />
      </section>

      <div className="kpi-grid">
        <KpiCard label="Volume d'opérations" value={formatMoney(volume)} hint={`${transactions.filter((item) => !item.annulee_le).length} opérations · float, crédit et mouvements d'unités`} icon={Activity} tone="blue" />
        <KpiCard label="Commissions déclarées" value={formatMoney(commissions)} hint={commissionNeedsReview ? `${commissionNeedsReview} opération${commissionNeedsReview > 1 ? "s" : ""} sans montant réel saisi` : `Estimées : ${formatMoney(commissionEstimate)}`} icon={HandCoins} tone="gold" />
        <KpiCard label="Float électronique théorique" value={selectedSummary ? formatMoney(selectedSummary.floatExpected) : "—"} hint={selectedSession?.statut === "cloturee" ? `Déclaré : ${formatMoney(selectedSummary?.floatDeclared)}` : "Solde d'ouverture + opérations - dépenses wallet"} icon={Smartphone} tone="teal" />
        <KpiCard label="Espèces théoriques" value={selectedSummary ? formatMoney(selectedSummary.cashExpected) : "—"} hint={selectedSummary?.cashVariance == null ? "Le montant réel sera confirmé à la clôture" : `Écart déclaré : ${formatMoney(selectedSummary.cashVariance)}`} icon={Banknote} tone={selectedSummary?.cashVariance && selectedSummary.cashVariance !== 0 ? "red" : "ink"} />
        <KpiCard label="Marge sur les unités" value={formatMoney(unitMargin)} hint="Différence entre prix de vente et valeur faciale, sur la période affichée" icon={PiggyBank} tone="gold" />
      </div>

      <div className="overview-grid">
        <section className="panel operator-panel">
          <div className="panel-heading"><div><h2>Activité par opérateur</h2><p>Volume saisi · {pointFilter === "tous" ? "tous les points" : pointById.get(pointFilter)?.nom}</p></div><button className="text-button" onClick={() => onGo("operations")}>Toutes les opérations <ArrowRight size={15} /></button></div>
          <div className="operator-bars">{operatorVolumes.map((operator) => <div className="operator-bar-row" key={operator.code}><div className="operator-bar-label"><span className="operator-dot" style={{ "--operator-color": operator.couleur }} /><span>{operator.nom}</span><strong>{formatMoney(operator.volume)}</strong></div><div className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(operator.volume ? 6 : 0, (operator.volume / maxOperatorVolume) * 100)}%`, "--operator-color": operator.couleur }} /></div></div>)}</div>
          <div className="operator-panel-foot"><div><span>Commissions déclarées</span><strong>{formatMoney(commissions)}</strong></div><div><span>Dépenses du jour</span><strong>{formatMoney(expenses.reduce((sum, expense) => sum + Number(expense.montant || 0), 0))}</strong></div><div><span>Résultat estimé</span><strong className={resultEstimate < 0 ? "negative" : "positive"}>{formatMoney(resultEstimate)}</strong></div></div>
        </section>

        <section className="panel reconciliation-panel">
          <div className="panel-heading"><div><h2>Où est l'argent ?</h2><p>{selectedSession ? `Session de ${agentById.get(selectedSession.agent_id)?.prenom || "l'agent"}` : "Sélectionnez une session"}</p></div><div className={`reconcile-status ${selectedSession?.statut === "cloturee" ? (sessionFullyReconciled ? "good" : "warning") : "pending"}`}>{selectedSession?.statut === "cloturee" ? (!selectedSummary?.unitTracked ? "Stock non suivi" : sessionFullyReconciled ? "Rapproché" : "À vérifier") : "En cours"}</div></div>
          {selectedSession && selectedSummary ? <>
            <BalanceLine icon={Banknote} label="Espèces" amount={selectedSummary.cashExpected} declared={selectedSummary.cashDeclared} variance={selectedSummary.cashVariance} closed={selectedSession.statut === "cloturee"} />
            <div className="balance-divider" />
            {operatorOrder.map((operator) => {
              const row = selectedSummary.floatMap[operator.code];
              if (!row) return null;
              const declared = selectedSession.statut === "cloturee" ? row.declare : null;
              return <BalanceLine key={operator.code} operator={operator} label={operator.nom} amount={row.theorique} declared={declared} variance={declared == null ? null : declared - row.theorique} closed={selectedSession.statut === "cloturee"} />;
            })}
            <div className="balance-divider" />
            {selectedSummary.unitTracked ? <BalanceLine icon={Smartphone} label="Stock d'unités (valeur FCFA)" amount={selectedSummary.unitExpected} declared={selectedSummary.unitDeclared} variance={selectedSummary.unitVariance} closed={selectedSession.statut === "cloturee"} /> : <div className="formula-note"><span>Stock d'unités non suivi sur cette ancienne session; aucun écart historique n'est calculé.</span></div>}
            <div className="formula-note"><span>Solde = ouverture + mouvements saisis − dépenses · le stock est suivi séparément du float</span><button className="text-button" onClick={() => onGo("caisse")}>Détails <ArrowRight size={14} /></button></div>
          </> : <div className="empty-state compact"><Wallet size={22} /><p>Ouvrez une session pour suivre une caisse et ses soldes de départ.</p>{canWrite && <button className="button button-gold" onClick={onOpenOwnSession}>Ouvrir une caisse</button>}</div>}
        </section>
      </div>

      {cashMovements.length > 0 && <section className="panel cash-movements-panel">
        <div className="panel-heading">
          <div><h2>Mouvements d'espèces du jour</h2><p>Dépôts en banque, coffre et renforts de caisse</p></div>
          <button className="text-button" onClick={() => onOpenModal("cash")}><Plus size={15} />Nouveau mouvement</button>
        </div>
        <div className="cash-movements-list">{cashMovements.slice(0, 6).map((movement) => <div className="cash-movement-row" key={movement.id}>
          <span className={`cash-movement-icon ${movement.sens}`}>{movement.sens === "entree" ? <ArrowDownCircle size={15} /> : <ArrowUpCircle size={15} />}</span>
          <div><strong>{movement.motif || "Mouvement de caisse"}</strong><small>{CASH_MOVEMENT_SOURCES.find((source) => source.code === movement.source)?.label || movement.source} · {formatTime(movement.created_at)}</small></div>
          <b className={movement.sens === "entree" ? "positive" : "negative"}>{movement.sens === "entree" ? "+" : "−"}{formatMoney(movement.montant)}</b>
        </div>)}</div>
      </section>}

      <section className="panel recent-panel">
        <div className="panel-heading"><div><h2>Transactions du jour sélectionné</h2><p>{formatDate(selectedDate)} · {dashboardTransactions.length} lignes · {canManage ? "toute l'équipe" : "votre activité"}</p></div><button className="text-button" onClick={() => onGo("operations")}>Journal complet <ArrowRight size={15} /></button></div>
        {dashboardTransactions.length ? <TransactionTable rows={dashboardTransactions} operators={operatorByCode} points={pointById} agents={agentById} canManage={canManage && canWrite} onCancel={onCancel} onReceipt={onOpenReceipt} compact showDate sessionDateById={sessionDateById} /> : <div className="empty-state compact"><ReceiptText size={22} /><p>Aucune opération enregistrée pour cette date.</p></div>}
      </section>
    </main>
  );
}

function OperationsPage({ date, reportRange, period, onPeriodChange, transactions, sessionDateById, operators, points, agents, sessionCount, canManage, canWrite, onOpenModal, onExport, onExportPdf, onCancel, onReceipt, onCashMovement, onCreateReceipt }) {
  const [typeFilter, setTypeFilter] = useState("tous");
  const [operatorFilter, setOperatorFilter] = useState("tous");
  const [agentFilter, setAgentFilter] = useState("tous");
  const operatorOptions = Array.from(operators.values());
  const agentOptions = Array.from(new Set(transactions.map((transaction) => transaction.agent_id)))
    .map((id) => agents.get(id))
    .filter(Boolean);
  const filteredRows = filterReportTransactions(transactions, {
    type: typeFilter,
    operator: operatorFilter,
    agent: agentFilter,
  });
  const validRows = filteredRows.filter((transaction) => !transaction.annulee_le);
  const volume = validRows.reduce((sum, transaction) => sum + Number(transaction.montant || 0), 0);
  const periodLabel = reportRange.startDate === reportRange.endDate
    ? formatDate(reportRange.endDate)
    : `${formatDate(reportRange.startDate)} — ${formatDate(reportRange.endDate)}`;

  return (
    <main className="content-area">
      <PageHeading
        eyebrow={`JOURNAL · ${periodLabel}`}
        title="Opérations"
        description="Filtrez le journal par période, type, opérateur et agent avant d'exporter le rapport."
        actions={<>
          <button className="button button-outline" onClick={() => onExport(filteredRows)}><Download size={16} />CSV</button>
          <button className="button button-outline" onClick={() => onExportPdf(filteredRows)}><FileText size={16} />PDF</button>
          {canWrite && <button className="button button-soft" onClick={() => onOpenModal("cash")}><Landmark size={16} />Mouvement de caisse</button>}
          {canWrite && <button className="button button-dark" onClick={() => onOpenModal("transaction")}><Plus size={16} />Nouvelle opération</button>}
        </>}
      />
      <section className="filter-toolbar" aria-label="Filtres du journal">
        <div className="filter-heading"><span className="filter-icon"><CalendarDays size={15} /></span><div><strong>Filtrer le rapport</strong><small>Fin : {formatDate(date)} · {points.size ? "point choisi dans la barre supérieure" : "tous les points"}</small></div></div>
        <label><span>Période</span><select value={period} onChange={(event) => onPeriodChange(event.target.value)}><option value="day">Jour sélectionné</option><option value="week">7 derniers jours</option><option value="month">30 derniers jours</option></select></label>
        <label><span>Type</span><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="tous">Tous les types</option>{OPERATION_TYPES.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label>
        <label><span>Opérateur</span><select value={operatorFilter} onChange={(event) => setOperatorFilter(event.target.value)}><option value="tous">Tous les opérateurs</option>{operatorOptions.map((operator) => <option key={operator.code} value={operator.code}>{operator.nom}</option>)}</select></label>
        <label><span>Gérant / agent</span><select value={agentFilter} onChange={(event) => setAgentFilter(event.target.value)}><option value="tous">Toute l'équipe</option>{agentOptions.map((agent) => <option key={agent.id} value={agent.id}>{agent.prenom} {agent.nom}</option>)}</select></label>
      </section>
      <div className="section-stats">
        <div><span>Sessions de la période</span><strong>{sessionCount}</strong></div>
        <div><span>Lignes filtrées</span><strong>{filteredRows.length}</strong></div>
        <div><span>Volume validé</span><strong>{formatMoney(volume)}</strong></div>
        <div><span>Commissions à vérifier</span><strong>{validRows.filter((row) => row.type_operation !== "approvisionnement_unites" && row.commission_reelle == null).length}</strong></div>
      </div>
      <section className="panel table-panel">
        <div className="panel-heading">
          <div><h2>Journal des transactions</h2><p>Les lignes annulées restent visibles mais ne contribuent pas aux soldes ni aux totaux validés.</p></div>
          {canWrite && <button className="button button-soft" onClick={() => onOpenModal("expense")}><TrendingDown size={16} />Ajouter une dépense</button>}
        </div>
        {filteredRows.length ? (
          <TransactionTable rows={filteredRows} operators={operators} points={points} agents={agents} canManage={canManage && canWrite} onCancel={onCancel} onReceipt={onReceipt} showDate sessionDateById={sessionDateById} />
        ) : (
          <div className="empty-state"><ReceiptText size={25} /><strong>Aucune opération ne correspond à ces filtres.</strong><span>Modifiez la période ou les filtres, ou ouvrez une session pour saisir un premier mouvement.</span>{canWrite && <button className="button button-dark" onClick={() => onOpenModal("transaction")}>Ajouter une opération</button>}</div>
        )}
      </section>
      <div className="ledger-footnote"><ShieldCheck size={17} /><span>Le journal est manuel : vérifiez les reçus opérateurs. Kaisse ne déclenche pas de dépôt, retrait ou transfert.</span></div>
    </main>
  );
}
function TransactionTable({ rows, operators, points, agents, canManage, onCancel, onReceipt, compact = false, showDate = false, sessionDateById = new Map() }) {
  return <div className="table-scroll"><table className={`data-table ${compact ? "compact-table" : ""}`}><thead><tr>{showDate && <th>Date</th>}<th>Heure</th><th>Opération</th><th>Opérateur</th><th>Montant</th><th>Commission</th><th>Agent · point</th><th>Référence</th>{canManage && <th />}</tr></thead><tbody>{rows.map((transaction) => {
    const operator = operators.get(transaction.operateur_code);
    const destination = transaction.operateur_destination_code ? operators.get(transaction.operateur_destination_code) : null;
    const agent = agents.get(transaction.agent_id);
    const canceled = Boolean(transaction.annulee_le);
    const commission = transaction.commission_reelle == null ? null : Number(transaction.commission_reelle);
    return <tr key={transaction.id} className={canceled ? "cancelled-row" : ""}>
      {showDate && <td>{formatDate(sessionDateById.get(transaction.session_id))}</td>}
      <td className="time-cell">{formatTime(transaction.created_at)}</td>
      <td><div className="operation-cell"><strong>{OPERATION_LABELS[transaction.type_operation] || transaction.type_operation}</strong>{destination && <small>Vers {destination.nom}</small>}{(transaction.type_operation === "approvisionnement_unites" || transaction.type_operation === "transfert_unites") && <small>Règlement : {transaction.mode_paiement_unites === "wallet" ? `float ${operators.get(transaction.operateur_paiement_code)?.nom || transaction.operateur_paiement_code}` : "espèces"}</small>}{canceled && <small className="cancel-note">Annulée · {transaction.motif_annulation}</small>}</div></td>
      <td><span className="operator-name"><span className="operator-dot" style={{ "--operator-color": operator?.couleur || "#95a0a6" }} />{operator?.nom || transaction.operateur_code}</span></td>
      <td className="amount-cell">{formatMoney(transaction.montant)}</td>
      <td><div className="commission-cell">{transaction.type_operation === "approvisionnement_unites" ? <strong>—</strong> : commission == null ? <><strong>{formatMoney(transaction.commission_estimee)}</strong><small>estimée · à vérifier</small></> : <><strong>{formatMoney(commission)}</strong><small>déclarée</small></>}</div></td>
      <td><div className="operation-cell"><strong>{agent ? `${agent.prenom} ${agent.nom}`.trim() : "Agent"}</strong><small>{points.get(transaction.point_id)?.nom || "Point"}</small></div></td>
      <td className="reference-cell">{transaction.reference || "—"}</td>
      {canManage && <td>{!canceled && <div className="row-actions">{onReceipt && (transaction.type_operation === "transfert_unites" || transaction.type_operation === "approvisionnement_unites") && <button className="row-action soft" title="Préparer un reçu" onClick={() => onReceipt(transaction)}>Reçu</button>}<button className="row-action" title="Annuler avec un motif" onClick={() => onCancel(transaction)}>Annuler</button></div>}</td>}
    </tr>;
  })}</tbody></table></div>;
}

function UnitsPage({
  date, reportRange, period, onPeriodChange, stock, journal, summary, operators, points, pointById,
  agents, canManage, canWrite, onOpenModal, onOpenUnit, onCancel, onExport, onGo,
  forecasts = [], tariffs = [], onOpenReceipt, onOpenTariff,
}) {
  const [operatorFilter, setOperatorFilter] = useState("tous");
  const [typeFilter, setTypeFilter] = useState("tous");
  const [hideCancelled, setHideCancelled] = useState(false);
  const rows = journal
    .filter((transaction) => operatorFilter === "tous" || transaction.operateur_code === operatorFilter)
    .filter((transaction) => typeFilter === "tous" || transaction.type_operation === typeFilter)
    .filter((transaction) => !hideCancelled || !transaction.annulee_le);
  const filtered = summarizeUnitMovements(rows);
  const periodLabel = reportRange.startDate === reportRange.endDate
    ? formatDate(reportRange.endDate)
    : `${formatDate(reportRange.startDate)} — ${formatDate(reportRange.endDate)}`;
  const sells = summary.valid.filter((transaction) => transaction.type_operation === "transfert_unites");
  const averageSale = sells.length ? Math.round(summary.sold / sells.length) : 0;

  return (
    <main className="content-area">
      <PageHeading
        eyebrow={`UNITÉS · ${formatDate(date)}`}
        title="Unités & transferts"
        description="Stock d'unités par opérateur, approvisionnements, transferts aux clients et écarts de comptage — séparés du float et des espèces."
        actions={<>
          <button className="button button-outline" onClick={onExport}><Download size={16} />CSV unités</button>
          {canWrite && <button className="button button-soft" onClick={() => onOpenModal("unit-appro")}><ArrowDownCircle size={16} />Approvisionner</button>}
          {canWrite && <button className="button button-outline" onClick={() => onOpenModal("unit-ajustement")}><AlertTriangle size={16} />Ajustement</button>}
          {canWrite && <button className="button button-dark" onClick={() => onOpenModal("unit-vente")}><ArrowUpCircle size={16} />Transfert client</button>}
        </>}
      />

      {stock.alerts.length > 0 && <div className="alert-card low-unit-alert">
        <div className="alert-mark"><Package size={18} /></div>
        <div>
          <strong>{stock.alerts.length} opérateur{stock.alerts.length > 1 ? "s" : ""} à réapprovisionner</strong>
          <span>{stock.alerts.map((row) => `${row.nom} · ${UNIT_LEVELS[row.niveau].label.toLowerCase()} : ${formatMoney(row.theorique)} (seuil ${formatMoney(row.seuil)})`).join(" — ")}. Un transfert client est refusé lorsque le stock théorique est atteint.</span>
        </div>
        {canWrite && <button className="text-button" onClick={() => onOpenModal("unit-appro")}>Approvisionner <ArrowRight size={15} /></button>}
      </div>}

      {(stock.untrackedSessions > 0 || stock.untrackedClosed > 0) && <div className="alert-card unit-untracked-alert">
        <div className="alert-mark"><LockKeyhole size={18} /></div>
        <div>
          <strong>{stock.untrackedSessions + stock.untrackedClosed} session{stock.untrackedSessions + stock.untrackedClosed > 1 ? "s" : ""} sans stock initial suivi</strong>
          <span>Ces sessions ont été ouvertes avant le suivi des unités : leur comptage de clôture reste conservé, mais aucun écart d'unités n'est calculé. Si l'une est encore ouverte, clôturez-la puis ouvrez une nouvelle session avec le stock de départ.</span>
        </div>
        <button className="text-button" onClick={() => onGo("caisse")}>Voir la caisse <ArrowRight size={15} /></button>
      </div>}

      <div className="kpi-grid">
        <KpiCard
          label="Stock d'unités disponible"
          value={formatMoney(stock.totalStock)}
          hint={`${stock.liveSessionCount} session${stock.liveSessionCount > 1 ? "s" : ""} en cours · ${stock.tracked ? "tous les opérateurs suivis" : stock.liveSessionCount ? "suivi partiel" : "aucune session ouverte"}`}
          icon={Package}
          tone={stock.alerts.length ? "red" : "teal"}
        />
        <KpiCard
          label="Approvisionnements de la période"
          value={formatMoney(summary.approved)}
          hint={`${summary.valid.filter((item) => item.type_operation === "approvisionnement_unites").length} achat(s) · payé en espèces ${formatMoney(summary.cashOut)}`}
          icon={ArrowDownCircle}
          tone="blue"
        />
        <KpiCard
          label="Transferts aux clients"
          value={formatMoney(summary.sold)}
          hint={`${sells.length} vente(s) · panier moyen ${formatMoney(averageSale)} · encaissé espèces ${formatMoney(summary.cashIn)}`}
          icon={ArrowUpCircle}
          tone="gold"
        />
        <KpiCard
          label="Marge sur les unités"
          value={formatMoney(summary.margin)}
          hint={`Prix de vente − valeur faciale${tariffs.length ? ` · ${tariffs.length} barème(s) de vente` : " · aucun barème de vente"}`}
          icon={PiggyBank}
          tone={summary.margin < 0 ? "red" : "teal"}
        />
        <KpiCard
          label="Commissions unités"
          value={formatMoney(summary.commissions)}
          hint={summary.commissionsToVerify ? `${summary.commissionsToVerify} transfert(s) sans commission réelle saisie` : "Toutes les commissions constatées sont saisies"}
          icon={HandCoins}
          tone="ink"
        />
      </div>

      <section className="panel unit-stock-board">
        <div className="panel-heading">
          <div>
            <h2>Stock par opérateur</h2>
            <p>Sessions ouvertes · ouverture + approvisionnements − transferts clients · valeur faciale FCFA · {points.length > 1 ? "seuil le plus élevé des points affichés" : `seuil du point ${points[0]?.nom || ""}`}</p>
          </div>
          <span className="unit-stock-total">{formatMoney(stock.totalStock)}</span>
        </div>
        <div className="unit-cards">
          {operators.map((operator) => {
            const row = stock.byCode[operator.code];
            if (!row) return null;
            const threshold = row.seuil && row.seuil > 0 ? row.seuil : 0;
            const gaugeMax = threshold ? threshold * 3 : Math.max(1, row.theorique);
            const ratio = Math.max(0, Math.min(100, (row.theorique / gaugeMax) * 100));
            const level = UNIT_LEVELS[row.niveau] || UNIT_LEVELS.non_suivi;
            return <article className={`unit-card level-${row.niveau}`} key={operator.code}>
              <div className="unit-card-head">
                <span className="operator-name"><span className="operator-dot" style={{ "--operator-color": operator.couleur }} />{operator.nom}</span>
                <span className={`unit-level-badge ${row.niveau}`}>{level.label}</span>
              </div>
              <strong className="unit-card-value">{row.suivi ? formatMoney(row.theorique) : "—"}</strong>
              <div className="unit-gauge" role="img" aria-label={`Stock ${formatMoney(row.theorique)} sur un seuil de ${row.seuil == null ? "aucun seuil" : formatMoney(row.seuil)}`}>
                <div className={`unit-gauge-fill ${row.niveau}`} style={{ width: `${row.suivi ? Math.max(ratio, row.theorique > 0 ? 4 : 0) : 0}%`, "--operator-color": operator.couleur }} />
                {threshold > 0 && <span className="unit-gauge-mark" style={{ left: "33.33%" }} />}
              </div>
              <div className="unit-card-meta">
                <span>Seuil {row.seuil == null ? "non défini" : formatMoney(row.seuil)}</span>
                <span>Ouverture {formatMoney(row.ouverture)}</span>
              </div>
              <div className="unit-card-stats">
                <div><span>Achats</span><strong className="positive">+{formatMoney(row.approvisionnements)}</strong></div>
                <div><span>Ventes</span><strong className="negative">−{formatMoney(row.ventes)}</strong></div>
                <div><span>Écart clôture</span><strong className={row.ecart && row.ecart !== 0 ? "negative" : ""}>{row.ecart == null ? "—" : formatMoney(row.ecart)}</strong></div>
              </div>
              <div className="unit-card-actions">
                {canWrite && <button className="button button-soft" onClick={() => onOpenUnit("unit-appro", operator.code)}><ArrowDownCircle size={14} />Approvisionner</button>}
                {canWrite && <button className="button button-outline" disabled={!row.suivi || row.theorique <= 0} onClick={() => onOpenUnit("unit-vente", operator.code)}><ArrowUpCircle size={14} />Vendre</button>}
              </div>
            </article>;
          })}
        </div>
      </section>

      {forecasts.length > 0 && <section className="panel unit-forecast-panel">
        <div className="panel-heading">
          <div><h2>Prévision de rupture</h2><p>Moyenne des sorties récentes · stock disponible · recommandation sur 7 jours</p></div>
          <button className="text-button" onClick={() => onGo("pilotage")}>Pilotage complet <ArrowRight size={14} /></button>
        </div>
        <div className="unit-forecast-grid">{forecasts.map((row) => {
          const max = Math.max(1, ...row.series.map((point) => point.consumption));
          return <div className={`unit-forecast ${row.level}`} key={row.code}>
            <div className="unit-forecast-head"><span className="operator-name"><span className="operator-dot" style={{ "--operator-color": row.couleur }} />{row.nom}</span><span className={`forecast-badge ${row.level === "rupture" || row.level === "critique" ? "red" : row.level === "bas" ? "gold" : "teal"}`}>{row.daysOfCover == null ? "aucune vente" : `${row.daysOfCover.toFixed(1)} j`}</span></div>
            <div className="forecast-bars small" aria-hidden>{row.series.map((point) => <span key={point.date} className="forecast-bar" style={{ height: `${Math.max(4, (point.consumption / max) * 100)}%` }} title={`${point.date} : ${formatMoney(point.consumption)}`} />)}</div>
            <div className="unit-forecast-foot"><span>Moy. {formatMoney(Math.round(row.averageDaily))}/j</span><strong>{row.recommended > 0 ? `Commander ${formatMoney(row.recommended)}` : "Stock suffisant"}</strong></div>
          </div>;
        })}</div>
      </section>}

      {tariffs.length > 0 && <section className="panel tariff-strip">
        <div className="panel-heading"><div><h2>Barèmes de vente d'unités</h2><p>Prix appliqué au client pour 100 F de valeur faciale</p></div>{canWrite && <button className="button button-soft" onClick={onOpenTariff}><Plus size={15} />Ajouter</button>}</div>
        <div className="tariff-rows">{tariffs.filter((tariff) => tariff.actif !== false).map((tariff) => {
          const operator = operators.find((item) => item.code === tariff.operateur_code);
          const margin = Number(tariff.prix_vente) - Number(tariff.prix_valeur_faciale);
          return <div className="tariff-row" key={tariff.id}>
            <span className="operator-name"><span className="operator-dot" style={{ "--operator-color": operator?.couleur }} />{operator?.nom || tariff.operateur_code}</span>
            <span>{tariff.prix_vente} F pour {tariff.prix_valeur_faciale} F</span>
            <strong className={margin < 0 ? "negative" : "positive"}>{formatMoney(margin)} de marge</strong>
            <small>{(tariff.source || "Source non renseignée")}</small>
          </div>;
        })}</div>
      </section>}

      <div className="units-columns">
        <section className="panel units-journal-panel">
          <div className="panel-heading">
            <div>
              <h2>Journal des mouvements d'unités</h2>
              <p>{periodLabel} · {rows.length} ligne{rows.length > 1 ? "s" : ""} · {points.length > 1 ? "tous les points" : points[0]?.nom || "point"}</p>
            </div>
            <button className="text-button" onClick={onExport}><Download size={15} />Exporter</button>
          </div>
          <div className="unit-toolbar">
            <label><span>Période</span><select value={period} onChange={(event) => onPeriodChange(event.target.value)}><option value="day">Jour sélectionné</option><option value="week">7 derniers jours</option><option value="month">30 derniers jours</option></select></label>
            <label><span>Opérateur</span><select value={operatorFilter} onChange={(event) => setOperatorFilter(event.target.value)}><option value="tous">Tous</option>{operators.map((operator) => <option key={operator.code} value={operator.code}>{operator.nom}</option>)}</select></label>
            <label><span>Mouvement</span><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="tous">Tous</option>{UNIT_OPERATION_TYPES.map((operation) => <option key={operation.code} value={operation.code}>{operation.shortLabel}</option>)}</select></label>
            <label className="unit-checkbox"><input type="checkbox" checked={hideCancelled} onChange={(event) => setHideCancelled(event.target.checked)} /><span>Masquer les annulées</span></label>
          </div>
          <div className="unit-inline-stats">
            <div><span>Approvisionnements</span><strong>+{formatMoney(filtered.approved)}</strong></div>
            <div><span>Transferts clients</span><strong>−{formatMoney(filtered.sold)}</strong></div>
            <div><span>Commissions</span><strong>{formatMoney(filtered.commissions)}</strong></div>
            <div><span>Flux espèces net</span><strong className={filtered.netCash < 0 ? "negative" : "positive"}>{formatMoney(filtered.netCash)}</strong></div>
          </div>
          {rows.length
            ? <UnitMovementTable rows={rows} operators={operators} agents={agents} pointById={pointById} canManage={canManage && canWrite} onCancel={onCancel} onReceipt={onOpenReceipt} tariffs={tariffs} />
            : <div className="empty-state compact"><Package size={24} /><strong>Aucun mouvement d'unités sur cette sélection.</strong><span>Approvisionnez le stock depuis un grossiste ou enregistrez un transfert vendu à un client.</span>{canWrite && <button className="button button-dark" onClick={() => onOpenModal("unit-appro")}>Approvisionner</button>}</div>}
        </section>

        <aside className="units-side">
          <section className="panel unit-guide">
            <div className="panel-heading"><div><h2>Repères de gestion</h2><p>Ce que la section calcule, et ce qu'elle ne fait pas.</p></div><Package size={19} className="panel-heading-icon" /></div>
            <div className="unit-guide-list">
              <div><span className="unit-guide-num">1</span><div><strong>Stock théorique</strong><p>Ouverture de session + approvisionnements − transferts clients, par opérateur, en valeur faciale FCFA.</p></div></div>
              <div><span className="unit-guide-num">2</span><div><strong>Règlement</strong><p>Un approvisionnement en espèces réduit la caisse physique ; réglé par wallet, il réduit le float choisi. Une vente fait l'inverse.</p></div></div>
              <div><span className="unit-guide-num">3</span><div><strong>Seuil d'alerte</strong><p>Configuré à la création du point. Sous ce seuil, la carte passe en « stock bas » ; à zéro, en « rupture ».</p></div></div>
              <div><span className="unit-guide-num">4</span><div><strong>Écart de comptage</strong><p>Comparé au stock déclaré à la clôture de chaque session suivie. Aucun écart n'est inventé sur les anciennes sessions.</p></div></div>
            </div>
            <div className="unit-guide-foot"><AlertTriangle size={15} /><span>Kaisse enregistre la vente d'unités, mais n'envoie aucune recharge : le transfert reste effectué sur le téléphone ou le portail opérateur.</span></div>
          </section>

          <section className="panel unit-balance-panel">
            <div className="panel-heading"><div><h2>Rapprochement du jour</h2><p>Écarts calculés sur les sessions clôturées.</p></div><ShieldCheck size={19} className="panel-heading-icon" /></div>
            {stock.ecartsCalculables > 0 ? <>
              <div className="unit-balance-total">
                <span>Écart d'unités cumulé</span>
                <strong className={stock.totalEcart === 0 ? "positive" : "negative"}>{stock.totalEcart > 0 ? "+" : ""}{formatMoney(stock.totalEcart)}</strong>
              </div>
              <div className="unit-balance-rows">
                {stock.operators.filter((row) => row.ecart != null && row.ecart !== 0).map((row) => <div key={row.code}><span>{row.nom}</span><strong className="negative">{row.ecart > 0 ? "+" : ""}{formatMoney(row.ecart)}</strong></div>)}
                {stock.operators.every((row) => row.ecart == null || row.ecart === 0) && <div><span>Aucun écart déclaré</span><strong className="positive">0 F</strong></div>}
              </div>
            </> : <div className="empty-inline">Aucune session clôturée avec stock suivi pour cette date. L'écart apparaîtra après le comptage de clôture.</div>}
            <div className="unit-margin-line"><span>Marge de la période</span><strong className={summary.margin < 0 ? "negative" : "positive"}>{formatMoney(summary.margin)}</strong></div>
            <button className="text-button" onClick={() => onGo("caisse")}>Ouvrir Caisse & clôture <ArrowRight size={14} /></button>
          </section>

          <section className="panel unit-top-panel">
            <div className="panel-heading"><div><h2>Unités transférées par opérateur</h2><p>Ventes de la période sélectionnée.</p></div><TrendingUp size={19} className="panel-heading-icon" /></div>
            <div className="unit-top-rows">
              {operators.map((operator) => {
                const row = stock.byCode[operator.code];
                const max = Math.max(1, ...operators.map((item) => stock.byCode[item.code]?.ventes || 0));
                return <div className="unit-top-row" key={operator.code}>
                  <span className="operator-name"><span className="operator-dot" style={{ "--operator-color": operator.couleur }} />{operator.nom}</span>
                  <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(row?.ventes ? 5 : 0, ((row?.ventes || 0) / max) * 100)}%`, "--operator-color": operator.couleur }} /></div>
                  <strong>{formatMoney(row?.ventes || 0)}</strong>
                </div>;
              })}
            </div>
          </section>
        </aside>
      </div>

      <div className="ledger-footnote"><ShieldCheck size={17} /><span>Les montants d'unités sont des valeurs faciales saisies par l'agence. Les bonus, remises et prix de vente supérieurs à la valeur faciale se suivent dans la commission réelle.</span></div>
    </main>
  );
}

function UnitMovementTable({ rows, operators, agents, pointById, canManage, onCancel, onReceipt, tariffs = [] }) {
  return <div className="table-scroll"><table className="data-table unit-table">
    <thead><tr><th>Heure</th><th>Mouvement</th><th>Opérateur</th><th>Valeur faciale</th><th>Règlement</th><th>Commission</th><th>Agent · point</th><th>Statut</th>{canManage && <th />}</tr></thead>
    <tbody>{rows.map((transaction) => {
      const operator = operators.find((item) => item.code === transaction.operateur_code);
      const agent = agents.get(transaction.agent_id);
      const isSale = transaction.type_operation === "transfert_unites";
      const isAdjustment = transaction.type_operation === "ajustement_unites";
      const effectiveRate = (() => {
        const tariff = tariffs.find((row) => row.actif !== false && row.operateur_code === transaction.operateur_code);
        if (!tariff || !transaction.montant) return null;
        return Number(transaction.montant_reglement ?? transaction.montant) / Number(transaction.montant);
      })();
      const settledByWallet = transaction.mode_paiement_unites === "wallet";
      const paymentOperator = operators.find((item) => item.code === transaction.operateur_paiement_code);
      const canceled = Boolean(transaction.annulee_le);
      const commission = transaction.commission_reelle ?? transaction.commission_estimee;
      return <tr key={transaction.id} className={canceled ? "cancelled-row" : ""}>
        <td className="time-cell">{formatTime(transaction.created_at)}</td>
        <td><div className="operation-cell"><strong>{isAdjustment ? `Ajustement ${transaction.ajustement_sens === "entree" ? "entrée" : "sortie"}` : isSale ? "Transfert client" : "Approvisionnement"}</strong>{(transaction.beneficiaire_masque || transaction.note) && <small>{transaction.beneficiaire_masque ? `Bénéficiaire ${transaction.beneficiaire_masque}` : transaction.note}</small>}{transaction.reference && <small>Réf. {transaction.reference}</small>}{effectiveRate && effectiveRate !== 1 && <small>{effectiveRate > 1 ? "Vendu" : "Acheté"} à {(effectiveRate * 100).toFixed(0)} % de la valeur faciale</small>}{canceled && <small className="cancel-note">Annulée · {transaction.motif_annulation}</small>}</div></td>
        <td><span className="operator-name"><span className="operator-dot" style={{ "--operator-color": operator?.couleur || "#95a0a6" }} />{operator?.nom || transaction.operateur_code}</span></td>
        <td className={isAdjustment ? "amount-cell" : isSale ? "amount-cell negative" : "amount-cell positive"}>{isAdjustment ? (transaction.ajustement_sens === "entree" ? "+" : "−") : isSale ? "−" : "+"}{formatMoney(transaction.montant)}</td>
        <td><div className="operation-cell"><strong>{isAdjustment ? "Aucun" : settledByWallet ? `Float ${paymentOperator?.nom || transaction.operateur_paiement_code || ""}` : "Espèces"}</strong><small>{isAdjustment ? "stock seul" : `${isSale ? "encaissé" : "payé"} ${formatMoney(settlementAmount(transaction))}`}</small></div></td>
        <td className="commission-cell">{isSale ? <><strong>{formatMoney(commission)}</strong>{transaction.commission_reelle == null && <small>estimée</small>}</> : <strong>—</strong>}</td>
        <td><div className="operation-cell"><strong>{agent ? `${agent.prenom} ${agent.nom}`.trim() : "Agent"}</strong><small>{pointById.get(transaction.point_id)?.nom || "Point"}</small></div></td>
        <td><span className={`unit-status ${canceled ? "cancelled" : ""}`}>{canceled ? "Annulée" : "Validée"}</span></td>
        {canManage && <td>{!canceled && <div className="row-actions">{onReceipt && isSale && <button className="row-action soft" title="Préparer un reçu" onClick={() => onReceipt(transaction)}>Reçu</button>}<button className="row-action" onClick={() => onCancel(transaction)}>Annuler</button></div>}</td>}
      </tr>;
    })}</tbody>
  </table></div>;
}

function UnitMovementModal({ variant = "appro", initialOperator = "", sessions, summaries, points, operators, rules, stock, tariffs = [], onClose, onSave }) {
  const [mode, setMode] = useState(variant);
  const [sessionId, setSessionId] = useState(sessions[0]?.id || "");
  const [operatorCode, setOperatorCode] = useState(
    operators.some((operator) => operator.code === initialOperator) ? initialOperator : operators[0]?.code || "orange",
  );
  const [amount, setAmount] = useState("");
  const [settlement, setSettlement] = useState("");
  const [paymentMode, setPaymentMode] = useState("especes");
  const [paymentOperatorCode, setPaymentOperatorCode] = useState(operators[0]?.code || "orange");
  const [commissionActual, setCommissionActual] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  const [reference, setReference] = useState("");
  const [adjustmentSens, setAdjustmentSens] = useState("sortie");
  const [motif, setMotif] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isSale = mode === "vente";
  const isAdjustment = mode === "ajustement";
  const typeOperation = isAdjustment ? "ajustement_unites" : isSale ? "transfert_unites" : "approvisionnement_unites";
  const selectedSession = sessions.find((session) => session.id === sessionId);
  const selectedSummary = summaries.find(({ session }) => session.id === sessionId)?.totals;
  const moneyPlaceholder = amount || "Même montant";
  const available = selectedSummary?.unitMap?.[operatorCode]?.theorique ?? stock.byCode[operatorCode]?.theorique ?? 0;
  const unitTracked = selectedSummary?.unitTracked ?? stock.byCode[operatorCode]?.suivi ?? false;
  const tariff = tariffs.find((row) => row.actif !== false && row.operateur_code === operatorCode);
  const suggestedSettlement = isSale && tariff
    ? Math.round((Number(amount || 0) * Number(tariff.prix_vente)) / Math.max(1, Number(tariff.prix_valeur_faciale)))
    : Number(amount || 0);
  const estimate = isSale || isAdjustment ? calculateCommission({ type_operation: typeOperation, operateur_code: operatorCode, montant: amount }, rules) : 0;
  const maskedPreview = maskBeneficiary(beneficiary);
  const projectedStock = available + (isSale ? -1 : isAdjustment ? (adjustmentSens === "entree" ? 1 : -1) : 1) * Number(amount || 0);

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      if (!sessionId) throw new Error("Vous n'avez pas de session ouverte avec ce compte.");
      if (!unitTracked) throw new Error("Le stock initial n'est pas suivi sur cette session. Clôturez-la, puis ouvrez une nouvelle session avec le stock de départ.");
      const money = safeAmount(amount, "La valeur des unités");
      if (isSale || (isAdjustment && adjustmentSens === "sortie")) {
        const check = canSellUnits({ available, amount: money });
        if (!check.ok) throw new Error(check.message);
      }
      if (isAdjustment && motif.trim().length < 3) throw new Error("Indiquez le motif de l'ajustement (cassee, perte, erreur de comptage…).");
      if (paymentMode === "wallet" && !isAdjustment && !paymentOperatorCode) throw new Error("Choisissez l'opérateur utilisé pour le règlement.");
      const realCommission = isSale
        ? (commissionActual.trim() === "" ? null : safeAmount(commissionActual, "La commission", true))
        : 0;
      const regulated = isAdjustment || settlement.trim() === ""
        ? money
        : safeAmount(settlement, "Le montant réellement réglé", true);
      setLoading(true);
      await onSave({
        session_id: sessionId,
        type_operation: typeOperation,
        operateur_code: operatorCode,
        operateur_destination_code: null,
        montant: money,
        montant_reglement: isAdjustment ? null : regulated,
        commission_estimee: estimate,
        commission_reelle: realCommission,
        mode_paiement_unites: isAdjustment ? null : paymentMode,
        operateur_paiement_code: !isAdjustment && paymentMode === "wallet" ? paymentOperatorCode : null,
        ajustement_sens: isAdjustment ? adjustmentSens : null,
        beneficiaire_masque: isSale ? maskedPreview : null,
        reference: reference.trim(),
        note: isAdjustment ? motif.trim() : "",
      });
      onClose();
    } catch (saveError) {
      setError(makeErrorMessage(saveError));
    } finally {
      setLoading(false);
    }
  }

  return <ModalShell
    title={isAdjustment ? "Ajuster le stock d'unités" : isSale ? "Transfert d'unités à un client" : "Approvisionner le stock d'unités"}
    subtitle="Mouvement d'unités rattaché à votre session ouverte, séparé du float."
    onClose={onClose}
    wide
  >
    {sessions.length ? <form className="modal-form" onSubmit={submit}>
      <div className="operation-type-picker unit-mode-picker three">
        <button type="button" className={!isSale && !isAdjustment ? "active" : ""} onClick={() => setMode("appro")}><ArrowDownCircle size={15} />Approvisionnement</button>
        <button type="button" className={isSale ? "active" : ""} onClick={() => setMode("vente")}><ArrowUpCircle size={15} />Transfert client</button>
        <button type="button" className={isAdjustment ? "active" : ""} onClick={() => setMode("ajustement")}><AlertTriangle size={15} />Ajustement</button>
      </div>
      <FormField label="Session de caisse"><select value={sessionId} onChange={(event) => setSessionId(event.target.value)}>{sessions.map((session) => <option key={session.id} value={session.id}>{points.find((point) => point.id === session.point_id)?.nom || "Point"} · {formatTime(session.ouverte_le)}</option>)}</select></FormField>
      <div className="form-row">
        <FormField label="Opérateur du stock"><select value={operatorCode} onChange={(event) => setOperatorCode(event.target.value)}>{operators.map((operator) => <option key={operator.code} value={operator.code}>{operator.nom}</option>)}</select></FormField>
        {!isAdjustment && <FormField label={isSale ? "Le client règle par" : "Approvisionnement payé depuis"}><select value={paymentMode} onChange={(event) => setPaymentMode(event.target.value)}><option value="especes">Espèces</option><option value="wallet">Float électronique</option></select></FormField>}
        {isAdjustment && <FormField label="Sens de l'ajustement"><select value={adjustmentSens} onChange={(event) => setAdjustmentSens(event.target.value)}><option value="sortie">Sortie (perte, casse, vol)</option><option value="entree">Entrée (erreur de comptage)</option></select></FormField>}
      </div>
      {!isAdjustment && paymentMode === "wallet" && <FormField label={isSale ? "Float crédité" : "Float débité"}><select value={paymentOperatorCode} onChange={(event) => setPaymentOperatorCode(event.target.value)}>{operators.map((operator) => <option key={operator.code} value={operator.code}>{operator.nom}</option>)}</select></FormField>}
      <FormField
        label={isAdjustment ? "Valeur de l'ajustement (FCFA)" : "Valeur faciale des unités (FCFA)"}
        hint={isSale
          ? `Stock disponible : ${formatMoney(available)} · vente plafonnée à ce montant.`
          : isAdjustment
            ? "Corrige le stock sans toucher aux espèces ni au float."
            : "Le même montant ajuste le stock et le règlement (espèces ou wallet)."}
      >
        <input type="number" min="1" step="1" inputMode="numeric" required autoFocus value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Ex. 5 000" />
      </FormField>
      {!isAdjustment && <FormField
        label={isSale ? "Montant réellement encaissé (FCFA)" : "Montant réellement payé (FCFA)"}
        hint={`Vide = valeur faciale (${formatMoney(suggestedSettlement)}).${isSale && tariff ? ` Barème : ${tariff.prix_vente} F pour ${tariff.prix_valeur_faciale} F de crédit.` : ""}`}
      >
        <input type="number" min="0" step="1" inputMode="numeric" value={settlement} onChange={(event) => setSettlement(event.target.value)} placeholder={String(suggestedSettlement || "")} />
      </FormField>}
      {isSale && <div className="form-row">
        <FormField label="Numéro du bénéficiaire (facultatif)" hint={maskedPreview ? `Enregistré masqué : ${maskedPreview}` : "Seuls 2 chiffres au début et à la fin sont conservés."}>
          <input value={beneficiary} onChange={(event) => setBeneficiary(event.target.value)} inputMode="tel" maxLength={20} placeholder="07 00 00 00 00" />
        </FormField>
        <FormField label="Référence (facultatif)" hint="Référence courte du reçu ou du SMS opérateur."><input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={80} placeholder="Ex. OM-1042" /></FormField>
      </div>}
      {isAdjustment && <div className="form-row">
        <FormField label="Motif obligatoire" hint="Casse, perte, vol, erreur de comptage…"><input required value={motif} onChange={(event) => setMotif(event.target.value)} maxLength={160} placeholder="Ex. cartes abîmées" /></FormField>
        <FormField label="Référence (facultatif)"><input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={80} placeholder="Ex. PROCES-12" /></FormField>
      </div>}
      {!isSale && !isAdjustment && <FormField label="Référence (facultatif)"><input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={80} placeholder="Bon de livraison grossiste" /></FormField>}
      {isSale && <div className="commission-entry">
        <div><HandCoins size={16} /><span>Commission estimée</span><strong>{formatMoney(estimate)}</strong></div>
        <FormField label="Commission réellement constatée (facultatif)"><input type="number" min="0" step="1" inputMode="numeric" value={commissionActual} onChange={(event) => setCommissionActual(event.target.value)} placeholder="Laisser vide si inconnue" /></FormField>
      </div>}
      {isSale && !rules.some((rule) => rule.operateur_code === operatorCode && rule.type_operation === typeOperation) && <div className="field-note"><AlertTriangle size={14} />Aucun barème pour le transfert d'unités de cet opérateur : l'estimation vaut 0. Ajoutez une tranche dans Réglages.</div>}
      <div className="movement-hint">
        <InfoLine type={typeOperation} operator={operators.find((operator) => operator.code === operatorCode)?.nom} paymentMode={paymentMode} paymentOperator={operators.find((operator) => operator.code === paymentOperatorCode)?.nom} />
        <span>Stock après opération : {formatMoney(Math.max(0, projectedStock))}</span>
      </div>
      {isSale && <div className="field-note"><ReceiptText size={14} />Un reçu peut être préparé depuis le journal des unités après l'enregistrement.</div>}
      {!unitTracked && <div className="field-note"><AlertTriangle size={14} />Cette session n'a pas de stock initial suivi : les mouvements d'unités y sont bloqués.</div>}
      {selectedSession && <div className="field-note"><Clock3 size={14} />Session ouverte à {formatTime(selectedSession.ouverte_le)} · mouvement horodaté à l'enregistrement.</div>}
      <ModalError>{error}</ModalError>
      <ModalActions onCancel={onClose} loading={loading} label={isAdjustment ? "Enregistrer l'ajustement" : isSale ? "Enregistrer le transfert" : "Enregistrer l'approvisionnement"} />
    </form> : <div className="modal-empty"><Wallet size={25} /><strong>Aucune session ouverte pour votre compte.</strong><span>Ouvrez une caisse avant de saisir un mouvement d'unités.</span><button type="button" className="button button-dark" onClick={onClose}>Compris</button></div>}
  </ModalShell>;
}

function CashPage({ date, isHistorical, user, points, operators, selectedSession, selectedSummary, summaries, selectedSessionId, onSessionChange, units, expenses, agents, canWrite, onOpenModal, onOpenOwnSession, cashMovements = [] }) {
  const ownOpen = summaries.some(({ session }) => session.agent_id === user.id && session.statut === "ouverte");
  const sessionExpenses = expenses.filter((expense) => expense.session_id === selectedSession?.id);
  const sessionUnitRows = units.filter((row) => row.session_id === selectedSession?.id);
  const operatorRows = operators.map((operator) => ({ operator, balance: selectedSummary?.floatMap?.[operator.code] }));
  return (
    <main className="content-area">
      <PageHeading eyebrow={`CAISSE · ${formatDate(date)}`} title="Caisse & clôture" description="Comparez les soldes théoriques aux montants réellement déclarés par l'agent." actions={<>{selectedSession?.statut === "ouverte" && canWrite && <button className="button button-outline" onClick={() => onOpenModal("cash")}><Landmark size={16} />Mouvement d'espèces</button>}{selectedSession?.statut === "ouverte" && canWrite && <button className="button button-soft" onClick={() => onOpenModal("expense")}><TrendingDown size={16} />Saisir une dépense</button>}{selectedSession?.statut === "ouverte" && selectedSession.agent_id === user.id && <button className="button button-dark" onClick={() => onOpenModal("close-session")}><CheckCircle2 size={16} />Clôturer la session</button>}{isHistorical && <span className="read-only-pill"><LockKeyhole size={14} />Historique en lecture</span>}</>} />
      <div className="cash-toolbar"><div className="cash-toolbar-copy"><strong>Session sélectionnée</strong><span>Chaque session garde ses propres soldes d'ouverture et de clôture.</span></div><select value={selectedSessionId} onChange={(event) => onSessionChange(event.target.value)}><option value="">Aucune session</option>{summaries.map(({ session }) => <option key={session.id} value={session.id}>{points.find((point) => point.id === session.point_id)?.nom || "Point"} · {agents.get(session.agent_id)?.prenom || "Agent"} · {session.statut === "ouverte" ? "ouverte" : "clôturée"}</option>)}</select>{!ownOpen && !isHistorical && canWrite && <button className="button button-gold" onClick={onOpenOwnSession}><Plus size={15} />Ouvrir ma caisse</button>}</div>
      {selectedSession && selectedSummary ? <>
        <div className="cash-status-card"><div className={`cash-status-icon ${selectedSession.statut === "cloturee" ? (selectedSummary.cashVariance === 0 && !selectedSummary.floatHasDifference && selectedSummary.unitTracked && !selectedSummary.unitHasDifference ? "done" : "issue") : "live"}`}>{selectedSession.statut === "cloturee" ? <CheckCircle2 size={19} /> : <Clock3 size={19} />}</div><div><strong>{selectedSession.statut === "cloturee" ? "Session clôturée" : "Session en cours"}</strong><span>{points.find((point) => point.id === selectedSession.point_id)?.nom || "Point"} · {agents.get(selectedSession.agent_id)?.prenom || "Agent"} {agents.get(selectedSession.agent_id)?.nom || ""} · {selectedSession.ouverte_le ? `ouverte à ${formatTime(selectedSession.ouverte_le)}` : ""}</span></div><div className="cash-status-right"><span>{selectedSession.statut === "cloturee" ? "Écart espèces" : "Espèces théoriques"}</span><strong className={selectedSummary.cashVariance < 0 ? "negative" : ""}>{selectedSession.statut === "cloturee" ? formatMoney(selectedSummary.cashVariance) : formatMoney(selectedSummary.cashExpected)}</strong></div></div>
        <div className="cash-balance-grid">
          <section className="panel cash-balance-card"><div className="balance-card-heading"><div className="balance-large-icon cash-icon"><Banknote size={20} /></div><div><h2>Espèces en caisse</h2><p>Ouverture + mouvements en espèces − dépenses payées en espèces</p></div></div><div className="balance-numbers"><div><span>Solde théorique</span><strong>{formatMoney(selectedSummary.cashExpected)}</strong></div><div><span>Solde d'ouverture</span><strong>{formatMoney(selectedSession.caisse_ouverture)}</strong></div></div>{selectedSession.statut === "cloturee" && <VarianceBox declared={selectedSummary.cashDeclared} theoretical={selectedSummary.cashExpected} variance={selectedSummary.cashVariance} />}</section>
          <section className="panel cash-balance-card"><div className="balance-card-heading"><div className="balance-large-icon float-icon"><Smartphone size={20} /></div><div><h2>Float électronique</h2><p>Solde d'ouverture + opérations − dépenses wallet</p></div></div><div className="wallet-list">{operatorRows.map(({ operator, balance }) => balance && <div className="wallet-row" key={operator.code}><span className="operator-name"><span className="operator-dot" style={{ "--operator-color": operator.couleur }} />{operator.nom}</span><div><strong>{formatMoney(balance.theorique)}</strong>{selectedSession.statut === "cloturee" && <small className={balance.declare === balance.theorique ? "positive" : "negative"}>Déclaré {formatMoney(balance.declare)} · écart {formatMoney((balance.declare || 0) - balance.theorique)}</small>}</div></div>)}</div></section>
        </div>
        <section className="panel unit-stock-panel">
          <div className="balance-card-heading"><div className="balance-large-icon unit-stock-icon"><Smartphone size={20} /></div><div><h2>Stock d'unités par opérateur</h2><p>Valeur faciale en FCFA · distincte du float électronique.</p></div><strong className="unit-stock-total">{selectedSummary.unitTracked ? formatMoney(selectedSummary.unitExpected) : "Non suivi"}</strong></div>
          <div className="wallet-list">{operators.map((operator) => {
            const balance = selectedSummary.unitMap[operator.code];
            const opening = sessionUnitRows.find((row) => row.operateur_code === operator.code);
            const variance = balance?.declare == null ? null : balance.declare - balance.theorique;
            if (!balance) return null;
            return <div className="wallet-row unit-stock-row" key={operator.code}><span className="operator-name"><span className="operator-dot" style={{ "--operator-color": operator.couleur }} />{operator.nom}</span><div><strong>{balance.suivi ? formatMoney(balance.theorique) : "—"}</strong>{balance.suivi ? (selectedSession.statut === "cloturee" ? <small className={balance.declare === balance.theorique ? "positive" : "negative"}>Compté {formatMoney(balance.declare)} · écart {formatMoney((balance.declare || 0) - balance.theorique)}</small> : <small>Ouverture {formatMoney(opening?.unites_ouverture)}</small>) : <small className="unit-stock-untracked">{selectedSession.statut === "cloturee" ? `Clôture comptée ${formatMoney(balance.declare)} · écart non calculable` : "Stock initial non suivi · clôturez puis ouvrez une nouvelle session"}</small>}</div></div>;
          })}</div>
          {selectedSession.statut === "cloturee" && selectedSummary.unitTracked && <VarianceBox declared={selectedSummary.unitDeclared} theoretical={selectedSummary.unitExpected} variance={selectedSummary.unitVariance} />}
          {selectedSession.statut === "cloturee" && selectedSummary.unitTracked && selectedSummary.unitHasDifference && selectedSummary.unitVariance === 0 && <div className="field-note"><AlertTriangle size={14} />Des écarts individuels entre opérateurs se compensent dans le total net; vérifiez les lignes ci-dessus.</div>}
        </section>
        {cashMovements.length > 0 && <section className="panel cash-movements-panel">
          <div className="panel-heading"><div><h2>Mouvements d'espèces de la session</h2><p>Dépôt banque, coffre, fonds de caisse</p></div>{selectedSession.statut === "ouverte" && selectedSession.agent_id === user.id && canWrite && <button className="button button-soft" onClick={() => onOpenModal("cash")}><Plus size={15} />Ajouter</button>}</div>
          <div className="cash-movements-list">{cashMovements.map((movement) => <div className="cash-movement-row" key={movement.id}>
            <span className={`cash-movement-icon ${movement.sens}`}>{movement.sens === "entree" ? <ArrowDownCircle size={15} /> : <ArrowUpCircle size={15} />}</span>
            <div><strong>{movement.motif || "Mouvement"}</strong><small>{CASH_MOVEMENT_SOURCES.find((source) => source.code === movement.source)?.label || movement.source} · {formatTime(movement.created_at)}</small></div>
            <b className={movement.sens === "entree" ? "positive" : "negative"}>{movement.sens === "entree" ? "+" : "−"}{formatMoney(movement.montant)}</b>
          </div>)}</div>
        </section>}

        <div className="cash-bottom-grid"><section className="panel"><div className="panel-heading"><div><h2>Comptage à la clôture</h2><p>Déclarez ce qui a été compté, pas le montant attendu.</p></div>{selectedSession.statut === "ouverte" && selectedSession.agent_id === user.id && <button className="button button-dark" onClick={() => onOpenModal("close-session")}>Clôturer <ArrowRight size={15} /></button>}</div>{selectedSession.statut === "cloturee" ? <div className="variance-summary"><VarianceBox declared={selectedSummary.cashDeclared} theoretical={selectedSummary.cashExpected} variance={selectedSummary.cashVariance} /><div className="variance-footnote"><AlertTriangle size={15} />Un écart signale une différence à examiner; il ne prouve pas, à lui seul, une erreur ou une fraude.</div></div> : <div className="open-close-hint"><div className="hint-symbol"><Check size={17} /></div><div><strong>La session est ouverte</strong><span>À la fermeture, comptez les espèces, consultez les soldes opérateur et comptez séparément le stock d'unités par opérateur.</span></div></div>}</section>
          <section className="panel expense-panel"><div className="panel-heading"><div><h2>Dépenses de la session</h2><p>Espèces et retraits sur wallet sont rapprochés séparément.</p></div>{selectedSession.statut === "ouverte" && selectedSession.agent_id === user.id && canWrite && <button className="icon-link" onClick={() => onOpenModal("expense")}><Plus size={15} />Ajouter</button>}</div>{sessionExpenses.length ? <div className="expense-list">{sessionExpenses.map((expense) => <div className="expense-row" key={expense.id}><span className="expense-icon"><TrendingDown size={15} /></span><div><strong>{expense.categorie}</strong><small>{expense.mode_paiement === "especes" ? "Espèces" : operators.find((operator) => operator.code === expense.operateur_code)?.nom} · {formatTime(expense.created_at)}</small></div><b>-{formatMoney(expense.montant)}</b></div>)}</div> : <div className="empty-inline">Aucune dépense déclarée.</div>}</section></div>
      </> : <div className="panel empty-state"><Wallet size={26} /><strong>Aucune session à afficher pour cette date.</strong><span>Une session commence avec un point, une caisse physique, les soldes électroniques et le stock initial d'unités par opérateur.</span>{!isHistorical && canWrite && <button className="button button-dark" onClick={onOpenOwnSession}><Plus size={15} />Démarrer une session</button>}</div>}
      <div className="ledger-footnote"><ShieldCheck size={17} /><span>Les commissions ne sont pas ajoutées automatiquement aux soldes de caisse : leur mode et délai d'encaissement varient. Elles sont suivies à part.</span></div>
    </main>
  );
}

function TeamPage({ agency, user, profiles, points, sessions, summaries, performances = [], canManage, canWrite, onOpenModal, onCopyCode }) {
  const openByAgent = new Map(sessions.filter((session) => session.statut === "ouverte").map((session) => [session.agent_id, session]));
  const activeProfileCount = profiles.filter((profile) => profile.actif).length;
  return (
    <main className="content-area">
      <PageHeading eyebrow="ORGANISATION" title="Équipe & points" description="Un profil agent par personne; chaque opération est rattachée à sa session." actions={canManage && canWrite && <button className="button button-dark" onClick={() => onOpenModal("point")}><Plus size={16} />Ajouter un point</button>} />
      {canManage && canWrite && <section className="invite-card"><div className="invite-icon"><Users size={19} /></div><div className="invite-copy"><span>INVITER UN GÉRANT</span><h2>Partagez le code de votre agence.</h2><p>Le gérant crée son accès avec son propre email et choisit « Rejoindre une équipe ». Ne partagez jamais votre mot de passe.</p></div><div className="invite-code"><small>CODE D'INVITATION</small><strong>{agency.code_invitation || "—"}</strong><button className="button button-paper" onClick={onCopyCode}><Copy size={15} />Copier</button></div></section>}
      <div className="team-columns"><section className="panel team-panel"><div className="panel-heading"><div><h2>Membres de l'équipe</h2><p>{activeProfileCount} profil{activeProfileCount > 1 ? "s" : ""} actif{activeProfileCount > 1 ? "s" : ""}{profiles.length > activeProfileCount ? ` · ${profiles.length - activeProfileCount} désactivé${profiles.length - activeProfileCount > 1 ? "s" : ""}` : ""}</p></div><Users size={19} className="panel-heading-icon" /></div>{profiles.length ? <div className="team-list">{profiles.map((profile) => { const session = openByAgent.get(profile.id); const point = session && points.find((item) => item.id === session.point_id); return <div className="team-member" key={profile.id}><div className="avatar small-avatar">{getInitials(profile)}</div><div className="team-member-name"><strong>{profile.prenom} {profile.nom}</strong><span>{profile.role === "proprietaire" ? "Propriétaire" : profile.role === "gerant" ? "Gérant" : "Agent"}{profile.telephone ? ` · ${profile.telephone}` : ""}{!profile.actif ? " · Accès désactivé" : ""}</span></div><div className={`member-session ${session ? "online" : "offline"}`}><span />{session ? `${profile.actif ? "En session" : "Session ouverte · accès désactivé"} · ${point?.nom || "Point"}` : profile.actif ? "Pas de session ouverte" : "Accès désactivé"}</div></div>; })}</div> : <div className="empty-inline">Aucun profil visible pour votre compte.</div>}</section>
        <section className="panel points-panel"><div className="panel-heading"><div><h2>Points de vente</h2><p>{points.length} point{points.length > 1 ? "s" : ""} configuré{points.length > 1 ? "s" : ""}</p></div><Building2 size={19} className="panel-heading-icon" /></div>{points.length ? <div className="points-list">{points.map((point) => { const opened = sessions.filter((session) => session.point_id === point.id && session.statut === "ouverte").length; const pointSessions = summaries.filter(({ session }) => session.point_id === point.id); const balance = pointSessions.reduce((sum, { session, totals }) => sum + (session.statut === "ouverte" ? totals.floatExpected : Number(totals.floatDeclared || 0)), 0); return <div className="point-row" key={point.id}><div className="point-icon"><Store size={16} /></div><div className="point-meta"><strong>{point.nom}</strong><span><MapPin size={12} />{point.ville || agency.ville}</span></div><div className="point-live"><strong>{formatMoney(balance)}</strong><span>{opened ? `${opened} session${opened > 1 ? "s" : ""} en cours` : "Aucune session active"}</span></div></div>; })}</div> : <div className="empty-inline">Créez votre premier point pour ouvrir une session de caisse.</div>}{canManage && canWrite && <button className="add-point-row" onClick={() => onOpenModal("point")}><Plus size={15} />Ajouter un point de vente</button>}</section></div>
      <section className="panel performance-panel">
        <div className="panel-heading"><div><h2>Performance de l'équipe</h2><p>Période affichée · classement par volume d'opérations</p></div><Activity size={19} className="panel-heading-icon" /></div>
        {performances.length ? <div className="table-scroll"><table className="data-table">
          <thead><tr><th>Agent</th><th>Rôle</th><th>Opérations</th><th>Volume</th><th>Ticket moyen</th><th>Commissions</th><th>Unités vendues</th><th>Session</th></tr></thead>
          <tbody>{performances.map((row) => <tr key={row.profile.id}>
            <td><strong>{row.profile.prenom} {row.profile.nom}</strong></td>
            <td>{row.profile.role}</td>
            <td>{row.operations}</td>
            <td className="amount-cell">{formatMoney(row.volume)}</td>
            <td>{formatMoney(row.averageTicket)}</td>
            <td>{formatMoney(row.commissions)}</td>
            <td>{formatMoney(row.unitsSold)}</td>
            <td>{row.openSession ? <span className="unit-status">En session</span> : <span className="credit-status muted">Fermée</span>}</td>
          </tr>)}</tbody>
        </table></div> : <div className="empty-inline">Aucune activité sur la période.</div>}
      </section>
      {!canManage && <div className="ledger-footnote"><LockKeyhole size={16} /><span>Seuls le propriétaire et les gérants peuvent voir toute l'équipe et gérer les points.</span></div>}
    </main>
  );
}

function ThresholdRow({ point, canEdit, onSave }) {
  const [float, setFloat] = useState(point.seuil_alerte_float ?? "");
  const [units, setUnits] = useState(point.seuil_alerte_unites ?? "");
  const dirty = String(float ?? "") !== String(point.seuil_alerte_float ?? "") || String(units ?? "") !== String(point.seuil_alerte_unites ?? "");
  return <div className="threshold-row">
    <div className="threshold-name"><strong>{point.nom}</strong><small>{point.ville || ""}</small></div>
    <label><span>Float (F)</span><input type="number" min="0" step="1" value={float} onChange={(event) => setFloat(event.target.value)} disabled={!canEdit} /></label>
    <label><span>Unités (F)</span><input type="number" min="0" step="1" value={units} onChange={(event) => setUnits(event.target.value)} disabled={!canEdit} /></label>
    {canEdit && <button className="button button-soft" disabled={!dirty} onClick={() => onSave(point.id, {
      seuil_alerte_float: float === "" ? null : Number(float),
      seuil_alerte_unites: units === "" ? null : Number(units),
    })}>Enregistrer</button>}
  </div>;
}

function SettingsPage({ agency, user, subscription, operators, rules, onOpenModal, onResetDemo, canManage, canWrite, tariffs = [], auditLog = [], agents = new Map(), points = [], statements = [], onShareRecap, onOpenUnit, messages = [], onSaveThreshold }) {
  const planLabel = agency.plan_abonnement === "starter"
    ? "Starter · 10 000 FCFA / 30 jours"
    : agency.plan_abonnement === "pro"
      ? "Pro · 25 000 FCFA / 30 jours"
      : subscription.mode === "trial"
        ? "Essai gratuit · 14 jours"
        : subscription.mode === "legacy"
          ? "Accès historique"
          : subscription.mode === "suspended"
            ? "Suspendu"
            : "Aucun forfait enregistré";
  const endDateLabel = subscription.end
    ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Africa/Abidjan" }).format(new Date(subscription.end))
    : "—";

  return (
    <main className="content-area">
      <PageHeading
        eyebrow="CONFIGURATION"
        title="Réglages"
        description="Configurez les barèmes de votre agence et vérifiez les informations du compte."
      />
      <div className="settings-grid">
        <section className="panel settings-agency">
          <div className="panel-heading">
            <div>
              <h2>Votre espace</h2>
              <p>Informations de l'agence et du compte propriétaire.</p>
            </div>
            <Store size={19} className="panel-heading-icon" />
          </div>
          <SettingRow label="Agence" value={agency.nom || "—"} />
          <SettingRow label="Ville" value={agency.ville || "—"} />
          <SettingRow label="Devise" value="Franc CFA (XOF)" />
          <SettingRow label="Offre" value={planLabel} />
          <SettingRow label="Accès jusqu'au" value={endDateLabel} />
          <SettingRow label="Profil connecté" value={`${user.prenom || ""} ${user.nom || ""} · ${user.role || "agent"}`} />
          <SettingRow label="Code équipe" value={agency.code_invitation || "—"} />
          <div className="settings-note"><ShieldCheck size={16} />Le code d'équipe permet à un gérant de rejoindre l'agence avec son propre compte. Gardez-le dans le cercle de confiance.</div>
          {agency.statut_abonnement && <div className="settings-note"><Clock3 size={16} />Les périodes payantes sont de 30 jours, sans renouvellement automatique. La validation du paiement et l'activation du forfait restent manuelles dans cette version.</div>}
        </section>

        <section className="panel rules-panel">
          <div className="panel-heading">
            <div>
              <h2>Barèmes de commission</h2>
              <p>Les taux saisis ici sont propres à votre agence; vérifiez-les auprès de vos contrats.</p>
            </div>
            {canManage && canWrite && <button className="button button-dark" onClick={() => onOpenModal("commission")}><Plus size={15} />Ajouter un barème</button>}
          </div>
          {rules.length ? (
            <div className="table-scroll">
              <table className="data-table rules-table">
                <thead><tr><th>Opérateur</th><th>Opération</th><th>Tranche FCFA</th><th>Commission</th><th>Source</th></tr></thead>
                <tbody>{rules.map((rule) => (
                  <tr key={rule.id}>
                    <td>{operators.find((operator) => operator.code === rule.operateur_code)?.nom || rule.operateur_code}</td>
                    <td>{OPERATION_LABELS[rule.type_operation] || rule.type_operation}</td>
                    <td>{formatMoney(rule.montant_minimum)} — {rule.montant_maximum == null ? "sans plafond" : formatMoney(rule.montant_maximum)}</td>
                    <td>{formatMoney(rule.commission_fixe)} + {Number(rule.taux_points_base || 0) / 100}%</td>
                    <td>{rule.source || "Non renseignée"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state compact">
              <HandCoins size={21} />
              <strong>Aucun barème configuré.</strong>
              <span>Les commissions existantes sont saisies à la main. Aucun taux officiel n'est préchargé.</span>
              {canManage && canWrite && <button className="button button-soft" onClick={() => onOpenModal("commission")}><Plus size={15} />Configurer un barème</button>}
            </div>
          )}
          <div className="commission-caution"><AlertTriangle size={16} /><span>Un barème calcule une estimation, pas une garantie de paiement. Le montant réellement constaté reste un champ séparé.</span></div>
        </section>
      </div>
      <div className="settings-grid settings-grid-wide">
        <section className="panel">
          <div className="panel-heading">
            <div><h2>Barèmes de vente d'unités</h2><p>Prix d'achat et de vente pour 100 F de valeur faciale : la marge devient mesurable.</p></div>
            {canManage && canWrite && <button className="button button-dark" onClick={() => onOpenModal("tarif")}><Plus size={15} />Ajouter un barème</button>}
          </div>
          {tariffs.length ? <div className="table-scroll"><table className="data-table">
            <thead><tr><th>Opérateur</th><th>Valeur faciale</th><th>Prix de vente</th><th>Marge</th><th>Source</th></tr></thead>
            <tbody>{tariffs.map((tariff) => {
              const margin = Number(tariff.prix_vente) - Number(tariff.prix_valeur_faciale);
              return <tr key={tariff.id}>
                <td>{operators.find((operator) => operator.code === tariff.operateur_code)?.nom || tariff.operateur_code}</td>
                <td>{formatMoney(tariff.prix_valeur_faciale)}</td>
                <td>{formatMoney(tariff.prix_vente)}</td>
                <td className={margin < 0 ? "negative" : "positive"}>{formatMoney(margin)} ({tariff.prix_valeur_faciale ? ((margin / Number(tariff.prix_valeur_faciale)) * 100).toFixed(1) : 0} %)</td>
                <td>{tariff.source || "Non renseignée"}</td>
              </tr>;
            })}</tbody>
          </table></div> : <div className="empty-state compact"><PiggyBank size={21} /><strong>Aucun barème de vente d'unités.</strong><span>Ajoutez un barème pour que Kaisse calcule la marge et propose le prix à encaisser.</span>{canManage && canWrite && <button className="button button-soft" onClick={() => onOpenModal("tarif")}><Plus size={15} />Configurer</button>}</div>}
        </section>

        <section className="panel">
          <div className="panel-heading"><div><h2>Seuils d'alerte</h2><p>Float et stock d'unités par point de vente.</p></div><Bell size={19} className="panel-heading-icon" /></div>
          <div className="threshold-list">{points.map((point) => <ThresholdRow key={point.id} point={point} canEdit={canManage && canWrite} onSave={onSaveThreshold} />)}</div>
          <div className="settings-note"><AlertTriangle size={16} />Un seuil trop haut génère du bruit, trop bas il prévient après la rupture. Ajustez après une semaine de ventes réelles.</div>
        </section>
      </div>

      <div className="kpi-grid settings-kpis">
        <KpiCard label="Relevés de commissions" value={String(statements.length)} hint="Comparez ce que l'opérateur a versé à vos commissions constatées" icon={FileText} tone="blue" />
        <KpiCard label="Messages préparés" value={String(messages.length)} hint="Récapitulatifs et reçus à envoyer depuis WhatsApp" icon={MessageCircle} tone="teal" />
        <KpiCard label="Événements d'audit" value={String(auditLog.length)} hint="Ouvertures, annulations, ajustements et paiements" icon={LockKeyhole} tone="ink" />
        <KpiCard label="Communiquer" value="WhatsApp" hint="Aucun envoi automatique : vous choisissez le destinataire" icon={Send} tone="gold" />
      </div>

      <div className="settings-grid settings-grid-wide">
        <section className="panel">
          <div className="panel-heading"><div><h2>Récapitulatifs & reçus</h2><p>Préparez le message du soir ou un reçu client, puis envoyez-le vous-même.</p></div><MessageCircle size={19} className="panel-heading-icon" /></div>
          <div className="settings-actions">
            <button className="button button-dark" onClick={onShareRecap}><Send size={15} />Préparer le récap du soir</button>
            <button className="button button-outline" onClick={() => onOpenModal("statement")}><Download size={15} />Ajouter un relevé opérateur</button>
            {canWrite && <button className="button button-outline" onClick={() => onOpenUnit("unit-appro")}><Package size={15} />Approvisionner les unités</button>}
          </div>
          {messages.length > 0 && <div className="settings-message-list">{messages.slice(0, 3).map((message) => <div key={message.id}><strong>{message.destinataire}</strong><span>{message.contenu.slice(0, 110)}…</span></div>)}</div>}
        </section>

        <section className="panel">
          <div className="panel-heading"><div><h2>Journal d'audit</h2><p>Qui a fait quoi, et quand.</p></div><FileText size={19} className="panel-heading-icon" /></div>
          <AuditList entries={auditLog.slice(0, 12)} agents={agents} />
        </section>
      </div>

      <section className="panel integrity-panel">
        <div className="integrity-icon"><LockKeyhole size={18} /></div>
        <div>
          <h2>Journal et sécurité</h2>
          <p>Les transactions annulées restent visibles; les montants et les soldes clôturés ne sont pas supprimés. Supabase applique une séparation par agence et par rôle.</p>
        </div>
        {onResetDemo && <button className="button button-outline" onClick={onResetDemo}>Réinitialiser la démo</button>}
      </section>
    </main>
  );
}

function TransactionModal({ sessions, points, operators, rules, summaries, onClose, onSave }) {
  const [type, setType] = useState("depot");
  const [sessionId, setSessionId] = useState(sessions[0]?.id || "");
  const [operatorCode, setOperatorCode] = useState(operators[0]?.code || "orange");
  const [destinationCode, setDestinationCode] = useState(operators[1]?.code || "mtn");
  const [paymentMode, setPaymentMode] = useState("especes");
  const [paymentOperatorCode, setPaymentOperatorCode] = useState(operators[0]?.code || "orange");
  const [amount, setAmount] = useState("");
  const [settlement, setSettlement] = useState("");
  const [commissionActual, setCommissionActual] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  const [reference, setReference] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const isUnitMovement = type === "approvisionnement_unites" || type === "transfert_unites";
  const isUnitSupply = type === "approvisionnement_unites";
  const estimate = isUnitSupply ? 0 : calculateCommission({ type_operation: type, operateur_code: operatorCode, montant: amount }, rules);
  const selectedSession = sessions.find((session) => session.id === sessionId);
  const selectedSummary = summaries.find(({ session }) => session.id === sessionId)?.totals;

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      if (!sessionId) throw new Error("Vous n'avez pas de session ouverte avec ce compte.");
      const money = safeAmount(amount, isUnitMovement ? "La valeur des unités" : "Le montant");
      if (type === "transfert" && (!destinationCode || destinationCode === operatorCode)) throw new Error("Choisissez un opérateur de destination différent.");
      if (isUnitMovement && paymentMode === "wallet" && !paymentOperatorCode) throw new Error("Choisissez l'opérateur utilisé pour le règlement.");
      const realCommission = isUnitSupply ? 0 : (commissionActual.trim() === "" ? null : safeAmount(commissionActual, "La commission", true));
      const regulated = isUnitMovement && settlement.trim() !== ""
        ? safeAmount(settlement, "Le montant réellement réglé", true)
        : money;
      setLoading(true);
      await onSave({
        session_id: sessionId,
        type_operation: type,
        operateur_code: operatorCode,
        operateur_destination_code: type === "transfert" ? destinationCode : null,
        montant: money,
        montant_reglement: isUnitMovement ? regulated : money,
        beneficiaire_masque: isUnitMovement && type === "transfert_unites" ? beneficiary : null,
        ajustement_sens: null,
        commission_estimee: estimate,
        commission_reelle: realCommission,
        mode_paiement_unites: isUnitMovement ? paymentMode : null,
        operateur_paiement_code: isUnitMovement && paymentMode === "wallet" ? paymentOperatorCode : null,
        reference: reference.trim(),
        note: "",
      });
      onClose();
    } catch (saveError) {
      setError(makeErrorMessage(saveError));
    } finally {
      setLoading(false);
    }
  }

  return <ModalShell title="Nouvelle opération" subtitle="La transaction sera attachée à votre session ouverte." onClose={onClose} wide>
    {sessions.length ? <form className="modal-form" onSubmit={submit}>
      <FormField label="Session de caisse"><select value={sessionId} onChange={(event) => setSessionId(event.target.value)}>{sessions.map((session) => <option key={session.id} value={session.id}>{points.find((point) => point.id === session.point_id)?.nom || "Point"} · {formatTime(session.ouverte_le)}</option>)}</select></FormField>
      <div className="operation-type-picker">{OPERATION_TYPES_SAISIE.map((item) => <button type="button" key={item.code} className={type === item.code ? "active" : ""} onClick={() => setType(item.code)}>{item.label}</button>)}</div>
      <div className="form-row">
        <FormField label={isUnitMovement ? "Opérateur du stock" : "Opérateur"}><select value={operatorCode} onChange={(event) => setOperatorCode(event.target.value)}>{operators.map((operator) => <option key={operator.code} value={operator.code}>{operator.nom}</option>)}</select></FormField>
        {type === "transfert" && <FormField label="Opérateur destinataire"><select value={destinationCode} onChange={(event) => setDestinationCode(event.target.value)}>{operators.filter((operator) => operator.code !== operatorCode).map((operator) => <option key={operator.code} value={operator.code}>{operator.nom}</option>)}</select></FormField>}
      </div>
      {isUnitMovement && <div className="form-row">
        <FormField label={isUnitSupply ? "Approvisionnement payé depuis" : "Le client règle par"}><select value={paymentMode} onChange={(event) => setPaymentMode(event.target.value)}><option value="especes">Espèces</option><option value="wallet">Float électronique</option></select></FormField>
        {paymentMode === "wallet" && <FormField label={isUnitSupply ? "Opérateur débité" : "Opérateur crédité"}><select value={paymentOperatorCode} onChange={(event) => setPaymentOperatorCode(event.target.value)}>{operators.map((operator) => <option key={operator.code} value={operator.code}>{operator.nom}</option>)}</select></FormField>}
      </div>}
      <FormField label={isUnitMovement ? "Valeur des unités (FCFA)" : "Montant (FCFA)"} hint={isUnitMovement ? "Saisissez la valeur faciale : le même montant ajuste stock et règlement." : undefined}><input type="number" min="1" step="1" inputMode="numeric" required autoFocus value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Ex. 25 000" /></FormField>
      {isUnitMovement && <div className="form-row">
        <FormField label="Montant réellement réglé (FCFA)" hint="Vide = valeur faciale. Permet de suivre les bonus grossiste et le prix de vente."><input type="number" min="0" step="1" inputMode="numeric" value={settlement} onChange={(event) => setSettlement(event.target.value)} placeholder={String(moneyPlaceholder)} /></FormField>
        {type === "transfert_unites" && <FormField label="Bénéficiaire (facultatif)" hint="Numéro masqué à l'enregistrement."><input value={beneficiary} onChange={(event) => setBeneficiary(event.target.value)} inputMode="tel" maxLength={20} placeholder="07 00 00 00 00" /></FormField>}
      </div>}
      {!isUnitSupply && <div className="commission-entry"><div><HandCoins size={16} /><span>Commission estimée</span><strong>{formatMoney(estimate)}</strong></div><FormField label="Commission réellement constatée (facultatif)"><input type="number" min="0" step="1" inputMode="numeric" value={commissionActual} onChange={(event) => setCommissionActual(event.target.value)} placeholder="Laisser vide si inconnue" /></FormField></div>}
      {!isUnitSupply && !rules.some((rule) => rule.operateur_code === operatorCode && rule.type_operation === type) && <div className="field-note"><AlertTriangle size={14} />Aucun barème correspondant : l'estimation vaut 0. Vous pouvez la saisir dans Réglages.</div>}
      <FormField label="Référence (facultatif)" hint="Évitez de saisir le numéro ou le nom du client."><input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={80} placeholder="N° reçu ou référence courte" /></FormField>
      {selectedSession && <div className="movement-hint"><InfoLine
        type={type}
        operator={operators.find((operator) => operator.code === operatorCode)?.nom}
        destination={operators.find((operator) => operator.code === destinationCode)?.nom}
        paymentMode={paymentMode}
        paymentOperator={operators.find((operator) => operator.code === paymentOperatorCode)?.nom}
      />{type === "transfert_unites" && selectedSummary?.unitTracked && <span>Stock disponible : {formatMoney(selectedSummary.unitMap[operatorCode]?.theorique || 0)}</span>}</div>}
      {isUnitMovement && selectedSummary && !selectedSummary.unitTracked && <div className="field-note"><AlertTriangle size={14} />Stock initial non suivi sur cette ancienne session. Clôturez-la puis ouvrez une nouvelle session avant tout mouvement d'unités.</div>}
      <ModalError>{error}</ModalError><ModalActions onCancel={onClose} loading={loading} label="Enregistrer l'opération" />
    </form> : <div className="modal-empty"><Wallet size={25} /><strong>Aucune session ouverte pour votre compte.</strong><span>Ouvrez une caisse avant de saisir une opération.</span><button className="button button-dark" onClick={() => { onClose(); }}>Compris</button></div>}
  </ModalShell>;
}

function InfoLine({ type, operator, destination, paymentMode, paymentOperator }) {
  let message;
  if (type === "ajustement_unites") {
    message = "Stock corrigé sans mouvement d'espèces ni de float";
  } else if (type === "approvisionnement_unites" || type === "transfert_unites") {
    const supply = type === "approvisionnement_unites";
    const payment = paymentMode === "wallet" ? `float ${paymentOperator}` : "espèces";
    message = `${supply ? "Décaissement" : "Encaissement"} ${payment} · stock ${operator} ${supply ? "+" : "−"}`;
  } else if (type === "depot") {
    message = "Espèces + · float opérateur −";
  } else if (type === "retrait") {
    message = "Espèces − · float opérateur +";
  } else if (type === "achat_credit") {
    message = "Espèces + · float opérateur −";
  } else {
    message = `Float ${operator} − · float ${destination} +`;
  }
  return <><Activity size={14} /><span>{message}</span></>;
}

function OpenSessionModal({ points, operators, selectedDate, isHistorical, lastCounts = {}, onClose, onSave }) {
  const [pointId, setPointId] = useState(points[0]?.id || "");
  const [cash, setCash] = useState("");
  const [balances, setBalances] = useState(Object.fromEntries(operators.map((operator) => [operator.code, ""])));
  const [unitBalances, setUnitBalances] = useState(Object.fromEntries(operators.map((operator) => [operator.code, ""])));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [prefilled, setPrefilled] = useState(false);
  function changeBalance(code, value) { setBalances((current) => ({ ...current, [code]: value })); }
  function changeUnitBalance(code, value) { setUnitBalances((current) => ({ ...current, [code]: value })); }
  const lastCount = lastCounts[pointId];
  function applyLastCount() {
    if (!lastCount) return;
    setCash(String(lastCount.cash ?? ""));
    setBalances(Object.fromEntries(operators.map((operator) => [operator.code, String(lastCount.balances?.[operator.code] ?? "")])));
    setUnitBalances(Object.fromEntries(operators.map((operator) => [operator.code, String(lastCount.units?.[operator.code] ?? "")])));
    setPrefilled(true);
  }
  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      if (isHistorical) throw new Error("Une session ne peut être ouverte que pour la date du jour.");
      if (!pointId) throw new Error("Créez d'abord un point de vente.");
      const openingBalances = Object.fromEntries(operators.map((operator) => [operator.code, safeAmount(balances[operator.code], `Le solde ${operator.nom}`, true)]));
      const openingUnits = Object.fromEntries(operators.map((operator) => [operator.code, safeAmount(unitBalances[operator.code], `Le stock ${operator.nom}`, true)]));
      const cashOpening = safeAmount(cash, "Le solde espèces", true);
      setLoading(true);
      await onSave({ point_id: pointId, date_caisse: selectedDate, caisse_ouverture: cashOpening, soldes: openingBalances, unites: openingUnits });
      onClose();
    } catch (saveError) { setError(makeErrorMessage(saveError)); } finally { setLoading(false); }
  }
  return <ModalShell title="Ouvrir une session de caisse" subtitle="Saisissez les montants et stocks réellement disponibles au démarrage." onClose={onClose}>
    {points.length ? <form className="modal-form" onSubmit={submit}>
      <FormField label="Point de vente"><select value={pointId} onChange={(event) => { setPointId(event.target.value); setPrefilled(false); setCash(""); setBalances(Object.fromEntries(operators.map((operator) => [operator.code, ""]))); setUnitBalances(Object.fromEntries(operators.map((operator) => [operator.code, ""]))); }}>{points.map((point) => <option key={point.id} value={point.id}>{point.nom} · {point.ville}</option>)}</select></FormField>
      {lastCount && <div className="movement-hint"><History size={14} /><span>Dernier comptage : {formatDate(lastCount.date)}. <button type="button" className="text-button" onClick={applyLastCount}>{prefilled ? "Rechargé" : "Reprendre ces montants"}</button></span></div>}
      <FormField label="Espèces réellement comptées (FCFA)"><input required type="number" min="0" step="1" inputMode="numeric" value={cash} onChange={(event) => setCash(event.target.value)} placeholder="Ex. 250 000" /></FormField>
      <div className="modal-subheading"><Smartphone size={16} /><div><strong>Soldes électroniques d'ouverture</strong><span>Consultez chaque solde opérateur, puis saisissez-le.</span></div></div>
      <div className="balance-input-grid">{operators.map((operator) => <FormField key={operator.code} label={operator.nom}><input required type="number" min="0" step="1" inputMode="numeric" value={balances[operator.code] || ""} onChange={(event) => changeBalance(operator.code, event.target.value)} placeholder="0" /></FormField>)}</div>
      <div className="modal-subheading unit-stock-subheading"><Smartphone size={16} /><div><strong>Stock initial d'unités téléphoniques</strong><span>Valeur faciale en FCFA, distincte du float électronique.</span></div></div>
      <div className="balance-input-grid">{operators.map((operator) => <FormField key={operator.code} label={operator.nom}><input required type="number" min="0" step="1" inputMode="numeric" value={unitBalances[operator.code] || ""} onChange={(event) => changeUnitBalance(operator.code, event.target.value)} placeholder="0" /></FormField>)}</div>
      <ModalError>{error}</ModalError><ModalActions onCancel={onClose} loading={loading} label="Ouvrir la caisse" />
    </form> : <div className="modal-empty"><Store size={24} /><strong>Aucun point disponible.</strong><span>Ajoutez d'abord un point dans Équipe & points.</span><button className="button button-outline" onClick={onClose}>Fermer</button></div>}
  </ModalShell>;
}

function CloseSessionModal({ session, point, summary, operators, floats, units, onClose, onSave }) {
  const openFloatRows = floats.filter((row) => row.session_id === session.id);
  const openUnitRows = units.filter((row) => row.session_id === session.id);
  const [cash, setCash] = useState("");
  const [balances, setBalances] = useState(Object.fromEntries(operators.map((operator) => [operator.code, ""])));
  const [unitBalances, setUnitBalances] = useState(Object.fromEntries(operators.map((operator) => [operator.code, ""])));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  function changeBalance(code, value) { setBalances((current) => ({ ...current, [code]: value })); }
  function changeUnitBalance(code, value) { setUnitBalances((current) => ({ ...current, [code]: value })); }
  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      const declaredBalances = Object.fromEntries(operators.map((operator) => [operator.code, safeAmount(balances[operator.code], `Le solde ${operator.nom}`, true)]));
      const declaredUnits = Object.fromEntries(operators.map((operator) => [operator.code, safeAmount(unitBalances[operator.code], `Le stock ${operator.nom}`, true)]));
      const declaredCash = safeAmount(cash, "Le solde espèces", true);
      setLoading(true);
      await onSave({ session_id: session.id, caisse_declaree: declaredCash, soldes: declaredBalances, unites: declaredUnits });
      onClose();
    } catch (saveError) { setError(makeErrorMessage(saveError)); } finally { setLoading(false); }
  }
  return <ModalShell title="Clôturer la session" subtitle={`${point?.nom || "Point"} · comptez espèces, portefeuilles et unités.`} onClose={onClose} wide>
    <form className="modal-form" onSubmit={submit}>
      <div className="closing-reference"><span>Théorique espèces</span><strong>{formatMoney(summary.cashExpected)}</strong><span>Théorique float total</span><strong>{formatMoney(summary.floatExpected)}</strong><span>Stock unités théorique</span><strong>{summary.unitTracked ? formatMoney(summary.unitExpected) : "Non suivi"}</strong></div>
      <FormField label="Espèces réellement comptées (FCFA)"><input required autoFocus type="number" min="0" step="1" inputMode="numeric" value={cash} onChange={(event) => setCash(event.target.value)} placeholder="Montant compté" /></FormField>
      <div className="modal-subheading"><Smartphone size={16} /><div><strong>Soldes réellement affichés par opérateur</strong><span>Ne copiez pas les soldes théoriques : consultez les téléphones / comptes opérateur.</span></div></div>
      <div className="balance-input-grid">{operators.map((operator) => { const opening = openFloatRows.find((row) => row.operateur_code === operator.code); const expected = summary.floatMap[operator.code]?.theorique || 0; return <FormField key={operator.code} label={operator.nom} hint={`Théorique : ${formatMoney(expected)} · ouverture ${formatMoney(opening?.solde_ouverture)}`}><input required type="number" min="0" step="1" inputMode="numeric" value={balances[operator.code] || ""} onChange={(event) => changeBalance(operator.code, event.target.value)} placeholder="Montant réellement déclaré" /></FormField>; })}</div>
      <div className="modal-subheading unit-stock-subheading"><Smartphone size={16} /><div><strong>Stock d'unités réellement compté</strong><span>Déclarez la valeur faciale par opérateur ; l'écart sera calculé.</span></div></div>
      <div className="balance-input-grid">{operators.map((operator) => {
        const opening = openUnitRows.find((row) => row.operateur_code === operator.code);
        const expected = summary.unitMap[operator.code]?.theorique || 0;
        const tracked = Boolean(opening && !opening.stock_initial_non_saisi);
        const hint = tracked
          ? `Théorique : ${formatMoney(expected)} · ouverture ${formatMoney(opening.unites_ouverture)}`
          : "Stock initial non suivi sur cette ancienne session; l'écart d'unités ne sera pas calculable.";
        return <FormField key={operator.code} label={operator.nom} hint={hint}><input required type="number" min="0" step="1" inputMode="numeric" value={unitBalances[operator.code] || ""} onChange={(event) => changeUnitBalance(operator.code, event.target.value)} placeholder="Valeur réellement comptée" /></FormField>;
      })}</div>
      <div className="closing-warning"><AlertTriangle size={15} /><span>Après clôture, aucune nouvelle opération ne pourra être ajoutée à cette session. Les écarts espèces, float et unités seront calculés automatiquement.</span></div>
      <ModalError>{error}</ModalError><ModalActions onCancel={onClose} loading={loading} label="Enregistrer la clôture" />
    </form>
  </ModalShell>;
}

function ExpenseModal({ sessions, points, operators, onClose, onSave }) {
  const [sessionId, setSessionId] = useState(sessions[0]?.id || "");
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [paymentMode, setPaymentMode] = useState("especes");
  const [operatorCode, setOperatorCode] = useState(operators[0]?.code || "orange");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      if (!sessionId) throw new Error("Aucune session de caisse ouverte.");
      const money = safeAmount(amount, "Le montant");
      setLoading(true);
      await onSave({ session_id: sessionId, categorie: category, montant: money, mode_paiement: paymentMode, operateur_code: paymentMode === "wallet" ? operatorCode : null, note: note.trim() });
      onClose();
    } catch (saveError) { setError(makeErrorMessage(saveError)); } finally { setLoading(false); }
  }
  return <ModalShell title="Ajouter une dépense" subtitle="Choisissez le moyen réellement utilisé pour ajuster la bonne caisse." onClose={onClose}><form className="modal-form" onSubmit={submit}>{sessions.length ? <><FormField label="Session"><select value={sessionId} onChange={(event) => setSessionId(event.target.value)}>{sessions.map((session) => <option key={session.id} value={session.id}>{points.find((point) => point.id === session.point_id)?.nom || "Point"} · {formatTime(session.ouverte_le)}</option>)}</select></FormField><FormField label="Catégorie"><select value={category} onChange={(event) => setCategory(event.target.value)}>{EXPENSE_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></FormField><FormField label="Payée depuis"><select value={paymentMode} onChange={(event) => setPaymentMode(event.target.value)}><option value="especes">Caisse espèces</option><option value="wallet">Float électronique</option></select></FormField>{paymentMode === "wallet" && <FormField label="Opérateur"><select value={operatorCode} onChange={(event) => setOperatorCode(event.target.value)}>{operators.map((operator) => <option key={operator.code} value={operator.code}>{operator.nom}</option>)}</select></FormField>}<FormField label="Montant (FCFA)"><input required autoFocus type="number" min="1" step="1" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Ex. 2 500" /></FormField><FormField label="Note (facultative)"><input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="Objet de la dépense" /></FormField><ModalError>{error}</ModalError><ModalActions onCancel={onClose} loading={loading} label="Enregistrer la dépense" /></> : <div className="modal-empty"><Wallet size={24} /><strong>Aucune session ouverte.</strong><span>Ouvrez une caisse avant de saisir une dépense.</span><button type="button" className="button button-outline" onClick={onClose}>Fermer</button></div>}</form></ModalShell>;
}

function PointModal({ agency, onClose, onSave }) {
  const [name, setName] = useState("");
  const [city, setCity] = useState(agency.ville || "Daloa");
  const [threshold, setThreshold] = useState("100000");
  const [unitThreshold, setUnitThreshold] = useState("25000");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      if (name.trim().length < 2) throw new Error("Le nom du point doit contenir au moins 2 caractères.");
      setLoading(true);
      await onSave({
        nom: name.trim(),
        ville: city.trim() || agency.ville || "Daloa",
        seuil_alerte_float: safeAmount(threshold, "Le seuil d'alerte float", true),
        seuil_alerte_unites: unitThreshold.trim() === "" ? null : safeAmount(unitThreshold, "Le seuil d'alerte unités", true),
      });
      onClose();
    } catch (saveError) { setError(makeErrorMessage(saveError)); } finally { setLoading(false); }
  }
  return <ModalShell title="Ajouter un point de vente" subtitle="Le point peut être associé aux sessions des agents de votre agence." onClose={onClose}><form className="modal-form" onSubmit={submit}><FormField label="Nom du point"><input autoFocus required value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex. Marché central" /></FormField><FormField label="Ville"><input required value={city} onChange={(event) => setCity(event.target.value)} /></FormField><FormField label="Seuil d'alerte float (FCFA)" hint="Utilisé comme repère visuel, sans connexion aux comptes opérateur."><input type="number" min="0" step="1" value={threshold} onChange={(event) => setThreshold(event.target.value)} /></FormField><FormField label="Seuil d'alerte stock d'unités (FCFA)" hint="Sous cette valeur faciale, la section Unités affiche « stock bas ». Laissez vide pour désactiver l'alerte."><input type="number" min="0" step="1" value={unitThreshold} onChange={(event) => setUnitThreshold(event.target.value)} /></FormField><ModalError>{error}</ModalError><ModalActions onCancel={onClose} loading={loading} label="Créer le point" /></form></ModalShell>;
}

function CommissionModal({ operators, onClose, onSave }) {
  const [operatorCode, setOperatorCode] = useState(operators[0]?.code || "orange");
  const [operationType, setOperationType] = useState("depot");
  const [minimum, setMinimum] = useState("0");
  const [maximum, setMaximum] = useState("");
  const [fixed, setFixed] = useState("0");
  const [basisPoints, setBasisPoints] = useState("0");
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      const minAmount = safeAmount(minimum, "Le début de tranche", true);
      const maxAmount = maximum.trim() ? safeAmount(maximum, "La fin de tranche", true) : null;
      if (maxAmount != null && maxAmount < minAmount) throw new Error("La fin de tranche doit être supérieure ou égale au début.");
      const fixedAmount = safeAmount(fixed, "La commission fixe", true);
      const rate = safeAmount(basisPoints, "Le taux en points de base", true);
      if (rate > 10_000) throw new Error("Le taux ne peut pas dépasser 10 000 points de base (100 %).");
      setLoading(true);
      await onSave({ operateur_code: operatorCode, type_operation: operationType, montant_minimum: minAmount, montant_maximum: maxAmount, commission_fixe: fixedAmount, taux_points_base: rate, source: source.trim() });
      onClose();
    } catch (saveError) { setError(makeErrorMessage(saveError)); } finally { setLoading(false); }
  }
  return <ModalShell title="Configurer un barème" subtitle="Les taux sont saisis par votre agence; aucune commission officielle n'est préchargée." onClose={onClose} wide><form className="modal-form" onSubmit={submit}><div className="form-row"><FormField label="Opérateur"><select value={operatorCode} onChange={(event) => setOperatorCode(event.target.value)}>{operators.map((operator) => <option value={operator.code} key={operator.code}>{operator.nom}</option>)}</select></FormField><FormField label="Type d'opération"><select value={operationType} onChange={(event) => setOperationType(event.target.value)}>{COMMISSION_OPERATION_TYPES.map((operation) => <option value={operation.code} key={operation.code}>{operation.label}</option>)}</select></FormField></div><div className="form-row"><FormField label="Montant minimum (FCFA)"><input required type="number" min="0" step="1" value={minimum} onChange={(event) => setMinimum(event.target.value)} /></FormField><FormField label="Montant maximum (vide = sans plafond)"><input type="number" min="0" step="1" value={maximum} onChange={(event) => setMaximum(event.target.value)} /></FormField></div><div className="form-row"><FormField label="Commission fixe (FCFA)"><input required type="number" min="0" step="1" value={fixed} onChange={(event) => setFixed(event.target.value)} /></FormField><FormField label="Taux (points de base)" hint="100 points de base = 1 %."><input required type="number" min="0" max="10000" step="1" value={basisPoints} onChange={(event) => setBasisPoints(event.target.value)} /></FormField></div><FormField label="Source / date de vérification" hint="Ex. barème agence daté du 01/10/2026."><input value={source} onChange={(event) => setSource(event.target.value)} maxLength={160} placeholder="Indiquez le document ou la personne qui a confirmé le taux" /></FormField><div className="field-note"><AlertTriangle size={14} />Les règles peuvent avoir plusieurs tranches. Vérifiez qu'elles ne se chevauchent pas; le montant réel reste à déclarer sur chaque opération.</div><ModalError>{error}</ModalError><ModalActions onCancel={onClose} loading={loading} label="Enregistrer le barème" /></form></ModalShell>;
}

export default App;

export {
  UnitsPage,
  UnitMovementModal,
  OverviewPage,
  OperationsPage,
  CashPage,
  TeamPage,
  SettingsPage,
  TransactionTable,
  TransactionModal,
  OpenSessionModal,
  CloseSessionModal,
};
