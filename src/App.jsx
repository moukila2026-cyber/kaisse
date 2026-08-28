import React, { useState, useMemo, useEffect } from "react";
import { supabase } from "./supabaseClient";
import {
  Wallet, Smartphone, ShieldCheck, TrendingUp, ArrowRight, Check,
  LayoutDashboard, ArrowDownCircle, ArrowUpCircle, Users, Settings,
  LogOut, Bell, ChevronRight, Building2, Phone, Lock, User as UserIcon,
  AlertTriangle, Store, Mail
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar,
} from "recharts";

/* ------------------------------------------------------------------ */
/*  Design tokens                                                      */
/*  Base:   #0B1F2A  (encre nuit — confiance, sobriété)                */
/*  Paper:  #F6F3EC  (papier de reçu, léger, chaud)                    */
/*  Accent: #D6A130  (or/pièce — la valeur, l'argent compté)           */
/*  Signal: #1E7F6E  (validation, entrée d'argent)                     */
/*  Alert:  #B8452F  (sortie d'argent / alerte)                        */
/*  Display face: "Fraunces" (chiffres avec du caractère)              */
/*  Body face: "Inter"                                                 */
/*  Mono/util face: "IBM Plex Mono" (montants, tickers, reçus)         */
/* ------------------------------------------------------------------ */

