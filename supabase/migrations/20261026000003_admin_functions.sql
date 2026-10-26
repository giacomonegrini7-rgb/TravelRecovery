-- Travel Recovery — funzioni dell'area privata dei creator.
-- Ogni funzione verifica esplicitamente il ruolo (user_roles), assegnato solo lato server.
-- Un utente autenticato (anche anonimo) NON è automaticamente un creator.

create or replace function private.require_creator()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v uuid := private.require_uid();
begin
  if not exists (select 1 from public.user_roles where user_id = v) then perform private.err('forbidden'); end if;
  return v;
end $$;

create or replace function private.require_owner()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v uuid := private.require_uid();
begin
  if not exists (select 1 from public.user_roles where user_id = v and role = 'owner') then perform private.err('forbidden'); end if;
  return v;
end $$;

create or replace function private.audit(p_action text, p_target text)
returns void language sql set search_path = '' as $$
  insert into public.admin_audit (actor, action, target) values (auth.uid(), p_action, p_target);
$$;

/** Identità e ruolo del creator. Se l'email (confermata, non anonima) è tra gli inviti, assegna il ruolo creator. */
create or replace function public.admin_whoami()
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  u record;
  v_role text;
begin
  select id, email, email_confirmed_at, coalesce(is_anonymous, false) as is_anonymous
    into u from auth.users where id = v_uid;
  select role into v_role from public.user_roles where user_id = v_uid;
  if v_role is null and u.email is not null and u.email_confirmed_at is not null and not u.is_anonymous
     and exists (select 1 from public.creator_invites where email_normalized = private.normalize_email(u.email)) then
    insert into public.user_roles (user_id, role, granted_by)
    select v_uid, 'creator', invited_by from public.creator_invites where email_normalized = private.normalize_email(u.email)
    on conflict (user_id) do nothing;
    update public.creator_invites set claimed_by = v_uid, claimed_at = now()
     where email_normalized = private.normalize_email(u.email);
    v_role := 'creator';
    perform private.audit('claim_invite', v_uid::text);
  end if;
  return jsonb_build_object('user_id', v_uid, 'email', u.email, 'role', v_role);
end $$;

/** Dataset completo dei record autorizzati per i filtri lato server (date, versione, test/ricerca). */
create or replace function public.admin_dataset(
  p_from timestamptz default null, p_to timestamptz default null,
  p_include_test boolean default false, p_include_research boolean default true,
  p_version text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_role text;
begin
  perform private.require_creator();
  select role into v_role from public.user_roles where user_id = auth.uid();
  return jsonb_build_object(
    'generated_at', now(),
    'role', v_role,
    'filters', jsonb_build_object('from', p_from, 'to', p_to, 'include_test', p_include_test,
                                  'include_research', p_include_research, 'version', p_version),
    'config', (select to_jsonb(c) from public.app_config c where id = 1),
    'questionnaire_versions', (select coalesce(jsonb_agg(jsonb_build_object('version', version, 'definition', definition)), '[]') from public.questionnaire_versions),
    'demo_versions', (select coalesce(jsonb_agg(jsonb_build_object('version', version, 'definition', definition)), '[]') from public.demo_versions),
    'participations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'code', p.code, 'started_at', p.started_at, 'completed_at', p.completed_at,
        'last_activity_at', p.last_activity_at, 'questionnaire_version', p.questionnaire_version,
        'demo_version', p.demo_version, 'privacy_version', p.privacy_version, 'path', p.path,
        'current_step', p.current_step, 'status', p.status, 'is_test', p.is_test,
        'email_screen', p.email_screen, 'f1_exploration_id', p.f1_exploration_id,
        'answers', coalesce((select jsonb_agg(jsonb_build_object(
             'question_id', a.question_id, 'status', a.status, 'value_single', a.value_single,
             'value_multi', to_jsonb(a.value_multi), 'value_text', a.value_text, 'confirmed_at', a.confirmed_at))
           from public.answers a where a.participation_id = p.id), '[]'),
        'explorations', coalesce((select jsonb_agg(to_jsonb(e) - 'client_key' - 'participation_id' order by e.seq)
           from public.demo_explorations e where e.participation_id = p.id), '[]'),
        'events', coalesce((select jsonb_object_agg(ev.event_type, ev.created_at)
           from public.events ev where ev.participation_id = p.id), '{}'),
        'subscription', (select jsonb_build_object(
             'contact_id', c.id, 'email', c.email_normalized, 'contact_status', c.status,
             'verification', c.verification, 'consented_at', s.consented_at, 'consent_version', s.consent_version,
             'consent_text', s.consent_text, 'contact_status_at_request', s.contact_status_at_request)
           from public.subscription_requests s join public.contacts c on c.id = s.contact_id
           where s.participation_id = p.id)
      ) order by p.started_at desc)
      from public.participations p
      where (p_from is null or p.started_at >= p_from)
        and (p_to is null or p.started_at < p_to)
        and (p_version is null or p.questionnaire_version = p_version)
        and ((p.is_test and p_include_test) or (not p.is_test and p_include_research))
    ), '[]'));
