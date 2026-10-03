-- KAISSE PRO v1 — schéma initial multi-agences, journal d'opérations et RLS.
-- À exécuter dans Supabase > SQL Editor, ou avec `supabase db push`.
-- Aucune grille officielle de commission n'est préchargée : les taux doivent
-- être saisis et validés par chaque agence à partir de ses contrats/barèmes.

begin;

create table if not exists public.agences (
  id uuid primary key default gen_random_uuid(),
  nom text not null check (char_length(btrim(nom)) between 2 and 120),
  ville text not null default 'Daloa',
  code_invitation text not null unique,
  proprietaire_id uuid not null references auth.users(id) on delete restrict,
  devise text not null default 'XOF' check (devise = 'XOF'),
  created_at timestamptz not null default now()
);

create table if not exists public.profils (
  id uuid primary key references auth.users(id) on delete cascade,
  agence_id uuid not null references public.agences(id) on delete cascade,
  prenom text not null default '',
  nom text not null default '',
  telephone text not null default '',
  role text not null default 'agent' check (role in ('proprietaire', 'gerant', 'agent')),
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, agence_id)
);

create table if not exists public.operateurs (
  code text primary key,
  nom text not null,
  couleur text not null,
  ordre smallint not null unique
);

insert into public.operateurs (code, nom, couleur, ordre) values
  ('orange', 'Orange Money', '#FF7900', 1),
  ('mtn', 'MTN MoMo', '#FFCC08', 2),
  ('moov', 'Moov Money', '#0072CE', 3),
  ('wave', 'Wave', '#1DC8E0', 4)
on conflict (code) do update set nom = excluded.nom, couleur = excluded.couleur, ordre = excluded.ordre;

create table if not exists public.points (
  id uuid primary key default gen_random_uuid(),
  agence_id uuid not null references public.agences(id) on delete cascade,
  nom text not null check (char_length(btrim(nom)) between 2 and 120),
  ville text not null default 'Daloa',
  seuil_alerte_float bigint not null default 100000 check (seuil_alerte_float >= 0),
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, agence_id),
  unique (agence_id, nom)
);

create table if not exists public.sessions_caisse (
  id uuid primary key default gen_random_uuid(),
  agence_id uuid not null references public.agences(id) on delete cascade,
  point_id uuid not null,
  agent_id uuid not null,
  date_caisse date not null default ((now() at time zone 'Africa/Abidjan')::date),
  statut text not null default 'ouverte' check (statut in ('ouverte', 'cloturee')),
  caisse_ouverture bigint not null check (caisse_ouverture >= 0),
  caisse_cloture_declaree bigint check (caisse_cloture_declaree is null or caisse_cloture_declaree >= 0),
  ouverte_le timestamptz not null default now(),
  cloturee_le timestamptz,
  foreign key (point_id, agence_id) references public.points(id, agence_id) on delete restrict,
  foreign key (agent_id, agence_id) references public.profils(id, agence_id) on delete restrict,
  unique (id, agence_id),
  check (
    (statut = 'ouverte' and caisse_cloture_declaree is null and cloturee_le is null)
    or (statut = 'cloturee' and caisse_cloture_declaree is not null and cloturee_le is not null)
  )
);

create unique index if not exists sessions_caisse_une_ouverte_par_agent_point
  on public.sessions_caisse (point_id, agent_id)
  where statut = 'ouverte';
create index if not exists sessions_caisse_agence_date_idx
  on public.sessions_caisse (agence_id, date_caisse desc);

