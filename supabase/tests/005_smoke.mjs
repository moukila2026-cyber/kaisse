import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Harnais de recette de la migration 005 sur un PostgreSQL embarqué (PGlite).
// Il rejoue 001 → 005 puis vérifie les règles métier, la vue, l'idempotence
// et le script de retour arrière. Voir supabase/tests/README.md.

// Racine du dépôt, calculée depuis l'emplacement de ce fichier.
const REPO = new URL("../../", import.meta.url).pathname;
const db = new PGlite();
const sql = (f) => readFileSync(join(REPO, "supabase/migrations", f), "utf8");

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
};
async function expectError(name, query, needle) {
  try {
    await db.exec(query);
    check(name, false, "aucune erreur levée");
  } catch (error) {
    const ok = error.message.includes(needle);
    check(name, ok, ok ? "" : error.message);
  }
}

await db.exec(`
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
end $$;
`);

for (const f of [
  "202610030001_kaisse_pro_v1.sql",
  "202610030002_essai_14_jours.sql",
  "202610030003_stock_unites.sql",
  "202610030004_transferts_unites.sql",
  "202611010005_modules_concurrentiels.sql",
]) {
  await db.exec(sql(f));
}

// --- Jeu de données minimal (le trigger d'inscription crée agence + profil) --
const U = "22222222-2222-2222-2222-222222222222";
await db.exec(`
insert into auth.users (id, email, raw_user_meta_data) values (
  '${U}', 'agent@test.ci',
  '{"mode_inscription":"creation_agence","nom":"Kone","prenom":"Awa","telephone":"0700000000","nom_agence":"Agence Test","ville":"Daloa","premier_point":"Centre"}'::jsonb
);
`);
const ids = (await db.query(`
  select a.id as agence_id, p.id as point_id, pr.id as profil_id
  from public.agences a
  join public.profils pr on pr.agence_id = a.id
  join public.points p on p.agence_id = a.id
  where pr.id = '${U}'
`)).rows[0];
const A = ids.agence_id;
const P = ids.point_id;
const S = "44444444-4444-4444-4444-444444444444";

await db.exec(`
select set_config('test.uid', '${U}', false);
update public.points set seuil_alerte_unites = 25000 where id = '${P}';
insert into public.sessions_caisse (id, agence_id, point_id, agent_id, caisse_ouverture) values ('${S}', '${A}', '${P}', '${U}', 100000);
insert into public.soldes_session_operateur (session_id, operateur_code, solde_ouverture) values
  ('${S}', 'orange', 50000), ('${S}', 'mtn', 50000);
insert into public.soldes_session_unites as su (session_id, operateur_code, unites_ouverture, stock_initial_non_saisi) values
  ('${S}', 'orange', 10000, false), ('${S}', 'mtn', 0, false)
on conflict (session_id, operateur_code) do update
  set unites_ouverture = excluded.unites_ouverture, stock_initial_non_saisi = false;
`);

// --- 1. Nouvelles tables acceptent une écriture -----------------------------
await db.exec(`
insert into public.mouvements_caisse (agence_id, point_id, session_id, agent_id, sens, source, montant, motif)
values ('${A}', '${P}', '${S}', '${U}', 'sortie', 'banque', 25000, 'Depot des excedents');

insert into public.mouvements_credits_client (agence_id, point_id, agent_id, client_nom, client_telephone, sens, source, montant, echeance)
values ('${A}', '${P}', '${U}', 'Fatou B.', '07 ** ** 56', 'credit', 'unites', 5000, current_date + 7);

insert into public.encaissements_marchand (agence_id, point_id, agent_id, operateur_code, mode, montant, commission)
values ('${A}', '${P}', '${U}', 'wave', 'qrcode', 12000, 120);

insert into public.releves_commissions (agence_id, operateur_code, periode_debut, periode_fin, montant_recu, source)
values ('${A}', 'orange', date_trunc('month', current_date)::date, current_date, 4200, 'SMS operateur');

insert into public.baremes_unites (agence_id, operateur_code, prix_valeur_faciale, prix_vente, source)
values ('${A}', 'orange', 100, 105, 'Bareme agence');

insert into public.messages_envoyes (agence_id, agent_id, canal, destinataire, contenu)
values ('${A}', '${U}', 'whatsapp', 'Client', 'Recap du soir prepare');

insert into public.journal_audit (agence_id, acteur_id, action, entite, detail)
values ('${A}', '${U}', 'session.ouverture', 'session', 'Ouverture de caisse');
`);
check("écriture dans les 7 nouvelles tables", true);

// --- 2. Opérations et colonnes de la 005 ------------------------------------
await db.exec(`
insert into public.transactions (agence_id, point_id, session_id, agent_id, operateur_code, type_operation, montant, montant_reglement, commission_estimee, commission_reelle, reference)
values ('${A}', '${P}', '${S}', '${U}', 'orange', 'depot', 20000, 20000, 200, 200, 'DEP-1');

insert into public.transactions (agence_id, point_id, session_id, agent_id, operateur_code, type_operation, montant, montant_reglement, commission_estimee, commission_reelle, mode_paiement_unites, reference)
values ('${A}', '${P}', '${S}', '${U}', 'orange', 'transfert_unites', 10000, 10500, 0, 500, 'especes', 'TR-1');
`);
check("transactions avec montant_reglement", true);