end $$;

create or replace function public.admin_contacts()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_creator();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'email', c.email_normalized, 'status', c.status, 'verification', c.verification,
      'created_at', c.created_at, 'revoked_at', c.revoked_at, 'revoke_note', c.revoke_note,
      'requests', coalesce((select jsonb_agg(jsonb_build_object(
          'participation_id', p.id, 'code', p.code, 'is_test', p.is_test, 'path', p.path,
          'consented_at', s.consented_at, 'consent_version', s.consent_version,
          'contact_status_at_request', s.contact_status_at_request) order by s.consented_at)
        from public.subscription_requests s join public.participations p on p.id = s.participation_id
        where s.contact_id = c.id), '[]')
    ) order by c.created_at desc)
    from public.contacts c), '[]');
end $$;

create or replace function public.admin_revoke_contact(p_contact_id uuid, p_note text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_uid uuid := private.require_creator();
begin
  update public.contacts
     set status = 'revoked', revoked_at = coalesce(revoked_at, now()), revoked_by = v_uid, revoke_note = left(p_note, 500)
   where id = p_contact_id;
  if not found then perform private.err('not_found'); end if;
  perform private.audit('revoke_contact', p_contact_id::text);
  return jsonb_build_object('ok', true);
end $$;

/** Elimina un contatto (email) e i suoi collegamenti alle partecipazioni. Le risposte restano. */
create or replace function public.admin_delete_contact(p_contact_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_owner();
  delete from public.contacts where id = p_contact_id;   -- cascade sulle richieste di iscrizione
  if not found then perform private.err('not_found'); end if;
  perform private.audit('delete_contact', p_contact_id::text);
  return jsonb_build_object('ok', true);
end $$;

/** Elimina una partecipazione con risposte, esplorazioni, eventi e collegamento email.
    Il contatto viene eliminato solo se non è collegato ad altre partecipazioni. */
create or replace function public.admin_delete_participation(p_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_contact uuid;
begin
  perform private.require_owner();
  select contact_id into v_contact from public.subscription_requests where participation_id = p_id;
  delete from public.participations where id = p_id;
  if not found then perform private.err('not_found'); end if;
  if v_contact is not null and not exists (select 1 from public.subscription_requests where contact_id = v_contact) then
    delete from public.contacts where id = v_contact;
  end if;
  perform private.audit('delete_participation', p_id::text);
  return jsonb_build_object('ok', true, 'contact_deleted', v_contact is not null
    and not exists (select 1 from public.contacts where id = v_contact));
end $$;

/** Applica il periodo di conservazione: elimina le partecipazioni avviate prima della data indicata. */
create or replace function public.admin_apply_retention(p_before timestamptz)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_n int; v_c int;
begin
  perform private.require_owner();
  if p_before is null or p_before > now() then perform private.err('bad_request'); end if;
  with d as (delete from public.participations where started_at < p_before returning 1) select count(*) into v_n from d;
  with d as (delete from public.contacts c where not exists (select 1 from public.subscription_requests s where s.contact_id = c.id) returning 1)
    select count(*) into v_c from d;
  perform private.audit('apply_retention', p_before::text);
  return jsonb_build_object('ok', true, 'participations_deleted', v_n, 'orphan_contacts_deleted', v_c);
end $$;

create or replace function public.admin_update_config(p_patch jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_uid uuid := private.require_owner(); k text;
begin
  for k in select jsonb_object_keys(p_patch) loop
    if k not in ('project_name','privacy_controller','privacy_contact','privacy_legal_basis','privacy_retention','privacy_recipients','privacy_extra') then
      perform private.err('bad_request', k);
    end if;
    if length(p_patch ->> k) > 4000 then perform private.err('too_long', k); end if;
  end loop;
  update public.app_config set
    project_name        = coalesce(nullif(btrim(p_patch ->> 'project_name'), ''), project_name),
    privacy_controller  = case when p_patch ? 'privacy_controller'  then nullif(btrim(p_patch ->> 'privacy_controller'), '')  else privacy_controller end,
    privacy_contact     = case when p_patch ? 'privacy_contact'     then nullif(btrim(p_patch ->> 'privacy_contact'), '')     else privacy_contact end,
    privacy_legal_basis = case when p_patch ? 'privacy_legal_basis' then nullif(btrim(p_patch ->> 'privacy_legal_basis'), '') else privacy_legal_basis end,
    privacy_retention   = case when p_patch ? 'privacy_retention'   then nullif(btrim(p_patch ->> 'privacy_retention'), '')   else privacy_retention end,
    privacy_recipients  = case when p_patch ? 'privacy_recipients'  then nullif(btrim(p_patch ->> 'privacy_recipients'), '')  else privacy_recipients end,
    privacy_extra       = case when p_patch ? 'privacy_extra'       then nullif(btrim(p_patch ->> 'privacy_extra'), '')       else privacy_extra end,
    updated_at = now(), updated_by = v_uid
  where id = 1;
  -- in ricerca attiva i campi essenziali non possono tornare vuoti
  if (select mode from public.app_config where id = 1) = 'research'
     and exists (select 1 from public.app_config where id = 1 and (privacy_controller is null or privacy_contact is null
                 or privacy_legal_basis is null or privacy_retention is null)) then
    perform private.err('privacy_incomplete');
  end if;
  perform private.audit('update_config', null);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_set_mode(p_mode text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_uid uuid := private.require_owner(); c public.app_config;
begin
  if p_mode not in ('test', 'research') then perform private.err('bad_request'); end if;
  select * into c from public.app_config where id = 1;
  if p_mode = 'research' and (c.privacy_controller is null or c.privacy_contact is null
                              or c.privacy_legal_basis is null or c.privacy_retention is null) then
    perform private.err('privacy_incomplete');
  end if;
  update public.app_config set mode = p_mode, updated_at = now(), updated_by = v_uid where id = 1;
  perform private.audit('set_mode', p_mode);
  return jsonb_build_object('ok', true, 'mode', p_mode);
end $$;

create or replace function public.admin_list_access()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_creator();
  return jsonb_build_object(
    'roles', coalesce((select jsonb_agg(jsonb_build_object('user_id', r.user_id, 'email', u.email, 'role', r.role, 'granted_at', r.granted_at) order by r.granted_at)
                       from public.user_roles r join auth.users u on u.id = r.user_id), '[]'),
    'invites', coalesce((select jsonb_agg(jsonb_build_object('email', i.email_normalized, 'invited_at', i.invited_at, 'claimed_at', i.claimed_at) order by i.invited_at)
                         from public.creator_invites i), '[]'));
end $$;

create or replace function public.admin_invite_creator(p_email text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_uid uuid := private.require_owner(); v_email text := private.normalize_email(p_email);
begin
  if not private.valid_email(v_email) then perform private.err('invalid_email'); end if;
  insert into public.creator_invites (email_normalized, invited_by) values (v_email, v_uid)
  on conflict (email_normalized) do nothing;
  perform private.audit('invite_creator', null);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_remove_access(p_user_id uuid default null, p_email text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_uid uuid := private.require_owner(); v_email text;
begin
  if p_user_id is not null then
    if p_user_id = v_uid then perform private.err('cannot_remove_self'); end if;
    select email into v_email from auth.users where id = p_user_id;
    delete from public.user_roles where user_id = p_user_id;
    if v_email is not null then delete from public.creator_invites where email_normalized = private.normalize_email(v_email); end if;
  elsif p_email is not null then
    delete from public.creator_invites where email_normalized = private.normalize_email(p_email);
  else
    perform private.err('bad_request');
  end if;
  perform private.audit('remove_access', coalesce(p_user_id::text, 'invite'));
  return jsonb_build_object('ok', true);
end $$;

/** Assegnazione del PRIMO owner: eseguibile solo dall'SQL Editor di Supabase (ruolo postgres/service_role).
    Mai "il primo che si registra diventa admin". */
create or replace function public.bootstrap_owner(p_email text)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  select id into v_id from auth.users
   where lower(email) = private.normalize_email(p_email) and email_confirmed_at is not null
     and coalesce(is_anonymous, false) = false;
  if v_id is null then
    raise exception 'Nessun utente con email confermata %: crealo prima in Authentication → Users', p_email;
  end if;
  insert into public.user_roles (user_id, role) values (v_id, 'owner')
  on conflict (user_id) do update set role = 'owner';
  return 'Owner assegnato a ' || v_id::text;
end $$;

-- ——— Privilegi ———

revoke all on function public.admin_whoami() from public, anon, authenticated;
revoke all on function public.admin_dataset(timestamptz, timestamptz, boolean, boolean, text) from public, anon, authenticated;
revoke all on function public.admin_contacts() from public, anon, authenticated;
revoke all on function public.admin_revoke_contact(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_delete_contact(uuid) from public, anon, authenticated;
revoke all on function public.admin_delete_participation(uuid) from public, anon, authenticated;
revoke all on function public.admin_apply_retention(timestamptz) from public, anon, authenticated;
revoke all on function public.admin_update_config(jsonb) from public, anon, authenticated;
revoke all on function public.admin_set_mode(text) from public, anon, authenticated;
revoke all on function public.admin_list_access() from public, anon, authenticated;
revoke all on function public.admin_invite_creator(text) from public, anon, authenticated;
revoke all on function public.admin_remove_access(uuid, text) from public, anon, authenticated;
revoke all on function public.bootstrap_owner(text) from public, anon, authenticated;
revoke all on function private.require_creator() from public, anon, authenticated;
revoke all on function private.require_owner() from public, anon, authenticated;
revoke all on function private.audit(text, text) from public, anon, authenticated;

grant execute on function public.admin_whoami() to authenticated;
grant execute on function public.admin_dataset(timestamptz, timestamptz, boolean, boolean, text) to authenticated;
grant execute on function public.admin_contacts() to authenticated;
grant execute on function public.admin_revoke_contact(uuid, text) to authenticated;
grant execute on function public.admin_delete_contact(uuid) to authenticated;
grant execute on function public.admin_delete_participation(uuid) to authenticated;
grant execute on function public.admin_apply_retention(timestamptz) to authenticated;
grant execute on function public.admin_update_config(jsonb) to authenticated;
grant execute on function public.admin_set_mode(text) to authenticated;
grant execute on function public.admin_list_access() to authenticated;
grant execute on function public.admin_invite_creator(text) to authenticated;
grant execute on function public.admin_remove_access(uuid, text) to authenticated;
