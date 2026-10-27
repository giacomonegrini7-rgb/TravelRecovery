-- Da eseguire UNA volta nell'SQL Editor di Supabase, PRIMA di caricare su GitHub i nuovi file del sito.
-- (È la stessa migrazione supabase/migrations/20261026000005_english.sql.)
-- Travel Recovery — versione inglese.
-- Aggiunge la lingua della compilazione, il testo inglese del consenso e aggiorna le funzioni che la usano.
-- Non modifica le risposte già raccolte: le partecipazioni esistenti risultano in italiano.

alter table public.participations
  add column if not exists language text not null default 'it' check (language in ('it', 'en'));
comment on column public.participations.language is 'Lingua in cui è stata compilata la partecipazione (it/en).';

insert into public.consent_versions (version, text)
values ('consent-v1-en', 'I would like to receive email updates about the launch of Travel Recovery. I can withdraw my consent at any time.')
on conflict (version) do nothing;

create or replace function private.state_json(p_pid uuid)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'code', p.code, 'status', p.status, 'path', p.path, 'current_step', p.current_step,
    'is_test', p.is_test, 'language', p.language, 'email_screen', p.email_screen, 'f1_exploration_id', p.f1_exploration_id,
    'questionnaire_version', p.questionnaire_version, 'demo_version', p.demo_version,
    'answers', coalesce((
      select jsonb_object_agg(a.question_id,
        case when a.value_single is not null then jsonb_build_object('kind', 'single', 'value', a.value_single)
             when a.value_multi is not null then jsonb_build_object('kind', 'multi', 'values', to_jsonb(a.value_multi))
             else jsonb_build_object('kind', 'text', 'text', a.value_text) end)
      from public.answers a where a.participation_id = p.id and a.status = 'answered'), '{}'::jsonb),
    'explorations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'seq', e.seq, 'category', e.category, 'case_id', e.case_id, 'need_id', e.need_id,
        'reference_date', e.reference_date, 'details_opened', to_jsonb(e.details_opened), 'choice', e.choice,
        'provider_clicked', e.provider_clicked) order by e.seq)
      from public.demo_explorations e where e.participation_id = p.id), '[]'::jsonb))
  from public.participations p where p.id = p_pid;
$$;

drop function if exists public.start_participation(uuid);

create or replace function public.start_participation(p_client_key uuid, p_language text default 'it')
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  c public.app_config;
  v_id uuid;
begin
  if p_client_key is null or p_language is null or p_language not in ('it', 'en') then perform private.err('bad_request'); end if;
  select id into v_id from public.participations where owner_id = v_uid and client_key = p_client_key;
  if v_id is not null then return private.state_json(v_id); end if;  -- retry / doppio clic

  -- protezione proporzionata contro invii automatizzati
  if (select count(*) from public.participations
      where owner_id = v_uid and started_at > now() - interval '1 hour') >= 10 then
    perform private.err('rate_limited');
  end if;

  select * into c from public.app_config where id = 1;
  if c.id is null then perform private.err('not_configured'); end if;

  insert into public.participations (code, owner_id, client_key, questionnaire_version, demo_version, privacy_version, is_test, language)
  values (private.new_code(), v_uid, p_client_key, c.questionnaire_version, c.demo_version, c.privacy_version, c.mode = 'test', p_language)
  on conflict (owner_id, client_key) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.participations where owner_id = v_uid and client_key = p_client_key;
  end if;
  perform private.log_event(v_id, 'started');
  return private.state_json(v_id);
end $$;

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
        'current_step', p.current_step, 'status', p.status, 'is_test', p.is_test, 'language', p.language,
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

revoke all on function public.start_participation(uuid, text) from public, anon, authenticated;
grant execute on function public.start_participation(uuid, text) to authenticated;
revoke all on function public.admin_dataset(timestamptz, timestamptz, boolean, boolean, text) from public, anon, authenticated;
grant execute on function public.admin_dataset(timestamptz, timestamptz, boolean, boolean, text) to authenticated;
revoke all on function private.state_json(uuid) from public, anon, authenticated;