// --- 3. Ajustements de stock ------------------------------------------------
await db.exec(`
insert into public.transactions (agence_id, point_id, session_id, agent_id, operateur_code, type_operation, montant, ajustement_sens, commission_estimee, note)
values ('${A}', '${P}', '${S}', '${U}', 'orange', 'ajustement_unites', 1000, 'entree', 0, 'Retour de stock casse');
insert into public.transactions (agence_id, point_id, session_id, agent_id, operateur_code, type_operation, montant, ajustement_sens, commission_estimee, note)
values ('${A}', '${P}', '${S}', '${U}', 'orange', 'ajustement_unites', 500, 'sortie', 0, 'Ecart de comptage');
`);
check("ajustements entrée et sortie acceptés", true);

await expectError(
  "ajustement sans motif refusé",
  `insert into public.transactions (agence_id, point_id, session_id, agent_id, operateur_code, type_operation, montant, ajustement_sens, commission_estimee, note)
   values ('${A}', '${P}', '${S}', '${U}', 'orange', 'ajustement_unites', 500, 'entree', 0, '  ')`,
  "transactions_ajustement_check",
);

await expectError(
  "ajustement avec règlement refusé",
  `insert into public.transactions (agence_id, point_id, session_id, agent_id, operateur_code, type_operation, montant, ajustement_sens, montant_reglement, commission_estimee, note)
   values ('${A}', '${P}', '${S}', '${U}', 'orange', 'ajustement_unites', 500, 'entree', 500, 0, 'Motif valable')`,
  "transactions_ajustement_check",
);

await expectError(
  "sortie de stock supérieure au disponible refusée",
  `insert into public.transactions (agence_id, point_id, session_id, agent_id, operateur_code, type_operation, montant, ajustement_sens, commission_estimee, note)
   values ('${A}', '${P}', '${S}', '${U}', 'mtn', 'ajustement_unites', 500, 'sortie', 0, 'Tentative excessive')`,
  "Stock d'unités insuffisant",
);

await expectError(
  "type d'opération inconnu refusé",
  `insert into public.transactions (agence_id, point_id, session_id, agent_id, operateur_code, type_operation, montant)
   values ('${A}', '${P}', '${S}', '${U}', 'orange', 'n_importe_quoi', 100)`,
  "transactions_type_operation_check",
);

// --- 4. Stock recalculé avec les ajustements --------------------------------
const stock = await db.query(
  `select operateur_code, stock_disponible from public.stock_unites_session('${S}') order by operateur_code`,
);
const orange = Number(stock.rows.find((r) => r.operateur_code === "orange").stock_disponible);
check("stock unités = 10 000 + 1 000 − 10 000 − 500", orange === 500, `obtenu ${orange}`);

// --- 5. Vue de rapprochement ------------------------------------------------
const vue = await db.query(`select * from public.v_rapprochement_commissions`);
check("vue v_rapprochement_commissions interrogeable", vue.rows.length >= 1, `${vue.rows.length} ligne(s)`);
const ligne = vue.rows.find((r) => r.operateur_code === "orange");
check(
  "vue : attendu / constaté / reçu",
  ligne && Number(ligne.commission_attendue) === 200 && Number(ligne.commission_constatee) === 700 && Number(ligne.commission_recue) === 4200,
  ligne ? `attendu ${ligne.commission_attendue}, constaté ${ligne.commission_constatee}, reçu ${ligne.commission_recue}` : "aucune ligne orange",
);

// --- 6. Idempotence : relancer la 005 ---------------------------------------
await db.exec(sql("202611010005_modules_concurrentiels.sql"));
check("migration 005 rejouable (idempotente)", true);

// --- 7. Les scripts de vérification s'exécutent ------------------------------
for (const f of ["005_avant.sql", "005_apres.sql"]) {
  const text = readFileSync(join(REPO, "supabase/verifications", f), "utf8");
  try {
    await db.exec(text);
    check(`script ${f} s'exécute`, true);
  } catch (error) {
    check(`script ${f} s'exécute`, false, error.message);
  }
}

// --- 8. Le retour arrière refuse tant qu'il y a des données -----------------
try {
  await db.exec(readFileSync(join(REPO, "supabase/verifications/005_retour_arriere.sql"), "utf8"));
  check("retour arrière bloqué si données présentes", false, "il a supprimé des tables");
} catch (error) {
  check("retour arrière bloqué si données présentes", error.message.includes("Retour arrière refusé"), error.message.slice(0, 100));
  await db.exec("rollback");
}

// --- 9. Retour arrière autorisé sur tables vides ----------------------------
await db.exec(`
delete from public.journal_audit; delete from public.messages_envoyes; delete from public.baremes_unites;
delete from public.releves_commissions; delete from public.encaissements_marchand;
delete from public.mouvements_credits_client; delete from public.mouvements_caisse;
delete from public.transactions where type_operation = 'ajustement_unites';
`);
try {
  await db.exec(readFileSync(join(REPO, "supabase/verifications/005_retour_arriere.sql"), "utf8"));
  const reste = await db.query(`
    select count(*)::int as n from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('mouvements_caisse','journal_audit','v_rapprochement_commissions')`);
  check("retour arrière appliqué sur base vide", reste.rows[0].n === 0, `${reste.rows[0].n} objet restant`);
  const cols = await db.query(`
    select count(*)::int as n from information_schema.columns
    where table_schema='public' and table_name='transactions' and column_name in ('montant_reglement','ajustement_sens')`);
  check("colonnes 005 retirées après retour arrière", cols.rows[0].n === 0, `${cols.rows[0].n} colonne(s)`);
} catch (error) {
  check("retour arrière appliqué sur base vide", false, error.message.slice(0, 160));
}

const echecs = results.filter((r) => !r.ok);
console.log(`\n${results.length - echecs.length}/${results.length} contrôles réussis`);
if (echecs.length) process.exitCode = 1;