const FONTS = (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
    * { box-sizing: border-box; }
    .f-display { font-family: 'Fraunces', serif; }
    .f-body { font-family: 'Inter', sans-serif; }
    .f-mono { font-family: 'IBM Plex Mono', monospace; }

    .nav-wrap { padding: 18px 5vw; }
    .hero-wrap { padding: 6vh 5vw 6vh; display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 40px; align-items: center; }
    .features-wrap { padding: 6vh 5vw; }
    .features-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
    .roles-wrap { padding: 7vh 5vw; }
    .roles-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
    .cta-wrap { padding: 7vh 5vw; }
    .footer-wrap { padding: 24px 5vw; }

    .auth-shell { min-height: 100vh; display: flex; }
    .auth-left { flex: 1; padding: 6vh 5vw; }
    .auth-right { flex: 1; padding: 6vh 5vw; display: flex; align-items: center; justify-content: center; }

    .dash-shell { min-height: 100vh; display: flex; }
    .dash-sidebar { width: 236px; flex-shrink: 0; }
    .dash-main { flex: 1; padding: 22px 28px; min-width: 0; overflow-x: hidden; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 22px; }
    .dash-grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 18px; }
    .points-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
    .tx-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
    .tx-scroll table { min-width: 560px; }
    .mobile-only { display: none; }

    @media (max-width: 980px) {
      .hero-wrap { grid-template-columns: 1fr; gap: 32px; padding-top: 5vh; }
      .features-grid { grid-template-columns: repeat(2, 1fr); }
      .roles-grid { grid-template-columns: 1fr; }
      .dash-grid { grid-template-columns: 1fr; }
      .points-grid { grid-template-columns: repeat(2, 1fr); }
      .kpi-grid { grid-template-columns: repeat(2, 1fr); }
    }

    @media (max-width: 720px) {
      .auth-shell { flex-direction: column; }
      .auth-left { padding: 5vh 6vw; }
      .auth-left h2 { margin-top: 4vh !important; font-size: 26px !important; }
      .auth-left .auth-quote { display: none; }
      .auth-right { padding: 5vh 6vw 8vh; }
    }

    @media (max-width: 680px) {
      .features-grid { grid-template-columns: 1fr; }
      .points-grid { grid-template-columns: 1fr; }
      .kpi-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
      .hero-cta { flex-direction: column; align-items: stretch !important; }
      .hero-cta button { width: 100%; justify-content: center; }
    }

    @media (max-width: 860px) {
      .dash-shell { flex-direction: column; }
      .dash-sidebar { width: 100%; border-right: none !important; border-bottom: 1px solid #E4DDC9; padding: 14px 16px !important; }
      .dash-sidebar-nav { display: flex; gap: 6px; overflow-x: auto; margin: 0 -4px; padding: 0 4px 4px; }
      .dash-sidebar-nav > div { margin-bottom: 0 !important; white-space: nowrap; }
      .dash-sidebar-footer { display: none; }
      .dash-main { padding: 18px 16px; }
      .mobile-only { display: flex; }
    }
  `}</style>
);

const OPERATORS = [
  { name: "Orange Money", color: "#FF7900" },
  { name: "MTN MoMo", color: "#FFCC08", dark: true },
  { name: "Moov Money", color: "#0072CE" },
  { name: "Wave", color: "#1DC8E0" },
];

/* ------------------------------------------------------------------ */
/*  Landing Page                                                       */
/* ------------------------------------------------------------------ */
function Landing({ onGetStarted }) {
  const [tick, setTick] = useState(true);
  React.useEffect(() => {
    const id = setInterval(() => setTick((t) => !t), 1400);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="f-body" style={{ background: "#F6F3EC", color: "#0B1F2A", minHeight: "100vh" }}>
      {FONTS}

      {/* Nav */}
      <nav className="nav-wrap" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "rgba(246,243,236,0.9)", backdropFilter: "blur(6px)", zIndex: 20, borderBottom: "1px solid #E4DDC9" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: "#0B1F2A", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Wallet size={18} color="#D6A130" />
          </div>
          <span className="f-display" style={{ fontSize: 20, fontWeight: 600 }}>Kaisse</span>
        </div>
        <button
          onClick={onGetStarted}
          style={{ background: "#0B1F2A", color: "#F6F3EC", border: "none", padding: "10px 20px", borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
        >
          Se connecter <ArrowRight size={15} />
        </button>
      </nav>

      {/* Hero */}
      <section className="hero-wrap" style={{ alignItems: "center" }}>
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#0B1F2A", color: "#D6A130", padding: "6px 14px", borderRadius: 999, fontSize: 12.5, fontWeight: 600, letterSpacing: 0.3, marginBottom: 26 }}>
            <Store size={13} /> POUR LES AGENCES MOBILE MONEY DE CÔTE D'IVOIRE
          </div>
          <h1 className="f-display" style={{ fontSize: "clamp(38px, 4.4vw, 60px)", lineHeight: 1.04, fontWeight: 600, margin: "0 0 22px" }}>
            Votre caisse, votre float,<br />
            <span style={{ color: "#B8452F" }}>zéro</span> écart en fin de journée.
          </h1>
          <p style={{ fontSize: 17.5, lineHeight: 1.6, color: "#3A4249", maxWidth: 480, marginBottom: 34 }}>
            Kaisse remplace le cahier et les messages WhatsApp par un vrai outil : suivi du float en temps réel,
            réconciliation Orange Money, MTN MoMo, Moov Money et Wave, et une vue claire pour l'agent, le gérant et le propriétaire.
          </p>
          <div className="hero-cta" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <button onClick={onGetStarted} style={{ background: "#0B1F2A", color: "#fff", border: "none", padding: "14px 26px", borderRadius: 10, fontSize: 15.5, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
              Créer mon compte <ArrowRight size={17} />
            </button>
            <button onClick={onGetStarted} style={{ background: "transparent", color: "#0B1F2A", border: "1.5px solid #0B1F2A33", padding: "14px 26px", borderRadius: 10, fontSize: 15.5, fontWeight: 600, cursor: "pointer" }}>
              Voir une démo
            </button>
          </div>
          <div style={{ display: "flex", gap: 26, marginTop: 40, flexWrap: "wrap" }}>
            {["Multi-opérateurs", "Multi-points", "Alertes float"].map((t) => (
              <div key={t} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, color: "#3A4249" }}>
                <Check size={15} color="#1E7F6E" /> {t}
              </div>
            ))}
          </div>
        </div>

        {/* Signature element: live "closing register" ticker card */}
        <div style={{ background: "#0B1F2A", borderRadius: 20, padding: 28, color: "#F6F3EC", boxShadow: "0 30px 60px -20px rgba(11,31,42,0.45)", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: -60, right: -60, width: 180, height: 180, borderRadius: "50%", background: "radial-gradient(circle, rgba(214,161,48,0.25), transparent 70%)" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 12.5, letterSpacing: 0.5, color: "#D6A130", fontWeight: 600 }}>CLÔTURE — AGENCE PLATEAU 03</span>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: tick ? "#1E7F6E" : "#155a4f", transition: "background .3s" }} />
          </div>
          <div className="f-mono" style={{ fontSize: 42, fontWeight: 600, marginBottom: 4, letterSpacing: -1 }}>
            2 340 500 <span style={{ fontSize: 20, color: "#D6A130" }}>FCFA</span>
          </div>
          <div style={{ fontSize: 12.5, color: "#9FB0B8", marginBottom: 22 }}>Float total · caisse + électronique réconciliés</div>

          {OPERATORS.map((op) => (
            <div key={op.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 0", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: op.color }} />
                <span style={{ fontSize: 13.5 }}>{op.name}</span>
              </div>
              <span className="f-mono" style={{ fontSize: 13.5, color: "#D9DEE0" }}>
                {(Math.random() * 900000 + 100000).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, " ")}
              </span>
            </div>
          ))}
          <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "#1E7F6E", fontWeight: 600 }}>
            <Check size={14} /> Aucun écart détecté
          </div>
        </div>
      </section>

      {/* Problems -> features */}
      <section className="features-wrap" style={{ background: "#0B1F2A", color: "#F6F3EC" }}>
        <h2 className="f-display" style={{ fontSize: "clamp(26px,2.6vw,36px)", fontWeight: 600, marginBottom: 36, maxWidth: 620 }}>
          Ce que le cahier et WhatsApp ne peuvent pas faire.
        </h2>
        <div className="features-grid">
          {[
            { icon: Wallet, title: "Float en temps réel", text: "Sache à tout instant ce qu'il reste en électronique et en cash, sans attendre la clôture." },
            { icon: ShieldCheck, title: "Réconciliation multi-opérateurs", text: "Orange Money, MTN MoMo, Moov Money, Wave — un seul tableau, plus de cahiers séparés." },
            { icon: TrendingUp, title: "Commissions calculées automatiquement", text: "Chaque opérateur a sa grille. Kaisse fait le calcul, tu vérifies le résultat." },
            { icon: AlertTriangle, title: "Alertes avant la rupture", text: "Une notification dès que le float ou la caisse passe sous ton seuil critique." },
            { icon: Users, title: "Vue réseau pour le propriétaire", text: "Compare tes points, repère les écarts, valide les clôtures à distance." },
            { icon: LayoutDashboard, title: "Historique anti-litige", text: "Chaque transaction est horodatée et attribuée à l'agent qui l'a saisie." },
          ].map((f) => (
            <div key={f.title} style={{ background: "rgba(246,243,236,0.04)", border: "1px solid rgba(246,243,236,0.1)", borderRadius: 14, padding: 24 }}>
              <f.icon size={22} color="#D6A130" style={{ marginBottom: 14 }} />
              <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>{f.title}</div>
              <div style={{ fontSize: 13.5, color: "#B7C0C4", lineHeight: 1.55 }}>{f.text}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Roles */}
      <section className="roles-wrap">
        <h2 className="f-display" style={{ fontSize: "clamp(26px,2.6vw,36px)", fontWeight: 600, marginBottom: 10 }}>
          Un outil, trois façons de l'utiliser.
        </h2>
        <p style={{ color: "#3A4249", marginBottom: 32, maxWidth: 560 }}>Chaque profil voit exactement ce dont il a besoin — rien de plus.</p>
        <div className="roles-grid">
          {[
            { role: "Agent", desc: "Enregistre les transactions, clôture sa caisse en deux minutes, reçoit une alerte avant la rupture.", icon: Smartphone },
            { role: "Gérant", desc: "Supervise ses points, valide les clôtures, repère les écarts par agent.", icon: Building2 },
            { role: "Propriétaire", desc: "Vue globale sur tout le réseau, commissions cumulées, export comptable.", icon: TrendingUp },
          ].map((r) => (
            <div key={r.role} style={{ border: "1px solid #E4DDC9", borderRadius: 16, padding: 26, background: "#fff" }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "#F6F3EC", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                <r.icon size={19} color="#0B1F2A" />
              </div>
              <div className="f-display" style={{ fontSize: 19, fontWeight: 600, marginBottom: 8 }}>{r.role}</div>
              <div style={{ fontSize: 13.8, color: "#3A4249", lineHeight: 1.6 }}>{r.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="cta-wrap" style={{ textAlign: "center", background: "#F0EADA" }}>
        <h2 className="f-display" style={{ fontSize: "clamp(28px,3vw,42px)", fontWeight: 600, marginBottom: 16 }}>
          Prêt à arrêter de compter deux fois ?
        </h2>
        <p style={{ color: "#3A4249", marginBottom: 30 }}>Essai gratuit de 15 jours. Aucune carte bancaire requise.</p>
        <button onClick={onGetStarted} style={{ background: "#0B1F2A", color: "#fff", border: "none", padding: "15px 32px", borderRadius: 10, fontSize: 16, fontWeight: 600, cursor: "pointer" }}>
          Créer mon compte gratuitement
        </button>
      </section>

      <footer className="footer-wrap" style={{ fontSize: 12.5, color: "#8A8368", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <span>© 2026 Kaisse — Côte d'Ivoire</span>
        <span>Fait pour les agences mobile money d'Abidjan à Daloa</span>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Auth Page                                                           */
/* ------------------------------------------------------------------ */
function Auth({ onAuth, onBack }) {
  const [mode, setMode] = useState("signup"); // signup | login
  const [form, setForm] = useState({ nom: "", prenom: "", telephone: "", agence: "", email: "", motdepasse: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setError("");
    if (!form.email || !form.motdepasse) return setError("Renseigne ton email et ton mot de passe.");
    if (mode === "signup" && (!form.nom || !form.prenom || !form.agence || !form.telephone)) {
      return setError("Complète tous les champs avant de continuer.");
    }
    setLoading(true);

    if (mode === "signup") {
      const { data, error: signUpErr } = await supabase.auth.signUp({
        email: form.email,
        password: form.motdepasse,
      });
      if (signUpErr) {
        setLoading(false);
        return setError(signUpErr.message);
      }

      const userId = data.user.id;

      const { data: agence, error: agenceErr } = await supabase
        .from("agences")
        .insert({ nom: form.agence, proprietaire_id: userId })
        .select()
        .single();

      if (agenceErr) {
        setLoading(false);
        return setError(agenceErr.message);
      }

      const { error: profilErr } = await supabase.from("profils").insert({
        id: userId,
        nom: form.nom,
        prenom: form.prenom,
        telephone: form.telephone,
        role: "proprietaire",
        agence_id: agence.id,
      });

      setLoading(false);
      if (profilErr) return setError(profilErr.message);

      if (!data.session) {
        return setError("Compte créé ! Vérifie ta boîte mail pour confirmer ton adresse avant de te connecter.");
      }
      return onAuth({ ...form, id: userId, agence_id: agence.id, role: "proprietaire" });
    }

    // Connexion
    const { data, error: loginErr } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.motdepasse,
    });
    if (loginErr) {
      setLoading(false);
      return setError(loginErr.message);
    }

    const { data: profil, error: profilErr } = await supabase
      .from("profils")
      .select("*, agences(nom)")
      .eq("id", data.user.id)
      .single();

    setLoading(false);
    if (profilErr) return setError("Profil introuvable pour ce compte.");
    onAuth({
      id: data.user.id,
      nom: profil.nom,
      prenom: profil.prenom,
      telephone: profil.telephone,
      agence: profil.agences?.nom,
      agence_id: profil.agence_id,
      role: profil.role,
    });
  };

  const inputStyle = {
    width: "100%", padding: "13px 14px 13px 42px", borderRadius: 10, border: "1.5px solid #E4DDC9",
    fontSize: 14.5, fontFamily: "'Inter', sans-serif", outline: "none", background: "#fff", boxSizing: "border-box",
  };

  const Field = ({ icon: Icon, ...props }) => (
    <div style={{ position: "relative", marginBottom: 14 }}>
      <Icon size={16} color="#8A8368" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }} />
      <input style={inputStyle} {...props} />
    </div>
  );

  return (
    <div className="f-body auth-shell" style={{ background: "#F6F3EC" }}>
      {FONTS}
      {/* Left panel */}
      <div className="auth-left" style={{ flex: 1, background: "#0B1F2A", color: "#F6F3EC", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div>
          <div onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", width: "fit-content" }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: "#F6F3EC", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Wallet size={18} color="#0B1F2A" />
            </div>
            <span className="f-display" style={{ fontSize: 20, fontWeight: 600 }}>Kaisse</span>
          </div>
          <h2 className="f-display" style={{ fontSize: "clamp(28px,3vw,40px)", fontWeight: 600, marginTop: "10vh", lineHeight: 1.15, maxWidth: 420 }}>
            La caisse de ton agence, enfin sous contrôle.
          </h2>
        </div>
        <div className="auth-quote" style={{ fontSize: 13.5, color: "#9FB0B8", maxWidth: 380, lineHeight: 1.6 }}>
          « Depuis qu'on a arrêté le cahier, on ne cherche plus les écarts pendant une heure chaque soir. »
          <div style={{ marginTop: 8, color: "#D6A130", fontWeight: 600 }}>— Gérant, réseau 6 points, Daloa</div>
        </div>
      </div>

      {/* Right panel: form */}
      <div className="auth-right" style={{ flex: 1 }}>
        <div style={{ width: "100%", maxWidth: 380 }}>
          <div style={{ display: "flex", gap: 4, background: "#EFE9DA", borderRadius: 999, padding: 4, marginBottom: 30 }}>
            {["signup", "login"].map((m) => (
              <button key={m} onClick={() => { setMode(m); setError(""); }} style={{
                flex: 1, padding: "9px 0", borderRadius: 999, border: "none", cursor: "pointer",
                fontSize: 13.5, fontWeight: 600,
                background: mode === m ? "#0B1F2A" : "transparent",
                color: mode === m ? "#F6F3EC" : "#3A4249",
                transition: "all .2s",
              }}>
                {m === "signup" ? "Créer un compte" : "Se connecter"}
              </button>
            ))}
          </div>

          <h3 className="f-display" style={{ fontSize: 24, fontWeight: 600, marginBottom: 4 }}>
            {mode === "signup" ? "Ouvre ton compte" : "Bon retour"}
          </h3>
          <p style={{ fontSize: 13.5, color: "#8A8368", marginBottom: 24 }}>
            {mode === "signup" ? "Renseigne les infos de ton agence." : "Connecte-toi à ton espace Kaisse."}
          </p>

          {mode === "signup" && (
            <>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Field icon={UserIcon} placeholder="Nom" value={form.nom} onChange={update("nom")} />
                <Field icon={UserIcon} placeholder="Prénom" value={form.prenom} onChange={update("prenom")} />
              </div>
              <Field icon={Store} placeholder="Nom de l'agence" value={form.agence} onChange={update("agence")} />
              <Field icon={Phone} placeholder="Numéro de téléphone" value={form.telephone} onChange={update("telephone")} />
            </>
          )}
          <Field icon={Mail} type="email" placeholder="Adresse email" value={form.email} onChange={update("email")} />
          <Field icon={Lock} type="password" placeholder="Mot de passe" value={form.motdepasse} onChange={update("motdepasse")} />

          {error && <div style={{ fontSize: 12.5, color: "#B8452F", marginBottom: 10 }}>{error}</div>}

          <button
            onClick={submit}
            disabled={loading}
            style={{ width: "100%", background: "#0B1F2A", color: "#fff", border: "none", padding: "14px 0", borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: loading ? "default" : "pointer", marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "Chargement…" : mode === "signup" ? "Créer mon compte" : "Se connecter"} <ArrowRight size={16} />
          </button>

          <div style={{ fontSize: 12, color: "#8A8368", textAlign: "center", marginTop: 18 }}>
            En continuant, tu acceptes les conditions d'utilisation de Kaisse.
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Dashboard (comptaCI-like, mobile money edition)                    */
/* ------------------------------------------------------------------ */
const FMT = (n) => n.toLocaleString("fr-FR").replace(/,/g, " ");

const WEEK = [
  { jour: "Lun", volume: 820 }, { jour: "Mar", volume: 940 }, { jour: "Mer", volume: 760 },
  { jour: "Jeu", volume: 1010 }, { jour: "Ven", volume: 1180 }, { jour: "Sam", volume: 1340 }, { jour: "Dim", volume: 690 },
];

function Dashboard({ user, onLogout }) {
  const [nav, setNav] = useState("apercu");
  const [points, setPoints] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [clotures, setClotures] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);

      const { data: pts } = await supabase
        .from("points")
        .select("*, profils!points_gerant_id_fkey(nom, prenom)")
        .eq("agence_id", user.agence_id);

      const today = new Date().toISOString().slice(0, 10);
      const { data: txs } = await supabase
        .from("transactions")
        .select("*, operateurs(nom), profils(nom, prenom)")
        .gte("created_at", `${today}T00:00:00`)
        .order("created_at", { ascending: false });

      const { data: clos } = await supabase
        .from("clotures")
        .select("*")
        .eq("date", today);

      if (!cancelled) {
        setPoints(pts || []);
        setTransactions(txs || []);
        setClotures(clos || []);
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [user.agence_id]);

  const float = useMemo(
    () => clotures.reduce((sum, c) => sum + Number(c.float_electronique || 0), 0),
    [clotures]
  );
  const cash = useMemo(
    () => clotures.reduce((sum, c) => sum + Number(c.caisse_physique || 0), 0),
    [clotures]
  );
  const ecart = float - cash;
  const commissions = useMemo(
    () => transactions.reduce((sum, t) => sum + Number(t.commission || 0), 0),
    [transactions]
  );

  const NavItem = ({ id, icon: Icon, label }) => (
    <div
      onClick={() => setNav(id)}
      style={{
        display: "flex", alignItems: "center", gap: 11, padding: "10px 14px", borderRadius: 10, cursor: "pointer",
        background: nav === id ? "#0B1F2A" : "transparent",
        color: nav === id ? "#F6F3EC" : "#3A4249", fontSize: 13.8, fontWeight: 500, marginBottom: 3,
      }}
    >
      <Icon size={17} /> {label}
    </div>
  );

  return (
    <div className="f-body dash-shell" style={{ background: "#F6F3EC" }}>
      {FONTS}
      {/* Sidebar */}
      <aside className="dash-sidebar" style={{ background: "#fff", borderRight: "1px solid #E4DDC9", padding: "22px 16px", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, padding: "0 4px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "#0B1F2A", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Wallet size={16} color="#D6A130" />
            </div>
            <span className="f-display" style={{ fontSize: 18, fontWeight: 600 }}>Kaisse</span>
          </div>
          <div className="mobile-only" onClick={onLogout} style={{ alignItems: "center", gap: 6, fontSize: 12.5, color: "#B8452F", cursor: "pointer" }}>
            <LogOut size={15} />
          </div>
        </div>

        <div className="dash-sidebar-nav">
          <NavItem id="apercu" icon={LayoutDashboard} label="Aperçu" />
          <NavItem id="transactions" icon={ArrowDownCircle} label="Transactions" />
          <NavItem id="points" icon={Building2} label="Points & agents" />
          <NavItem id="parametres" icon={Settings} label="Paramètres" />
        </div>

        <div className="dash-sidebar-footer" style={{ marginTop: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 10px", background: "#F6F3EC", borderRadius: 10, marginBottom: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#0B1F2A", color: "#D6A130", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, fontWeight: 700 }}>
              {(user.prenom?.[0] || "U").toUpperCase()}
            </div>
            <div style={{ overflow: "hidden" }}>
              <div style={{ fontSize: 12.8, fontWeight: 600, whiteSpace: "nowrap" }}>{user.prenom || "Utilisateur"} {user.nom || ""}</div>
              <div style={{ fontSize: 11, color: "#8A8368", whiteSpace: "nowrap" }}>{user.agence || "Mon agence"}</div>
            </div>
          </div>
          <div onClick={onLogout} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", fontSize: 13, color: "#B8452F", cursor: "pointer" }}>
            <LogOut size={15} /> Déconnexion
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="dash-main" style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22, gap: 10, flexWrap: "wrap" }}>
          <div>
            <h1 className="f-display" style={{ fontSize: 25, fontWeight: 600, margin: 0 }}>
              {nav === "apercu" && "Aperçu du jour"}
              {nav === "transactions" && "Transactions"}
              {nav === "points" && "Points & agents"}
              {nav === "parametres" && "Paramètres"}
            </h1>
            <div style={{ fontSize: 13, color: "#8A8368" }}>{user.agence || "Mon agence"} · Jeudi 27 août 2026</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Bell size={18} color="#3A4249" />
          </div>
        </div>

        {loading && (
          <div style={{ fontSize: 13, color: "#8A8368", marginBottom: 16 }}>Chargement des données…</div>
        )}

        {nav === "apercu" && (
          <>
            {/* KPI row */}
            <div className="kpi-grid">
              <KPI label="Float électronique" value={FMT(float)} unit="FCFA" icon={Smartphone} accent="#0B1F2A" />
              <KPI label="Caisse physique" value={FMT(cash)} unit="FCFA" icon={Wallet} accent="#0B1F2A" />
              <KPI label="Commissions du jour" value={FMT(commissions)} unit="FCFA" icon={TrendingUp} accent="#1E7F6E" />
              <KPI
                label="Écart de réconciliation"
                value={(ecart >= 0 ? "+" : "") + FMT(ecart)}
                unit="FCFA"
                icon={AlertTriangle}
                accent={Math.abs(ecart) > 0 ? "#B8452F" : "#1E7F6E"}
              />
            </div>

            <div className="dash-grid">
              {/* Chart */}
              <div style={{ background: "#fff", border: "1px solid #E4DDC9", borderRadius: 14, padding: 22 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Volume de transactions — 7 derniers jours</div>
                <div style={{ fontSize: 12, color: "#8A8368", marginBottom: 12 }}>En milliers de FCFA</div>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={WEEK}>
                    <defs>
                      <linearGradient id="vol" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#D6A130" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#D6A130" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EEE8D8" vertical={false} />
                    <XAxis dataKey="jour" tick={{ fontSize: 12, fill: "#8A8368" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 12, fill: "#8A8368" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E4DDC9", fontSize: 12.5 }} />
                    <Area type="monotone" dataKey="volume" stroke="#0B1F2A" strokeWidth={2} fill="url(#vol)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Répartition opérateurs */}
              <div style={{ background: "#fff", border: "1px solid #E4DDC9", borderRadius: 14, padding: 22 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Répartition par opérateur</div>
                {OPERATORS.map((op, i) => {
                  const pct = [38, 27, 20, 15][i];
                  return (
                    <div key={op.name} style={{ marginBottom: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.8, marginBottom: 5 }}>
                        <span>{op.name}</span>
                        <span style={{ fontWeight: 600 }}>{pct}%</span>
                      </div>
                      <div style={{ height: 7, background: "#F0EADA", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: op.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recent transactions preview */}
            <div style={{ background: "#fff", border: "1px solid #E4DDC9", borderRadius: 14, padding: 22, marginTop: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Dernières transactions</div>
                <div onClick={() => setNav("transactions")} style={{ fontSize: 12.5, color: "#0B1F2A", cursor: "pointer", display: "flex", alignItems: "center", gap: 3, fontWeight: 600 }}>
                  Tout voir <ChevronRight size={14} />
                </div>
              </div>
              <div className="tx-scroll"><TxTable rows={transactions.slice(0, 4)} /></div>
            </div>
          </>
        )}

        {nav === "transactions" && (
          <div style={{ background: "#fff", border: "1px solid #E4DDC9", borderRadius: 14, padding: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Historique du jour</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={btnGhost}><ArrowDownCircle size={14} style={{ marginRight: 6 }} />Dépôt</button>
                <button style={btnDark}><ArrowUpCircle size={14} style={{ marginRight: 6 }} />Retrait</button>
              </div>
            </div>
            <div className="tx-scroll"><TxTable rows={transactions} /></div>
          </div>
        )}

        {nav === "points" && (
          <div className="points-grid">
            {points.length === 0 && (
              <div style={{ fontSize: 13, color: "#8A8368" }}>Aucun point enregistré pour le moment.</div>
            )}
            {points.map((p) => {
              const cloture = clotures.find((c) => c.point_id === p.id);
              const floatPoint = cloture ? Number(cloture.float_electronique) : 0;
              const statut = floatPoint < Number(p.seuil_alerte_float || 0) ? "Faible" : "OK";
              const gerantNom = p.profils ? `${p.profils.prenom || ""} ${p.profils.nom || ""}`.trim() : "Non assigné";
              return (
                <div key={p.id} style={{ background: "#fff", border: "1px solid #E4DDC9", borderRadius: 14, padding: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: "#F6F3EC", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Building2 size={18} color="#0B1F2A" />
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "4px 9px", borderRadius: 999,
                      background: statut === "OK" ? "#E5F3EF" : "#FBEAE5",
                      color: statut === "OK" ? "#1E7F6E" : "#B8452F",
                    }}>{statut === "OK" ? "Float sain" : "Float faible"}</span>
                  </div>
                  <div className="f-display" style={{ fontSize: 17, fontWeight: 600, marginBottom: 3 }}>{p.nom}</div>
                  <div style={{ fontSize: 12.5, color: "#8A8368", marginBottom: 14 }}>Gérant : {gerantNom}</div>
                  <div className="f-mono" style={{ fontSize: 20, fontWeight: 600 }}>{FMT(floatPoint)} <span style={{ fontSize: 12, color: "#8A8368" }}>FCFA</span></div>
                </div>
              );
            })}
          </div>
        )}

        {nav === "parametres" && (
          <div style={{ background: "#fff", border: "1px solid #E4DDC9", borderRadius: 14, padding: 26, maxWidth: 480 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 18 }}>Informations du compte</div>
            {[
              ["Nom", user.nom || "—"],
              ["Prénom", user.prenom || "—"],
              ["Téléphone", user.telephone || "—"],
              ["Agence", user.agence || "—"],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid #F0EADA", fontSize: 13.8 }}>
                <span style={{ color: "#8A8368" }}>{k}</span>
                <span style={{ fontWeight: 500 }}>{v}</span>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function KPI({ label, value, unit, icon: Icon, accent }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E4DDC9", borderRadius: 14, padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: "#8A8368", fontWeight: 500 }}>{label}</span>
        <Icon size={16} color={accent} />
      </div>
      <div className="f-mono" style={{ fontSize: 20, fontWeight: 600, color: "#0B1F2A" }}>
        {value} <span style={{ fontSize: 11.5, color: "#8A8368", fontFamily: "'Inter',sans-serif" }}>{unit}</span>
      </div>
    </div>
  );
}

function TxTable({ rows }) {
  if (!rows || rows.length === 0) {
    return <div style={{ fontSize: 13, color: "#8A8368", padding: "18px 4px" }}>Aucune transaction pour le moment.</div>;
  }
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr style={{ textAlign: "left", color: "#8A8368", fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.3 }}>
          <th style={{ padding: "6px 8px", fontWeight: 600 }}>Opérateur</th>
          <th style={{ padding: "6px 8px", fontWeight: 600 }}>Type</th>
          <th style={{ padding: "6px 8px", fontWeight: 600 }}>Montant</th>
          <th style={{ padding: "6px 8px", fontWeight: 600 }}>Agent</th>
          <th style={{ padding: "6px 8px", fontWeight: 600 }}>Heure</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const opName = r.operateurs?.nom || r.op;
          const typeLabel = r.type === "depot" ? "Dépôt" : r.type === "retrait" ? "Retrait" : r.type;
          const agentName = r.profils ? `${r.profils.prenom?.[0] || ""}. ${r.profils.nom || ""}` : r.agent;
          const heure = r.created_at
            ? new Date(r.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
            : r.heure;
          const op = OPERATORS.find((o) => o.name === opName);
          return (
            <tr key={r.id} style={{ borderTop: "1px solid #F0EADA" }}>
              <td style={{ padding: "10px 8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: op?.color || "#8A8368" }} />
                  {opName}
                </div>
              </td>
              <td style={{ padding: "10px 8px" }}>
                <span style={{
                  fontSize: 11.5, fontWeight: 600, padding: "3px 9px", borderRadius: 999,
                  background: typeLabel === "Dépôt" ? "#E5F3EF" : "#FBEAE5",
                  color: typeLabel === "Dépôt" ? "#1E7F6E" : "#B8452F",
                }}>{typeLabel}</span>
              </td>
              <td className="f-mono" style={{ padding: "10px 8px", fontWeight: 600 }}>{FMT(r.montant)} F</td>
              <td style={{ padding: "10px 8px", color: "#3A4249" }}>{agentName}</td>
              <td style={{ padding: "10px 8px", color: "#8A8368" }}>{heure}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const btnGhost = { background: "#fff", border: "1px solid #E4DDC9", color: "#3A4249", padding: "8px 14px", borderRadius: 8, fontSize: 12.8, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center" };
const btnDark = { ...btnGhost, background: "#0B1F2A", color: "#fff", border: "none" };

/* ------------------------------------------------------------------ */
/*  Root                                                                */
/* ------------------------------------------------------------------ */
export default function App() {
  const [screen, setScreen] = useState("landing"); // landing | auth | dashboard
  const [user, setUser] = useState({});
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const restoreSession = async () => {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      if (session?.user) {
        const { data: profil } = await supabase
          .from("profils")
          .select("*, agences(nom)")
          .eq("id", session.user.id)
          .single();
        if (profil) {
          setUser({
            id: session.user.id,
            nom: profil.nom,
            prenom: profil.prenom,
            telephone: profil.telephone,
            agence: profil.agences?.nom,
            agence_id: profil.agence_id,
            role: profil.role,
          });
          setScreen("dashboard");
        }
      }
      setChecking(false);
    };
    restoreSession();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser({});
    setScreen("landing");
  };

  if (checking) return null;
  if (screen === "landing") return <Landing onGetStarted={() => setScreen("auth")} />;
  if (screen === "auth") return <Auth onBack={() => setScreen("landing")} onAuth={(u) => { setUser(u); setScreen("dashboard"); }} />;
  return <Dashboard user={user} onLogout={handleLogout} />;
}
