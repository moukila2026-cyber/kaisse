-- KAISSE PRO v1.1 — essai gratuit de 14 jours, migration additive.
-- Pré-requis : le schéma KAISSE PRO v1 (202610030001) est déjà installé.
-- Cette migration n'efface aucune table/ligne et ne modifie pas les agences existantes.
-- Pour les agences déjà présentes, les nouvelles colonnes restent NULL : elles
-- conservent donc leur accès (mode historique/grandfathered) sans période d'essai.

begin;

alter table public.agences
  add column if not exists essai_debute_le timestamptz,
  add column if not exists essai_termine_le timestamptz,
  add column if not exists statut_abonnement text,
  add column if not exists plan_abonnement text,
  add column if not exists abonnement_termine_le timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.agences'::regclass
      and conname = 'agences_statut_abonnement_check'
  ) then
    alter table public.agences
      add constraint agences_statut_abonnement_check
      check (statut_abonnement is null or statut_abonnement in ('essai', 'actif', 'suspendu'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.agences'::regclass
      and conname = 'agences_plan_abonnement_check'
  ) then
    alter table public.agences
      add constraint agences_plan_abonnement_check
      check (plan_abonnement is null or plan_abonnement in ('starter', 'pro'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.agences'::regclass
      and conname = 'agences_dates_essai_check'
  ) then
    alter table public.agences
      add constraint agences_dates_essai_check
      check (
        statut_abonnement is distinct from 'essai'
        or (essai_debute_le is not null and essai_termine_le is not null and essai_termine_le > essai_debute_le)
      );
  end if;
end;
$$;

-- Les anciennes agences dont le statut reste NULL conservent leurs droits.
-- Un abonnement payé est activé manuellement sur 30 jours; une date NULL reste
-- autorisée pour préserver d'éventuelles activations historiques.
create or replace function public.agence_peut_ecrire(p_agence_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_agence_id = public.agence_courante_id()
    and exists (
      select 1
      from public.agences a
      where a.id = p_agence_id
        and (
          a.statut_abonnement is null
          or (
            a.statut_abonnement = 'actif'
            and (a.abonnement_termine_le is null or a.abonnement_termine_le > now())
          )
          or (a.statut_abonnement = 'essai' and a.essai_termine_le > now())
        )
    )
$$;
revoke all on function public.agence_peut_ecrire(uuid) from public, anon;
grant execute on function public.agence_peut_ecrire(uuid) to authenticated;

-- Les nouvelles agences commencent un essai de 14 jours à leur création.
-- L'inscription d'un gérant rejoint l'agence existante sans redémarrer son essai; Starter limite les accès gérant/agent à trois.
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
  v_plan text;
  v_statut text;
  v_essai_termine_le timestamptz;
  v_abonnement_termine_le timestamptz;
  v_now timestamptz := now();
begin
  if v_mode = 'creation_agence' then
    if length(btrim(coalesce(new.raw_user_meta_data ->> 'nom_agence', ''))) < 2 then
      raise exception 'Le nom de l''agence est obligatoire.';
    end if;

    v_code := upper(translate(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8), '01', 'AB'));
    insert into public.agences (
      nom, ville, code_invitation, proprietaire_id,
      statut_abonnement, essai_debute_le, essai_termine_le
    )
    values (
      btrim(new.raw_user_meta_data ->> 'nom_agence'),
      coalesce(nullif(btrim(new.raw_user_meta_data ->> 'ville'), ''), 'Daloa'),
      v_code,
      new.id,
      'essai',
      v_now,
      v_now + interval '14 days'
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
    select a.id, a.plan_abonnement, a.statut_abonnement, a.essai_termine_le, a.abonnement_termine_le
    into v_agence_id, v_plan, v_statut, v_essai_termine_le, v_abonnement_termine_le
    from public.agences a
    where upper(a.code_invitation) = upper(btrim(coalesce(new.raw_user_meta_data ->> 'code_invitation', '')))
    limit 1
    for update;

    if v_agence_id is null then
      raise exception 'Code d''invitation invalide.';
    end if;
    if v_statut is not null and not (
      (v_statut = 'actif' and (v_abonnement_termine_le is null or v_abonnement_termine_le > v_now))
      or (v_statut = 'essai' and v_essai_termine_le > v_now)
    ) then
      raise exception 'La période d''accès de cette agence est terminée ou suspendue.';
    end if;
    if v_plan = 'starter' and (
      select count(*) from public.profils p
      where p.agence_id = v_agence_id and p.actif = true and p.role in ('gerant', 'agent')
    ) >= 3 then
      raise exception 'Le forfait Starter est limité à 3 accès gérant/agent.';
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

-- Ouvrir une nouvelle session est une écriture payante; terminer une session
-- déjà ouverte reste autorisé après la fin de l'essai, pour ne pas bloquer la clôture.
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
  if not public.agence_peut_ecrire(v_agence_id) then
    raise exception 'La période d''accès est terminée ou l''agence est suspendue.';
  end if;

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
revoke all on function public.ouvrir_session(uuid, date, bigint, jsonb) from public, anon;
grant execute on function public.ouvrir_session(uuid, date, bigint, jsonb) to authenticated;

-- Chaque politique d'écriture est renforcée côté base (pas seulement masquée dans l'UI).
drop policy if exists agences_modifier_manager on public.agences;
create policy agences_modifier_manager on public.agences
  for update to authenticated using (
    public.peut_gerer_agence(id) and public.agence_peut_ecrire(id)
  ) with check (
    public.peut_gerer_agence(id) and public.agence_peut_ecrire(id)
  );
-- Keep business profile edits while billing columns remain operator-only.
revoke update on public.agences from public, anon, authenticated;
grant update (nom, ville, code_invitation) on public.agences to authenticated;

drop policy if exists profils_modifier_manager on public.profils;
create policy profils_modifier_manager on public.profils
  for update to authenticated using (
    public.peut_gerer_agence(agence_id) and public.agence_peut_ecrire(agence_id)
  ) with check (
    public.peut_gerer_agence(agence_id) and public.agence_peut_ecrire(agence_id)
  );
-- Role and agency ownership columns are not writable by app users.
revoke update on public.profils from public, anon, authenticated;
grant update (prenom, nom, telephone, actif) on public.profils to authenticated;

drop policy if exists points_ajouter_manager on public.points;
create policy points_ajouter_manager on public.points
  for insert to authenticated with check (
    agence_id = public.agence_courante_id()
    and public.peut_gerer_agence(agence_id)
    and public.agence_peut_ecrire(agence_id)
  );
drop policy if exists points_modifier_manager on public.points;
create policy points_modifier_manager on public.points
  for update to authenticated using (
    public.peut_gerer_agence(agence_id) and public.agence_peut_ecrire(agence_id)
  ) with check (
    public.peut_gerer_agence(agence_id) and public.agence_peut_ecrire(agence_id)
  );

drop policy if exists transactions_ajouter_sa_session on public.transactions;
create policy transactions_ajouter_sa_session on public.transactions
  for insert to authenticated with check (
    agence_id = public.agence_courante_id()
    and public.agence_peut_ecrire(agence_id)
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
drop policy if exists transactions_annuler_manager on public.transactions;
create policy transactions_annuler_manager on public.transactions
  for update to authenticated using (
    agence_id = public.agence_courante_id()
    and public.peut_gerer_agence(agence_id)
    and public.agence_peut_ecrire(agence_id)
  ) with check (
    agence_id = public.agence_courante_id()
    and public.peut_gerer_agence(agence_id)
    and public.agence_peut_ecrire(agence_id)
  );

drop policy if exists depenses_ajouter_sa_session on public.depenses;
create policy depenses_ajouter_sa_session on public.depenses
  for insert to authenticated with check (
    agence_id = public.agence_courante_id()
    and public.agence_peut_ecrire(agence_id)
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

drop policy if exists commissions_ajouter_manager on public.commission_baremes;
create policy commissions_ajouter_manager on public.commission_baremes
  for insert to authenticated with check (
    agence_id = public.agence_courante_id()
    and public.peut_gerer_agence(agence_id)
    and public.agence_peut_ecrire(agence_id)
  );
drop policy if exists commissions_modifier_manager on public.commission_baremes;
create policy commissions_modifier_manager on public.commission_baremes
  for update to authenticated using (
    public.peut_gerer_agence(agence_id) and public.agence_peut_ecrire(agence_id)
  ) with check (
    public.peut_gerer_agence(agence_id) and public.agence_peut_ecrire(agence_id)
  );

commit;

-- ACTIVER / RENOUVELER UN FORFAIT (à exécuter par un opérateur après paiement confirmé) :
-- update public.agences
-- set statut_abonnement = 'actif',
--     plan_abonnement = 'starter', -- ou 'pro'
--     abonnement_termine_le = greatest(coalesce(abonnement_termine_le, now()), now()) + interval '30 days'
-- where id = 'UUID_DE_L_AGENCE';
--
-- Les colonnes d'abonnement ne sont pas modifiables depuis le client public.
-- IMPORTANT : ciblez une agence précise; ne lancez jamais d'UPDATE global.
-- Les agences existantes avec statut NULL sont volontairement laissées intactes.