create table if not exists public.soldes_session_operateur (
  session_id uuid not null references public.sessions_caisse(id) on delete cascade,
  operateur_code text not null references public.operateurs(code) on delete restrict,
  solde_ouverture bigint not null check (solde_ouverture >= 0),
  solde_cloture_declare bigint check (solde_cloture_declare is null or solde_cloture_declare >= 0),
  primary key (session_id, operateur_code)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  agence_id uuid not null,
  point_id uuid not null,
  session_id uuid not null,
  agent_id uuid not null,
  operateur_code text not null references public.operateurs(code) on delete restrict,
  operateur_destination_code text references public.operateurs(code) on delete restrict,
  type_operation text not null check (type_operation in ('depot', 'retrait', 'transfert', 'achat_credit')),
  montant bigint not null check (montant > 0),
  commission_estimee bigint not null default 0 check (commission_estimee >= 0),
  commission_reelle bigint check (commission_reelle is null or commission_reelle >= 0),
  reference text not null default '' check (char_length(reference) <= 80),
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  annulee_le timestamptz,
  annulee_par uuid references auth.users(id) on delete set null,
  motif_annulation text,
  foreign key (point_id, agence_id) references public.points(id, agence_id) on delete restrict,
  foreign key (session_id, agence_id) references public.sessions_caisse(id, agence_id) on delete restrict,
  foreign key (agent_id, agence_id) references public.profils(id, agence_id) on delete restrict,
  check (
    (type_operation = 'transfert' and operateur_destination_code is not null and operateur_destination_code <> operateur_code)
    or (type_operation <> 'transfert' and operateur_destination_code is null)
  ),
  check (
    (annulee_le is null and annulee_par is null and motif_annulation is null)
    or (annulee_le is not null and annulee_par is not null and length(btrim(coalesce(motif_annulation, ''))) > 0)
  )
);
create index if not exists transactions_agence_created_idx on public.transactions (agence_id, created_at desc);
create index if not exists transactions_session_idx on public.transactions (session_id, created_at desc);

create table if not exists public.depenses (
  id uuid primary key default gen_random_uuid(),
  agence_id uuid not null,
  point_id uuid not null,
  session_id uuid not null,
  agent_id uuid not null,
  categorie text not null check (categorie in ('Transport', 'Restauration', 'Frais opératoires', 'Autre')),
  montant bigint not null check (montant > 0),
  mode_paiement text not null check (mode_paiement in ('especes', 'wallet')),
  operateur_code text references public.operateurs(code) on delete restrict,
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  foreign key (point_id, agence_id) references public.points(id, agence_id) on delete restrict,
  foreign key (session_id, agence_id) references public.sessions_caisse(id, agence_id) on delete restrict,
  foreign key (agent_id, agence_id) references public.profils(id, agence_id) on delete restrict,
  check (
    (mode_paiement = 'especes' and operateur_code is null)
    or (mode_paiement = 'wallet' and operateur_code is not null)
  )
);
create index if not exists depenses_session_idx on public.depenses (session_id, created_at desc);

create table if not exists public.commission_baremes (
  id uuid primary key default gen_random_uuid(),
  agence_id uuid not null references public.agences(id) on delete cascade,
  operateur_code text not null references public.operateurs(code) on delete restrict,
  type_operation text not null check (type_operation in ('depot', 'retrait', 'transfert', 'achat_credit')),
  montant_minimum bigint not null default 0 check (montant_minimum >= 0),
  montant_maximum bigint check (montant_maximum is null or montant_maximum >= montant_minimum),
  commission_fixe bigint not null default 0 check (commission_fixe >= 0),
  taux_points_base integer not null default 0 check (taux_points_base between 0 and 10000),
  source text not null default '' check (char_length(source) <= 160),
  actif boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists commission_baremes_agence_idx on public.commission_baremes (agence_id, operateur_code, type_operation, montant_minimum);

-- Fonctions d'autorisation SECURITY DEFINER : évitent la récursion des politiques RLS.
create or replace function public.agence_courante_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.agence_id
  from public.profils p
  where p.id = (select auth.uid()) and p.actif = true
  limit 1
$$;

create or replace function public.peut_gerer_agence(p_agence_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profils p
    where p.id = (select auth.uid())
      and p.agence_id = p_agence_id
      and p.actif = true
      and p.role in ('proprietaire', 'gerant')
  )
$$;

revoke all on function public.agence_courante_id() from public, anon;
revoke all on function public.peut_gerer_agence(uuid) from public, anon;
grant execute on function public.agence_courante_id() to authenticated;
grant execute on function public.peut_gerer_agence(uuid) to authenticated;

-- Création automatique du profil et de l'espace à l'inscription Auth.
create or replace function public.creer_profil_apres_inscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text := coalesce(new.raw_user_meta_data ->> 'mode_inscription', '');
  v_nom text := coalesce(new.raw_user_meta_data ->> 'nom', '');
  v_prenom text := coalesce(new.raw_user_meta_data ->> 'prenom', '');
  v_telephone text := coalesce(new.raw_user_meta_data ->> 'telephone', '');
  v_agence_id uuid;
  v_code text;
begin
  if v_mode = 'creation_agence' then
    if length(btrim(coalesce(new.raw_user_meta_data ->> 'nom_agence', ''))) < 2 then
      raise exception 'Le nom de l''agence est obligatoire.';
    end if;

    v_code := upper(translate(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8), '01', 'AB'));
    insert into public.agences (nom, ville, code_invitation, proprietaire_id)
    values (
      btrim(new.raw_user_meta_data ->> 'nom_agence'),
      coalesce(nullif(btrim(new.raw_user_meta_data ->> 'ville'), ''), 'Daloa'),
      v_code,
      new.id
    )
    returning id into v_agence_id;

    insert into public.profils (id, agence_id, prenom, nom, telephone, role)
    values (new.id, v_agence_id, v_prenom, v_nom, v_telephone, 'proprietaire');

    insert into public.points (agence_id, nom, ville)
    values (
      v_agence_id,
      coalesce(nullif(btrim(new.raw_user_meta_data ->> 'premier_point'), ''), 'Point principal'),
      coalesce(nullif(btrim(new.raw_user_meta_data ->> 'ville'), ''), 'Daloa')
    );
  elsif v_mode = 'rejoindre_equipe' then
    select a.id into v_agence_id
    from public.agences a
    where upper(a.code_invitation) = upper(btrim(coalesce(new.raw_user_meta_data ->> 'code_invitation', '')))
    limit 1;

    if v_agence_id is null then
      raise exception 'Code d''invitation invalide.';
    end if;

    insert into public.profils (id, agence_id, prenom, nom, telephone, role)
    values (new.id, v_agence_id, v_prenom, v_nom, v_telephone, 'gerant');
  else
    raise exception 'Choisissez la création d''une agence ou le rattachement à une équipe.';
  end if;

  return new;
end;
$$;

revoke all on function public.creer_profil_apres_inscription() from public, anon, authenticated;
drop trigger if exists on_auth_user_created_kaisse on auth.users;
create trigger on_auth_user_created_kaisse
after insert on auth.users
for each row execute function public.creer_profil_apres_inscription();

-- Ouverture atomique d'une session et de ses quatre soldes électroniques de départ.
create or replace function public.ouvrir_session(
  p_point_id uuid,
  p_date_caisse date,
  p_caisse_ouverture bigint,
  p_soldes jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_agence_id uuid;
  v_session_id uuid;
  v_operateur record;
  v_solde bigint;
begin
  if v_user_id is null then raise exception 'Authentification requise.'; end if;
  if p_date_caisse is null or p_date_caisse <> ((now() at time zone 'Africa/Abidjan')::date) then
    raise exception 'Une session ne peut être ouverte que pour la date du jour.';
  end if;
  if p_caisse_ouverture is null or p_caisse_ouverture < 0 then raise exception 'Solde espèces invalide.'; end if;
  if p_soldes is null or jsonb_typeof(p_soldes) <> 'object' then raise exception 'Les soldes opérateurs sont requis.'; end if;

  select p.agence_id into v_agence_id
  from public.profils p
  where p.id = v_user_id and p.actif = true;
  if v_agence_id is null then raise exception 'Profil agence actif introuvable.'; end if;

  if not exists (
    select 1 from public.points p
    where p.id = p_point_id and p.agence_id = v_agence_id and p.actif = true
  ) then raise exception 'Point de vente introuvable ou inactif.'; end if;

  if exists (
    select 1 from public.sessions_caisse s
    where s.point_id = p_point_id and s.agent_id = v_user_id and s.statut = 'ouverte'
  ) then raise exception 'Vous avez déjà une session ouverte sur ce point.'; end if;

  for v_operateur in select o.code from public.operateurs o loop
    if not (p_soldes ? v_operateur.code) then
      raise exception 'Solde d''ouverture manquant pour %.', v_operateur.code;
    end if;
    v_solde := (p_soldes ->> v_operateur.code)::bigint;
    if v_solde < 0 then raise exception 'Un solde opérateur ne peut pas être négatif.'; end if;
  end loop;

  insert into public.sessions_caisse (agence_id, point_id, agent_id, date_caisse, caisse_ouverture)
  values (v_agence_id, p_point_id, v_user_id, p_date_caisse, p_caisse_ouverture)
  returning id into v_session_id;

  for v_operateur in select o.code from public.operateurs o loop
    insert into public.soldes_session_operateur (session_id, operateur_code, solde_ouverture)
    values (v_session_id, v_operateur.code, (p_soldes ->> v_operateur.code)::bigint);
  end loop;

  return v_session_id;
end;
$$;

-- Clôture atomique : les montants déclarés restent distincts des théoriques calculés.
create or replace function public.cloturer_session(
  p_session_id uuid,
  p_caisse_declaree bigint,
  p_soldes jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.sessions_caisse%rowtype;
  v_operateur record;
  v_solde bigint;
begin
  if v_user_id is null then raise exception 'Authentification requise.'; end if;
  if p_caisse_declaree is null or p_caisse_declaree < 0 then raise exception 'Solde espèces déclaré invalide.'; end if;
  if p_soldes is null or jsonb_typeof(p_soldes) <> 'object' then raise exception 'Les soldes de clôture sont requis.'; end if;

  select * into v_session from public.sessions_caisse s where s.id = p_session_id for update;
  if not found then raise exception 'Session introuvable.'; end if;
  if v_session.statut <> 'ouverte' then raise exception 'Cette session est déjà clôturée.'; end if;
  if v_session.agent_id <> v_user_id and not public.peut_gerer_agence(v_session.agence_id) then
    raise exception 'Vous ne pouvez pas clôturer la session d''un autre agent.';
  end if;

  for v_operateur in select o.code from public.operateurs o loop
    if not (p_soldes ? v_operateur.code) then
      raise exception 'Solde déclaré manquant pour %.', v_operateur.code;
    end if;
    v_solde := (p_soldes ->> v_operateur.code)::bigint;
    if v_solde < 0 then raise exception 'Un solde opérateur ne peut pas être négatif.'; end if;
  end loop;

  update public.sessions_caisse
  set statut = 'cloturee', caisse_cloture_declaree = p_caisse_declaree, cloturee_le = now()
  where id = p_session_id;

  for v_operateur in select o.code from public.operateurs o loop
    update public.soldes_session_operateur
    set solde_cloture_declare = (p_soldes ->> v_operateur.code)::bigint
    where session_id = p_session_id and operateur_code = v_operateur.code;
  end loop;
end;
$$;

revoke all on function public.ouvrir_session(uuid, date, bigint, jsonb) from public, anon;
revoke all on function public.cloturer_session(uuid, bigint, jsonb) from public, anon;
grant execute on function public.ouvrir_session(uuid, date, bigint, jsonb) to authenticated;
grant execute on function public.cloturer_session(uuid, bigint, jsonb) to authenticated;

-- Annulation contrôlée : le journal financier n'est jamais supprimé ni réécrit.
create or replace function public.proteger_transaction_annulee()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.annulee_le is not null then
    raise exception 'Une transaction annulée ne peut plus être modifiée.';
  end if;
  if new.id is distinct from old.id
    or new.agence_id is distinct from old.agence_id
    or new.point_id is distinct from old.point_id
    or new.session_id is distinct from old.session_id
    or new.agent_id is distinct from old.agent_id
    or new.operateur_code is distinct from old.operateur_code
    or new.operateur_destination_code is distinct from old.operateur_destination_code
    or new.type_operation is distinct from old.type_operation
    or new.montant is distinct from old.montant
    or new.commission_estimee is distinct from old.commission_estimee
    or new.commission_reelle is distinct from old.commission_reelle
    or new.reference is distinct from old.reference
    or new.note is distinct from old.note then
    raise exception 'Les données d''une transaction sont immuables. Annulez-la avec un motif.';
  end if;
  if new.annulee_le is not null and old.annulee_le is null then
    new.annulee_par := (select auth.uid());
  end if;
  if new.annulee_le is null or new.annulee_par is null or length(btrim(coalesce(new.motif_annulation, ''))) = 0 then
    raise exception 'Un motif est obligatoire pour annuler une transaction.';
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_annulation_seulement on public.transactions;
create trigger transactions_annulation_seulement
before update on public.transactions
for each row execute function public.proteger_transaction_annulee();

-- Row Level Security : séparation stricte par agence; l'agent ne voit que son propre journal.
alter table public.agences enable row level security;
alter table public.profils enable row level security;
alter table public.operateurs enable row level security;
alter table public.points enable row level security;
alter table public.sessions_caisse enable row level security;
alter table public.soldes_session_operateur enable row level security;
alter table public.transactions enable row level security;
alter table public.depenses enable row level security;
alter table public.commission_baremes enable row level security;

create policy agences_lire_sa_propre_agence on public.agences
  for select to authenticated using (id = public.agence_courante_id());
create policy agences_modifier_manager on public.agences
  for update to authenticated using (public.peut_gerer_agence(id)) with check (public.peut_gerer_agence(id));

create policy profils_lire_soi_ou_manager on public.profils
  for select to authenticated using (id = (select auth.uid()) or public.peut_gerer_agence(agence_id));
create policy profils_modifier_manager on public.profils
  for update to authenticated using (public.peut_gerer_agence(agence_id)) with check (public.peut_gerer_agence(agence_id));

create policy operateurs_lire_authentifie on public.operateurs
  for select to authenticated using (true);

create policy points_lire_agence on public.points
  for select to authenticated using (agence_id = public.agence_courante_id());
create policy points_ajouter_manager on public.points
  for insert to authenticated with check (agence_id = public.agence_courante_id() and public.peut_gerer_agence(agence_id));
create policy points_modifier_manager on public.points
  for update to authenticated using (public.peut_gerer_agence(agence_id)) with check (public.peut_gerer_agence(agence_id));

create policy sessions_lire_son_equipe on public.sessions_caisse
  for select to authenticated using (
    agence_id = public.agence_courante_id()
    and (agent_id = (select auth.uid()) or public.peut_gerer_agence(agence_id))
  );

create policy soldes_lire_session_autorisee on public.soldes_session_operateur
  for select to authenticated using (
    exists (
      select 1 from public.sessions_caisse s
      where s.id = soldes_session_operateur.session_id
        and s.agence_id = public.agence_courante_id()
        and (s.agent_id = (select auth.uid()) or public.peut_gerer_agence(s.agence_id))
    )
  );

create policy transactions_lire_son_journal_ou_manager on public.transactions
  for select to authenticated using (
    agence_id = public.agence_courante_id()
    and (agent_id = (select auth.uid()) or public.peut_gerer_agence(agence_id))
  );
create policy transactions_ajouter_sa_session on public.transactions
  for insert to authenticated with check (
    agence_id = public.agence_courante_id()
    and agent_id = (select auth.uid())
    and exists (
      select 1 from public.sessions_caisse s
      where s.id = transactions.session_id
        and s.agence_id = transactions.agence_id
        and s.point_id = transactions.point_id
        and s.agent_id = (select auth.uid())
        and s.statut = 'ouverte'
    )
  );
create policy transactions_annuler_manager on public.transactions
  for update to authenticated using (
    agence_id = public.agence_courante_id() and public.peut_gerer_agence(agence_id)
  ) with check (
    agence_id = public.agence_courante_id() and public.peut_gerer_agence(agence_id)
  );

create policy depenses_lire_son_journal_ou_manager on public.depenses
  for select to authenticated using (
    agence_id = public.agence_courante_id()
    and (agent_id = (select auth.uid()) or public.peut_gerer_agence(agence_id))
  );
create policy depenses_ajouter_sa_session on public.depenses
  for insert to authenticated with check (
    agence_id = public.agence_courante_id()
    and agent_id = (select auth.uid())
    and exists (
      select 1 from public.sessions_caisse s
      where s.id = depenses.session_id
        and s.agence_id = depenses.agence_id
        and s.point_id = depenses.point_id
        and s.agent_id = (select auth.uid())
        and s.statut = 'ouverte'
    )
  );

create policy commissions_lire_agence on public.commission_baremes
  for select to authenticated using (agence_id = public.agence_courante_id());
create policy commissions_ajouter_manager on public.commission_baremes
  for insert to authenticated with check (agence_id = public.agence_courante_id() and public.peut_gerer_agence(agence_id));
create policy commissions_modifier_manager on public.commission_baremes
  for update to authenticated using (public.peut_gerer_agence(agence_id)) with check (public.peut_gerer_agence(agence_id));

-- Pas de DELETE : opérations, dépenses et clôtures constituent un journal d'audit.
grant select on public.agences to authenticated;
grant select on public.profils to authenticated;
grant select on public.operateurs to authenticated;
grant select, insert, update on public.points to authenticated;
grant select on public.sessions_caisse to authenticated;
grant select on public.soldes_session_operateur to authenticated;
grant select, insert, update on public.transactions to authenticated;
grant select, insert on public.depenses to authenticated;
grant select, insert, update on public.commission_baremes to authenticated;
revoke update on public.agences from public, anon, authenticated;
revoke update on public.profils from public, anon, authenticated;
grant update (nom, ville, code_invitation) on public.agences to authenticated;
grant update (prenom, nom, telephone, actif) on public.profils to authenticated;

grant usage, select on all sequences in schema public to authenticated;

commit;
