-- Travel Recovery: setup completo del database (tutte le migrazioni in ordine), per un progetto Supabase NUOVO.
-- Incolla TUTTO questo file nell'SQL Editor di Supabase e premi Run una sola volta.

-- ===== 20261026000001_schema.sql =====
-- Travel Recovery — schema
-- Tutte le tabelle hanno RLS attiva e NESSUNA policy per anon/authenticated:
-- l'accesso avviene solo tramite funzioni SECURITY DEFINER che verificano
-- identità, ruolo e proprietà dei record (vedi migrazioni successive).

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, anon;  -- solo per risolvere le funzioni interne invocate dalle RPC

-- ——— Configurazione e versioni ———

create table public.questionnaire_versions (
  version     text primary key,
  definition  jsonb not null,
  created_at  timestamptz not null default now()
);
comment on table public.questionnaire_versions is 'Definizioni versionate di domande e opzioni (ID stabili + etichette), usate dai report storici.';

create table public.demo_versions (
  version     text primary key,
  definition  jsonb not null,
  created_at  timestamptz not null default now()
);
comment on table public.demo_versions is 'Dataset dimostrativo versionato (casi inventati, alternative, condizioni).';

create table public.consent_versions (
  version     text primary key,
  text        text not null,
  created_at  timestamptz not null default now()
);

create table public.app_config (
  id                    smallint primary key default 1 check (id = 1),
  project_name          text not null default 'Travel Recovery',
  mode                  text not null default 'test' check (mode in ('test', 'research')),
  questionnaire_version text not null references public.questionnaire_versions(version),
  demo_version          text not null references public.demo_versions(version),
  privacy_version       text not null default 'privacy-v1',
  consent_version       text not null references public.consent_versions(version),
  -- Campi dell'informativa da completare a cura del gruppo (nessun valore inventato)
  privacy_controller    text,
  privacy_contact       text,
  privacy_legal_basis   text,
  privacy_retention     text,
  privacy_recipients    text,
  privacy_extra         text,
  updated_at            timestamptz not null default now(),
  updated_by            uuid
);
comment on table public.app_config is 'Configurazione unica. mode=test: partecipazioni marcate come test. mode=research: raccolta reale (abilitabile solo dall''owner con informativa completa).';

-- ——— Ruoli dei creator ———

create table public.user_roles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  role        text not null check (role in ('owner', 'creator')),
  granted_by  uuid,
  granted_at  timestamptz not null default now()
);

create table public.creator_invites (
  email_normalized text primary key check (email_normalized = lower(btrim(email_normalized))),
  invited_by       uuid,
  invited_at       timestamptz not null default now(),
  claimed_by       uuid,
  claimed_at       timestamptz
);
comment on table public.creator_invites is 'Email autorizzate dall''owner. Un account con email confermata e presente qui ottiene il ruolo creator al primo accesso.';

-- ——— Partecipazioni ———

create table public.participations (
  id                    uuid primary key default gen_random_uuid(),
  code                  text not null unique,
  owner_id              uuid not null,           -- utente anonimo Supabase proprietario tecnico della sessione
  client_key            uuid not null,           -- chiave di idempotenza generata dal browser
  started_at            timestamptz not null default now(),
  completed_at          timestamptz,
  last_activity_at      timestamptz not null default now(),
  questionnaire_version text not null references public.questionnaire_versions(version),
  demo_version          text not null references public.demo_versions(version),
  privacy_version       text not null,
  path                  text check (path in ('experience', 'alternative', 'never_purchased')),
  current_step          text not null default 'Q1',
  status                text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  is_test               boolean not null,
  email_screen          text not null default 'not_shown' check (email_screen in ('not_shown', 'shown', 'declined', 'subscribed')),
  f1_exploration_id     uuid,
  unique (owner_id, client_key),
  check ((status = 'completed') = (completed_at is not null))
);
create index participations_started_idx on public.participations (started_at);
create index participations_owner_idx on public.participations (owner_id);
comment on table public.participations is 'Una riga = una compilazione (non necessariamente una persona unica).';

create table public.answers (
  participation_id uuid not null references public.participations(id) on delete cascade,
  question_id      text not null,
  status           text not null check (status in ('answered', 'not_applicable')),
  value_single     text,
  value_multi      text[],
  value_text       text,
  confirmed_at     timestamptz not null default now(),
  primary key (participation_id, question_id),
  check (status = 'answered' or (value_single is null and value_multi is null and value_text is null))
);
comment on table public.answers is 'Risposte confermate. Riga assente = risposta mancante; status=not_applicable = domanda non applicabile al percorso; "Non ricordo" è un normale valore di opzione.';

create table public.demo_explorations (
  id                  uuid primary key default gen_random_uuid(),
  participation_id    uuid not null references public.participations(id) on delete cascade,
  client_key          uuid not null,
  seq                 int not null,
  category            text not null,
  case_id             text not null,
  case_version        text not null,
  need_id             text not null,
  reference_date      date not null,
  started_at          timestamptz not null default now(),
  details_opened      text[] not null default '{}',
  first_detail_at     timestamptz,
  choice              text,
  choice_at           timestamptz,
  provider_clicked    boolean not null default false,
  provider_alt        text,
  provider_clicked_at timestamptz,
  ended_at            timestamptz,
  unique (participation_id, client_key),
  unique (participation_id, seq)
);

alter table public.participations
  add constraint participations_f1_fk foreign key (f1_exploration_id)
  references public.demo_explorations(id) on delete set null;

create table public.events (
  id               bigint generated always as identity primary key,
  participation_id uuid not null references public.participations(id) on delete cascade,
  event_type       text not null check (event_type in (
                     'started', 'initial_done', 'demo_started', 'demo_explored',
                     'feedback_submitted', 'email_shown', 'email_subscribed', 'email_declined')),
  created_at       timestamptz not null default now(),
  unique (participation_id, event_type)
);
comment on table public.events is 'Passaggi essenziali del funnel, al massimo uno per tipo e partecipazione. Nessuna email o testo libero.';

-- ——— Contatti e richieste di iscrizione ———

create table public.contacts (
  id                uuid primary key default gen_random_uuid(),
  email_normalized  text not null unique check (length(email_normalized) <= 254 and email_normalized = lower(btrim(email_normalized))),
  status            text not null default 'active' check (status in ('active', 'revoked')),
  verification      text not null default 'unverified' check (verification in ('unverified', 'verified')),
  created_at        timestamptz not null default now(),
  revoked_at        timestamptz,
  revoked_by        uuid,
  revoke_note       text check (length(revoke_note) <= 500)
);
comment on table public.contacts is 'Contatto unico per email normalizzata. Lo stato è quello ATTUALE; le richieste storiche sono in subscription_requests.';

create table public.subscription_requests (
  id                         uuid primary key default gen_random_uuid(),
  contact_id                 uuid not null references public.contacts(id) on delete cascade,
  participation_id           uuid not null unique references public.participations(id) on delete cascade,
  consent_text               text not null,
  consent_version            text not null references public.consent_versions(version),
  consented_at               timestamptz not null default now(),
  contact_status_at_request  text not null check (contact_status_at_request in ('new', 'active', 'revoked'))
);
create index subscription_requests_contact_idx on public.subscription_requests (contact_id);

create table public.admin_audit (
  id      bigint generated always as identity primary key,
  actor   uuid,
  action  text not null,
  target  text,
  at      timestamptz not null default now()
);

-- ——— Sicurezza: RLS attiva ovunque, nessun accesso diretto alle tabelle ———

do $$
declare t text;
begin
  foreach t in array array['questionnaire_versions','demo_versions','consent_versions','app_config','user_roles',
                           'creator_invites','participations','answers','demo_explorations','events','contacts',
                           'subscription_requests','admin_audit']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ===== 20261026000002_participant_functions.sql =====
-- Travel Recovery — funzioni interne e RPC dei partecipanti.
-- Ogni RPC verifica auth.uid() (sessione anonima Supabase) e la proprietà
-- della partecipazione: un UUID da solo non è un'autorizzazione.
-- Il server assegna proprietario, versioni, stato e flag test.

-- ——— Helper interni (schema private, non esposto dall'API) ———

create or replace function private.err(p_code text, p_detail text default null)
returns void language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = 'TR:' || p_code, detail = coalesce(p_detail, '');
end $$;

create or replace function private.require_uid()
returns uuid language plpgsql stable set search_path = '' as $$
declare v uuid := auth.uid();
begin
  if v is null then perform private.err('auth_required'); end if;
  return v;
end $$;

create or replace function private.is_creator()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid());
$$;

create or replace function private.is_owner()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'owner');
$$;

create or replace function private.normalize_email(p text)
returns text language sql immutable set search_path = '' as $$
  select lower(btrim(p));
$$;

create or replace function private.valid_email(p text)
returns boolean language sql immutable set search_path = '' as $$
  select p is not null and length(p) between 3 and 254
     and p ~ '^[^\s@<>(),;:"\[\]]+@[^\s@<>(),;:"\[\]]+\.[^\s@<>(),;:"\[\]]{2,}$';
$$;

create or replace function private.new_code()
returns text language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  c text;
begin
  loop
    c := 'TR-';
    for i in 1..6 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.participations where code = c);
  end loop;
  return c;
end $$;

create or replace function private.question(p_version text, p_qid text)
returns jsonb language sql stable set search_path = '' as $$
  select q from public.questionnaire_versions v, jsonb_array_elements(v.definition -> 'questions') q
  where v.version = p_version and q ->> 'id' = p_qid;
$$;

create or replace function private.branch_from_q2(p_q2 text)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_q2 in ('yes_open', 'yes_once_closed', 'yes_many_closed') then 'experience'
    when p_q2 in ('no', 'dont_remember') then 'alternative'
    else null end;
$$;

create or replace function private.path_from(p_q2 text, p_a0 text)
returns text language sql immutable set search_path = '' as $$
  select case
    when private.branch_from_q2(p_q2) = 'experience' then 'experience'
    when private.branch_from_q2(p_q2) = 'alternative' and p_a0 = 'never_purchased' then 'never_purchased'
    when private.branch_from_q2(p_q2) = 'alternative' and p_a0 = 'continue' then 'alternative'
    else null end;
$$;

create or replace function private.ans_single(p_pid uuid, p_qid text)
returns text language sql stable set search_path = '' as $$
  select value_single from public.answers
  where participation_id = p_pid and question_id = p_qid and status = 'answered';
$$;

/** Applicabilità di una domanda in base alle risposte attuali (stesse regole di src/lib/flow.ts). */
create or replace function private.is_applicable(p_q jsonb, p_q2 text, p_a0 text, p_f3 text)
returns boolean language sql immutable set search_path = '' as $$
  select case p_q ->> 'branch'
    when 'common' then true
    when 'experience' then private.branch_from_q2(p_q2) = 'experience'
    when 'alt_gate' then private.branch_from_q2(p_q2) = 'alternative'
    when 'alternative' then private.path_from(p_q2, p_a0) = 'alternative'
    when 'feedback' then case when p_q ->> 'id' = 'F3_other' then p_f3 = 'other' else true end
    else false end;
$$;

/** Valida un valore. Restituisce null se valido, altrimenti un codice di errore. */
create or replace function private.validate_value(p_q jsonb, p_v jsonb)
returns text language plpgsql immutable set search_path = '' as $$
declare
  t text := p_q ->> 'type';
  ids text[];
  excl text[];
  vals text[];
  n int;
begin
  select coalesce(array_agg(o ->> 'id'), '{}') into ids from jsonb_array_elements(coalesce(p_q -> 'options', '[]')) o;
  select coalesce(array_agg(o ->> 'id'), '{}') into excl from jsonb_array_elements(coalesce(p_q -> 'options', '[]')) o
    where (o ->> 'exclusive')::boolean is true;
  if t = 'text' then
    if p_v ->> 'kind' <> 'text' or jsonb_typeof(p_v -> 'text') <> 'string' then return 'bad_format'; end if;
    if length(p_v ->> 'text') > coalesce((p_q ->> 'maxLength')::int, 1200) then return 'too_long'; end if;
    return null;
  elsif t = 'single' then
    if p_v ->> 'kind' <> 'single' or not ((p_v ->> 'value') = any (ids)) then return 'bad_option'; end if;
    return null;
  elsif t = 'multi' then
    if p_v ->> 'kind' <> 'multi' or jsonb_typeof(p_v -> 'values') <> 'array' then return 'bad_format'; end if;
    select array_agg(x) into vals from jsonb_array_elements_text(p_v -> 'values') x;
    n := coalesce(array_length(vals, 1), 0);
    if n = 0 then return 'empty'; end if;
    if n <> (select count(distinct x) from unnest(vals) x) then return 'duplicate'; end if;
    if not (vals <@ ids) then return 'bad_option'; end if;
    if vals && excl and n > 1 then return 'exclusive_conflict'; end if;
    if (p_q ->> 'max') is not null and n > (p_q ->> 'max')::int then return 'too_many'; end if;
    return null;
  end if;
  return 'unknown_type';
end $$;

/** Ricalcola il percorso e rende non applicabili (svuotandole) le risposte del ramo abbandonato. */
create or replace function private.refresh_path(p_pid uuid)
returns text language plpgsql set search_path = '' as $$
declare
  v_version text;
  q2 text := private.ans_single(p_pid, 'Q2');
  a0 text := private.ans_single(p_pid, 'A0');
  f3 text := private.ans_single(p_pid, 'F3');
  v_path text;
  r record;
begin
  select questionnaire_version into v_version from public.participations where id = p_pid;
  v_path := private.path_from(q2, a0);
  update public.participations set path = v_path where id = p_pid;
  for r in
    select a.question_id, private.question(v_version, a.question_id) as q
    from public.answers a where a.participation_id = p_pid and a.status = 'answered'
  loop
    if not private.is_applicable(r.q, q2, a0, f3) then
      update public.answers
         set status = 'not_applicable', value_single = null, value_multi = null, value_text = null, confirmed_at = now()
       where participation_id = p_pid and question_id = r.question_id;
    end if;
  end loop;
  -- se A0 non è più applicabile, il percorso può cambiare ancora: ricalcola
  a0 := private.ans_single(p_pid, 'A0');
  v_path := private.path_from(q2, a0);
  update public.participations set path = v_path where id = p_pid;
  return v_path;
end $$;

create or replace function private.log_event(p_pid uuid, p_type text)
returns void language sql set search_path = '' as $$
  insert into public.events (participation_id, event_type) values (p_pid, p_type)
  on conflict (participation_id, event_type) do nothing;
$$;

/** Carica la partecipazione verificando che appartenga all'utente corrente. */
create or replace function private.own_participation(p_pid uuid, p_for_update boolean default true)
returns public.participations language plpgsql set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  p public.participations;
begin
  if p_for_update then
    select * into p from public.participations where id = p_pid and owner_id = v_uid for update;
  else
    select * into p from public.participations where id = p_pid and owner_id = v_uid;
  end if;
  -- stesso errore per "inesistente" e "di un altro utente": nessuna informazione trapela
  if p.id is null then perform private.err('not_found'); end if;
  return p;
end $$;

/** Applica un insieme di risposte {qid: valore|null}. Valida tipo, opzioni, esclusività, limiti e applicabilità. */
create or replace function private.apply_answers(p_pid uuid, p_answers jsonb)
returns void language plpgsql set search_path = '' as $$
declare
  v_version text;
  k text;
  v jsonb;
  q jsonb;
  e text;
  q2 text; a0 text; f3 text;
begin
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then perform private.err('bad_request'); end if;
  if (select count(*) from jsonb_object_keys(p_answers)) > 12 then perform private.err('bad_request'); end if;
  select questionnaire_version into v_version from public.participations where id = p_pid;

  for k, v in select * from jsonb_each(p_answers) loop
    q := private.question(v_version, k);
    if q is null then perform private.err('unknown_question', k); end if;
    if v is null or jsonb_typeof(v) = 'null'
       or (q ->> 'type' = 'text' and jsonb_typeof(v -> 'text') = 'string' and btrim(v ->> 'text') = '') then
      delete from public.answers where participation_id = p_pid and question_id = k;
      continue;
    end if;
    e := private.validate_value(q, v);
    if e is not null then perform private.err('invalid_answer', k || ':' || e); end if;
    insert into public.answers (participation_id, question_id, status, value_single, value_multi, value_text, confirmed_at)
    values (
      p_pid, k, 'answered',
      case when q ->> 'type' = 'single' then v ->> 'value' end,
      case when q ->> 'type' = 'multi' then array(select jsonb_array_elements_text(v -> 'values')) end,
      case when q ->> 'type' = 'text' then btrim(v ->> 'text') end,
      now())
    on conflict (participation_id, question_id) do update
      set status = 'answered', value_single = excluded.value_single, value_multi = excluded.value_multi,
          value_text = excluded.value_text, confirmed_at = now();
  end loop;

  -- applicabilità valutata DOPO aver applicato Q2/A0/F3 della stessa richiesta
  q2 := private.ans_single(p_pid, 'Q2');
  a0 := private.ans_single(p_pid, 'A0');
  f3 := private.ans_single(p_pid, 'F3');
  for k in select jsonb_object_keys(p_answers) loop
    if jsonb_typeof(p_answers -> k) <> 'null'
       and not private.is_applicable(private.question(v_version, k), q2, a0, f3)
       and exists (select 1 from public.answers where participation_id = p_pid and question_id = k and status = 'answered') then
      perform private.err('not_applicable', k);
    end if;
  end loop;

  perform private.refresh_path(p_pid);
end $$;

create or replace function private.missing_required(p_pid uuid)
returns text[] language sql stable set search_path = '' as $$
  with p as (select questionnaire_version v from public.participations where id = p_pid),
  ctx as (select private.ans_single(p_pid, 'Q2') q2, private.ans_single(p_pid, 'A0') a0, private.ans_single(p_pid, 'F3') f3)
  select coalesce(array_agg(q ->> 'id'), '{}')
  from p, ctx, public.questionnaire_versions qv, jsonb_array_elements(qv.definition -> 'questions') q
  where qv.version = p.v
    and (q ->> 'required')::boolean
    and private.is_applicable(q, ctx.q2, ctx.a0, ctx.f3)
    and not exists (select 1 from public.answers a
                    where a.participation_id = p_pid and a.question_id = q ->> 'id' and a.status = 'answered');
$$;

create or replace function private.demo_case(p_version text, p_case_id text)
returns jsonb language sql stable set search_path = '' as $$
  select c from public.demo_versions d, jsonb_array_elements(d.definition -> 'cases') c
  where d.version = p_version and c ->> 'id' = p_case_id;
$$;

create or replace function private.state_json(p_pid uuid)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'code', p.code, 'status', p.status, 'path', p.path, 'current_step', p.current_step,
    'is_test', p.is_test, 'email_screen', p.email_screen, 'f1_exploration_id', p.f1_exploration_id,
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

-- ——— RPC pubbliche ———

create or replace function public.get_public_config()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'project_name', c.project_name, 'mode', c.mode,
    'questionnaire_version', c.questionnaire_version, 'demo_version', c.demo_version,
    'privacy_version', c.privacy_version, 'consent_version', c.consent_version,
    'consent_text', (select text from public.consent_versions where version = c.consent_version),
    'privacy', jsonb_build_object(
      'controller', c.privacy_controller, 'contact', c.privacy_contact, 'legal_basis', c.privacy_legal_basis,
      'retention', c.privacy_retention, 'recipients', c.privacy_recipients, 'extra', c.privacy_extra))
  from public.app_config c where c.id = 1;
$$;

create or replace function public.start_participation(p_client_key uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  c public.app_config;
  v_id uuid;
begin
  if p_client_key is null then perform private.err('bad_request'); end if;
  select id into v_id from public.participations where owner_id = v_uid and client_key = p_client_key;
  if v_id is not null then return private.state_json(v_id); end if;  -- retry / doppio clic

  -- protezione proporzionata contro invii automatizzati
  if (select count(*) from public.participations
      where owner_id = v_uid and started_at > now() - interval '1 hour') >= 10 then
    perform private.err('rate_limited');
  end if;

  select * into c from public.app_config where id = 1;
  if c.id is null then perform private.err('not_configured'); end if;

  insert into public.participations (code, owner_id, client_key, questionnaire_version, demo_version, privacy_version, is_test)
  values (private.new_code(), v_uid, p_client_key, c.questionnaire_version, c.demo_version, c.privacy_version, c.mode = 'test')
  on conflict (owner_id, client_key) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.participations where owner_id = v_uid and client_key = p_client_key;
  end if;
  perform private.log_event(v_id, 'started');
  return private.state_json(v_id);
end $$;

create or replace function public.get_participation(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare p public.participations;
begin
  p := private.own_participation(p_id, false);
  return private.state_json(p.id);
end $$;

create or replace function public.save_step(p_id uuid, p_answers jsonb, p_next_step text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  p public.participations;
  v_path text;
begin
  p := private.own_participation(p_id);
  if p.status = 'completed' then perform private.err('already_completed'); end if;
  if p_next_step is null or p_next_step not in (
      'Q1','Q2','exp_intro','Q3','Q4','Q5','Q6','Q7','Q8','Q9','O1','alt_intro','A1','A2','A3','A4','O2',
      'demo_intro','demo','F1','F2','F3') then
    perform private.err('bad_step');
  end if;
  -- le risposte finali (F3) si inviano solo con submit_final
  if p_answers ? 'F3' or p_answers ? 'F3_other' then perform private.err('bad_request'); end if;

  perform private.apply_answers(p.id, coalesce(p_answers, '{}'::jsonb));
  select path into v_path from public.participations where id = p.id;

  if v_path is not null and exists (select 1 from public.answers where participation_id = p.id and question_id = 'Q1' and status = 'answered') then
    perform private.log_event(p.id, 'initial_done');
  end if;

  update public.participations set current_step = p_next_step, last_activity_at = now() where id = p.id;
  return jsonb_build_object('ok', true, 'path', v_path, 'current_step', p_next_step);
end $$;

create or replace function public.demo_start(
  p_id uuid, p_client_key uuid, p_case_id text, p_need text, p_reference_date date)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  p public.participations;
  c jsonb;
  v_eid uuid;
  v_seq int;
begin
  p := private.own_participation(p_id);
  if p.status = 'completed' then perform private.err('already_completed'); end if;
  if p.path is null then perform private.err('initial_incomplete'); end if;
  select id into v_eid from public.demo_explorations where participation_id = p.id and client_key = p_client_key;
  if v_eid is not null then return jsonb_build_object('exploration_id', v_eid); end if;

  c := private.demo_case(p.demo_version, p_case_id);
  if c is null then perform private.err('unknown_case'); end if;
  if not (c -> 'needs') ? p_need then perform private.err('unknown_need'); end if;
  if p_reference_date is null or abs(p_reference_date - (now() at time zone 'Europe/Rome')::date) > 2 then
    perform private.err('bad_reference_date');
  end if;
  if (select count(*) from public.demo_explorations where participation_id = p.id) >= 30 then
    perform private.err('rate_limited');
  end if;

  select coalesce(max(seq), 0) + 1 into v_seq from public.demo_explorations where participation_id = p.id;
  insert into public.demo_explorations (participation_id, client_key, seq, category, case_id, case_version, need_id, reference_date)
  values (p.id, p_client_key, v_seq, c ->> 'category', p_case_id, p.demo_version, p_need, p_reference_date)
  on conflict (participation_id, client_key) do nothing
  returning id into v_eid;
  if v_eid is null then
    select id into v_eid from public.demo_explorations where participation_id = p.id and client_key = p_client_key;
  end if;
  perform private.log_event(p.id, 'demo_started');
  update public.participations set last_activity_at = now(), current_step = 'demo' where id = p.id;
  return jsonb_build_object('exploration_id', v_eid);
end $$;

create or replace function public.demo_action(p_id uuid, p_exploration_id uuid, p_action text, p_alt text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  p public.participations;
  e public.demo_explorations;
  c jsonb;
  allowed text[];
  has_provider boolean;
begin
  p := private.own_participation(p_id);
  if p.status = 'completed' then perform private.err('already_completed'); end if;
  select * into e from public.demo_explorations where id = p_exploration_id and participation_id = p.id for update;
  if e.id is null then perform private.err('not_found'); end if;
  c := private.demo_case(e.case_version, e.case_id);
  select array_agg(x) into allowed from jsonb_array_elements_text(c -> 'needs' -> e.need_id) x;

  if p_action = 'open_detail' then
    if not (p_alt = any (allowed)) then perform private.err('unknown_alternative'); end if;
    update public.demo_explorations
       set details_opened = case when p_alt = any (details_opened) then details_opened else details_opened || p_alt end,
           first_detail_at = coalesce(first_detail_at, now())
     where id = e.id;
    perform private.log_event(p.id, 'demo_explored');
  elsif p_action = 'choose' then
    if not (p_alt = 'none' or p_alt = any (allowed)) then perform private.err('unknown_alternative'); end if;
    update public.demo_explorations set choice = p_alt, choice_at = now() where id = e.id;
  elsif p_action = 'provider_click' then
    select (a ? 'provider') into has_provider from jsonb_array_elements(c -> 'alternatives') a where a ->> 'id' = p_alt;
    if not (p_alt = any (allowed)) or has_provider is not true then perform private.err('unknown_alternative'); end if;
    update public.demo_explorations
       set provider_clicked = true, provider_alt = p_alt, provider_clicked_at = coalesce(provider_clicked_at, now())
     where id = e.id;
  elsif p_action = 'end' then
    update public.demo_explorations set ended_at = coalesce(ended_at, now()) where id = e.id;
  else
    perform private.err('bad_request');
  end if;
  update public.participations set last_activity_at = now() where id = p.id;
  return jsonb_build_object('ok', true);
end $$;

/** Invio finale atomico: salva F1a/F1b/F2/F3, verifica tutte le risposte obbligatorie, marca completato. */
create or replace function public.submit_final(p_id uuid, p_f1_exploration_id uuid, p_answers jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  p public.participations;
  v_missing text[];
  r record;
  q2 text; a0 text; f3 text;
begin
  p := private.own_participation(p_id);
  if p.status = 'completed' then
    return jsonb_build_object('ok', true, 'already', true, 'code', p.code);  -- idempotente
  end if;
  if p_answers is null or (select count(*) from jsonb_object_keys(p_answers) k where k not in ('F1a','F1b','F2','F3','F3_other')) > 0 then
    perform private.err('bad_request');
  end if;

  if not exists (select 1 from public.demo_explorations
                 where id = p_f1_exploration_id and participation_id = p.id and cardinality(details_opened) > 0) then
    perform private.err('demo_not_explored');
  end if;

  perform private.apply_answers(p.id, p_answers || jsonb_build_object('F3_other', coalesce(p_answers -> 'F3_other', 'null'::jsonb)));

  v_missing := private.missing_required(p.id);
  if cardinality(v_missing) > 0 then perform private.err('incomplete', array_to_string(v_missing, ',')); end if;

  -- registra esplicitamente le domande non applicabili
  q2 := private.ans_single(p.id, 'Q2'); a0 := private.ans_single(p.id, 'A0'); f3 := private.ans_single(p.id, 'F3');
  for r in select q from public.questionnaire_versions v, jsonb_array_elements(v.definition -> 'questions') q
           where v.version = p.questionnaire_version loop
    if not private.is_applicable(r.q, q2, a0, f3) then
      insert into public.answers (participation_id, question_id, status)
      values (p.id, r.q ->> 'id', 'not_applicable')
      on conflict (participation_id, question_id) do update
        set status = 'not_applicable', value_single = null, value_multi = null, value_text = null;
    end if;
  end loop;

  update public.demo_explorations set ended_at = coalesce(ended_at, now()) where participation_id = p.id;
  update public.participations
     set status = 'completed', completed_at = now(), last_activity_at = now(),
         current_step = 'email', f1_exploration_id = p_f1_exploration_id
   where id = p.id;
  perform private.log_event(p.id, 'feedback_submitted');
  return jsonb_build_object('ok', true, 'code', p.code);
end $$;

create or replace function public.email_screen_shown(p_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare p public.participations;
begin
  p := private.own_participation(p_id);
  if p.status <> 'completed' then perform private.err('not_completed'); end if;
  update public.participations set email_screen = 'shown', last_activity_at = now()
   where id = p.id and email_screen = 'not_shown';
  perform private.log_event(p.id, 'email_shown');
  return jsonb_build_object('ok', true);
end $$;

/** Richiesta di aggiornamenti. Risposta sempre generica: non rivela se l'indirizzo è già presente. */
create or replace function public.subscribe_email(p_id uuid, p_email text, p_consent boolean, p_consent_version text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  p public.participations;
  v_email text := private.normalize_email(p_email);
  v_contact public.contacts;
  v_status_at text;
begin
  p := private.own_participation(p_id);
  if p.status <> 'completed' then perform private.err('not_completed'); end if;
  if p_consent is not true then perform private.err('consent_required'); end if;
  if not private.valid_email(v_email) then perform private.err('invalid_email'); end if;
  if not exists (select 1 from public.consent_versions where version = p_consent_version) then
    perform private.err('bad_request');
  end if;
  if exists (select 1 from public.subscription_requests where participation_id = p.id) then
    return jsonb_build_object('ok', true);  -- retry / doppio clic
  end if;

  select * into v_contact from public.contacts where email_normalized = v_email for update;
  if v_contact.id is null then
    insert into public.contacts (email_normalized) values (v_email)
    on conflict (email_normalized) do nothing;
    select * into v_contact from public.contacts where email_normalized = v_email;
    v_status_at := 'new';
  else
    v_status_at := v_contact.status;  -- un contatto revocato NON viene riattivato
  end if;

  insert into public.subscription_requests (contact_id, participation_id, consent_text, consent_version, contact_status_at_request)
  values (v_contact.id, p.id, (select text from public.consent_versions where version = p_consent_version), p_consent_version, v_status_at)
  on conflict (participation_id) do nothing;

  update public.participations set email_screen = 'subscribed', last_activity_at = now() where id = p.id;
  perform private.log_event(p.id, 'email_shown');
  perform private.log_event(p.id, 'email_subscribed');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.decline_email(p_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare p public.participations;
begin
  p := private.own_participation(p_id);
  if p.status <> 'completed' then perform private.err('not_completed'); end if;
  if p.email_screen <> 'subscribed' then
    update public.participations set email_screen = 'declined', last_activity_at = now() where id = p.id;
    perform private.log_event(p.id, 'email_declined');
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ——— Privilegi minimi ———

revoke all on all functions in schema private from public, anon, authenticated;
-- le RPC SECURITY DEFINER richiamano gli helper come owner: nessun grant necessario agli utenti

revoke all on function public.get_public_config() from public, anon, authenticated;
revoke all on function public.start_participation(uuid) from public, anon, authenticated;
revoke all on function public.get_participation(uuid) from public, anon, authenticated;
revoke all on function public.save_step(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.demo_start(uuid, uuid, text, text, date) from public, anon, authenticated;
revoke all on function public.demo_action(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.submit_final(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.email_screen_shown(uuid) from public, anon, authenticated;
revoke all on function public.subscribe_email(uuid, text, boolean, text) from public, anon, authenticated;
revoke all on function public.decline_email(uuid) from public, anon, authenticated;

grant execute on function public.get_public_config() to anon, authenticated;
grant execute on function public.start_participation(uuid) to authenticated;
grant execute on function public.get_participation(uuid) to authenticated;
grant execute on function public.save_step(uuid, jsonb, text) to authenticated;
grant execute on function public.demo_start(uuid, uuid, text, text, date) to authenticated;
grant execute on function public.demo_action(uuid, uuid, text, text) to authenticated;
grant execute on function public.submit_final(uuid, uuid, jsonb) to authenticated;
grant execute on function public.email_screen_shown(uuid) to authenticated;
grant execute on function public.subscribe_email(uuid, text, boolean, text) to authenticated;
grant execute on function public.decline_email(uuid) to authenticated;

-- ===== 20261026000003_admin_functions.sql =====
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

-- ===== 20261026000004_seed_v1.sql =====
-- GENERATO da scripts/gen-seed.ts — non modificare a mano.
-- Definizioni versionate: una nuova versione va AGGIUNTA, non sovrascritta.

insert into public.questionnaire_versions (version, definition)
values ($tr$q-v1$tr$, $tr${"version":"q-v1","texts":{"introTitle":"Quando cambiano i programmi, cosa fai con le tue prenotazioni?","introBody1":"Siamo un gruppo di studenti dell’Università di Bologna e stiamo svolgendo una ricerca per un progetto universitario. Ti faremo alcune domande sulle tue esperienze con prenotazioni e biglietti già acquistati. Poi potrai esplorare una breve demo e dirci cosa ne pensi.","introBody2":"Non ci sono risposte giuste o sbagliate. La partecipazione è volontaria e puoi interrompere quando vuoi. Non ti chiediamo di caricare prenotazioni reali o inserire dati personali nelle risposte. Alla fine, se vorrai ricevere aggiornamenti sul lancio, potrai lasciare facoltativamente la tua email.","introNote":"Le risposte e le principali interazioni con la demo saranno utilizzate dal gruppo per questa ricerca. Se decidi di lasciare la tua email, sarà collegata alla tua partecipazione. Puoi leggere i dettagli nell’informativa.","experienceIntro":"Pensa alla situazione ancora aperta oppure, se non ne hai, all’episodio più recente. Rispondi alle prossime domande facendo riferimento sempre a quell’episodio.","alternativeIntro":"Pensa all’ultima volta che hai acquistato un biglietto o prenotato un viaggio, un soggiorno o un evento. Ci interessa capire cosa hai considerato prima dell’acquisto.","demoTransition1":"Grazie! Ora puoi esplorare un esempio di come potrebbe funzionare Travel Recovery.","demoTransition2":"Il servizio che stiamo immaginando ti aiuterebbe a capire le alternative disponibili per una prenotazione e i passaggi per procedere con il fornitore.","demoTransition3":"Quella che vedrai è una simulazione: prenotazioni, fornitori, importi e condizioni sono inventati a scopo dimostrativo. Non verranno effettuati pagamenti o modifiche reali.","feedbackIntro":"Ora ci interessa il tuo parere sull’esempio che hai provato. Anche se il servizio non ti sarebbe utile, sapere perché ci aiuta a migliorare il progetto.","emailTitle":"Vuoi sapere quando Travel Recovery sarà disponibile?","emailBody":"Se questa idea ti interessa, puoi lasciarci la tua email: ti aggiorneremo sul lancio della versione finale del sito. È facoltativo e puoi terminare il questionario anche senza iscriverti.","emailLinkNote":"Se ti iscrivi, la tua email sarà collegata alle risposte di questa partecipazione, per aiutarci a comprendere l’interesse verso il progetto.","emailSuccess":"Grazie! La tua richiesta è stata registrata. Ti aggiorneremo sul lancio di Travel Recovery.","thanksNoEmail":"Grazie per il tuo contributo! Il tuo parere ci aiuta a capire per chi questa idea potrebbe essere utile e quali aspetti migliorare."},"questions":[{"id":"Q1","branch":"common","type":"multi","required":true,"short":"Servizi acquistati (12 mesi)","title":"Negli ultimi 12 mesi, quali di questi servizi hai acquistato o prenotato personalmente?","options":[{"id":"hotel","label":"Soggiorni in hotel o altre strutture"},{"id":"train","label":"Viaggi in treno"},{"id":"flight","label":"Voli"},{"id":"sport","label":"Eventi sportivi"},{"id":"concert","label":"Concerti, spettacoli o altri eventi"},{"id":"none","label":"Nessuno di questi","exclusive":true}]},{"id":"Q2","branch":"common","type":"single","required":true,"short":"Esperienza di modifica/rinuncia","title":"Ti è mai capitato di dover modificare o rinunciare a una prenotazione o a un biglietto già acquistato?","options":[{"id":"yes_open","label":"Sì, e sto ancora cercando di risolvere la situazione"},{"id":"yes_once_closed","label":"Sì, una volta, ma la situazione si è conclusa"},{"id":"yes_many_closed","label":"Sì, più volte, ma al momento non ho situazioni aperte"},{"id":"no","label":"No, non mi è mai capitato"},{"id":"dont_remember","label":"Non ricordo"}]},{"id":"Q3","branch":"experience","type":"single","required":true,"short":"Servizio dell’episodio","title":"A quale servizio si riferiva la prenotazione che dovevi modificare o non potevi più utilizzare?","options":[{"id":"hotel","label":"Hotel o altra struttura ricettiva"},{"id":"train","label":"Treno"},{"id":"flight","label":"Volo"},{"id":"sport","label":"Evento sportivo"},{"id":"concert","label":"Concerto, spettacolo o altro evento"},{"id":"multiple","label":"Più servizi dello stesso viaggio"}],"notes":{"multiple":"Per le prossime domande, pensa al servizio che hai affrontato per primo."}},{"id":"Q4","branch":"experience","type":"single","required":true,"short":"Motivo","title":"Che cosa aveva reso necessario cercare un’alternativa?","options":[{"id":"own_change","label":"Un cambiamento dei miei programmi o un imprevisto personale"},{"id":"other_person_change","label":"Un cambiamento dei programmi di un’altra persona coinvolta"},{"id":"booking_error","label":"Un errore nella prenotazione o nell’acquisto"},{"id":"provider_change","label":"Il fornitore aveva annullato o modificato il servizio"},{"id":"other","label":"Altro"},{"id":"prefer_not","label":"Preferisco non rispondere"}]},{"id":"Q5","branch":"experience","type":"multi","required":true,"short":"Fonti consultate","title":"Dove hai cercato informazioni per capire cosa potevi fare?","options":[{"id":"confirmation","label":"Email di conferma, biglietto o condizioni della prenotazione"},{"id":"provider_site","label":"Sito o app del fornitore, ad esempio hotel o compagnia di trasporto"},{"id":"intermediary_site","label":"Sito o app dell’intermediario con cui avevo prenotato"},{"id":"customer_care","label":"Assistenza clienti tramite telefono, chat o email"},{"id":"search_engines","label":"Motori di ricerca"},{"id":"ai_tools","label":"Strumenti di intelligenza artificiale"},{"id":"social","label":"Amici, familiari, social o forum"},{"id":"other","label":"Altro"},{"id":"did_not_search","label":"Non ho cercato informazioni","exclusive":true}]},{"id":"Q6","branch":"experience","type":"single","required":true,"short":"Tempo dedicato","title":"Quanto tempo hai dedicato complessivamente a cercare e capire le alternative disponibili?","help":"Considera il tempo dedicato attivamente alla ricerca, alla lettura e ai contatti con l’assistenza, comprese le attese al telefono. Se la situazione è ancora aperta, considera il tempo impiegato finora.","options":[{"id":"none","label":"Non ho dedicato tempo alla ricerca"},{"id":"lt15","label":"Meno di 15 minuti"},{"id":"15_30","label":"Da 15 a meno di 30 minuti"},{"id":"30_60","label":"Da 30 minuti a meno di un’ora"},{"id":"1_2h","label":"Da una a due ore"},{"id":"gt2h","label":"Più di due ore"},{"id":"dont_remember","label":"Non ricordo"}]},{"id":"Q7","branch":"experience","type":"single","required":true,"short":"Facilità nel capire","title":"Nel complesso, quanto è stato facile o difficile capire quali alternative si applicavano alla tua prenotazione?","options":[{"id":"very_easy","label":"Molto facile"},{"id":"fairly_easy","label":"Abbastanza facile"},{"id":"neutral","label":"Né facile né difficile"},{"id":"fairly_hard","label":"Abbastanza difficile"},{"id":"very_hard","label":"Molto difficile"},{"id":"not_enough_info","label":"Non ho cercato informazioni sufficienti per valutarlo"}]},{"id":"Q8","branch":"experience","type":"multi","required":true,"max":3,"short":"Difficoltà incontrate","title":"Quali difficoltà, se presenti, hai incontrato?","options":[{"id":"where_to_look","label":"Capire dove cercare le informazioni"},{"id":"merge_sources","label":"Riunire informazioni distribuite tra più fonti"},{"id":"which_conditions","label":"Capire quali condizioni si applicavano alla mia prenotazione"},{"id":"costs","label":"Capire costi, penali o importi recuperabili"},{"id":"deadlines","label":"Capire entro quando dovevo agire"},{"id":"compare","label":"Confrontare le alternative e scegliere"},{"id":"support_answer","label":"Ottenere una risposta chiara dall’assistenza"},{"id":"complete_procedure","label":"Completare la procedura dopo aver capito cosa fare"},{"id":"other","label":"Altro"},{"id":"no_difficulty","label":"Non ho incontrato difficoltà","exclusive":true},{"id":"did_not_search","label":"Non ho cercato informazioni","exclusive":true}]},{"id":"Q9","branch":"experience","type":"single","required":true,"short":"Risultato","title":"Qual è stato il risultato principale, oppure a che punto sei adesso?","options":[{"id":"full_refund","label":"Ho ottenuto un rimborso completo"},{"id":"partial_refund","label":"Ho ottenuto un rimborso parziale"},{"id":"voucher","label":"Ho ricevuto un voucher o credito"},{"id":"modified","label":"Ho modificato la prenotazione per utilizzarla"},{"id":"transferred","label":"Ho ceduto il biglietto o la prenotazione a un’altra persona"},{"id":"used_original","label":"Alla fine ho utilizzato la prenotazione originale"},{"id":"lost","label":"Non ho utilizzato la prenotazione e non ho recuperato nulla"},{"id":"still_open","label":"La situazione è ancora aperta"},{"id":"other","label":"Altro"}]},{"id":"O1","branch":"experience","type":"text","required":false,"maxLength":1200,"short":"Racconto (aperta)","title":"Ripensando a quell’episodio, che cosa ha reso semplice o difficile capire come procedere? Se ti va, raccontaci un passaggio concreto.","help":"Facoltativa. Non inserire nomi, codici di prenotazione o altri dati personali."},{"id":"A0","branch":"alt_gate","type":"single","required":true,"short":"Sottogruppo","title":"Pensa all’ultima volta che hai acquistato un biglietto o prenotato un viaggio, un soggiorno o un evento.","options":[{"id":"continue","label":"Ho in mente un acquisto: continua"},{"id":"never_purchased","label":"Non ho mai acquistato personalmente questi servizi"}]},{"id":"A1","branch":"alternative","type":"single","required":true,"short":"Preoccupazione prima dell’acquisto","title":"Prima di quell’acquisto, quanto ti preoccupava la possibilità di dover cambiare programmi e non poter utilizzare la prenotazione?","options":[{"id":"not_at_all","label":"Per niente"},{"id":"little","label":"Poco"},{"id":"fairly","label":"Abbastanza"},{"id":"very","label":"Molto"},{"id":"not_considered","label":"Non avevo considerato questa possibilità"},{"id":"dont_remember","label":"Non ricordo"}]},{"id":"A2","branch":"alternative","type":"multi","required":true,"short":"Condizioni controllate","title":"Prima di acquistare, quali condizioni hai controllato?","options":[{"id":"refund","label":"Se fosse possibile ottenere un rimborso"},{"id":"change_dates","label":"Se fosse possibile modificare date o orari"},{"id":"other_person","label":"Se un’altra persona potesse utilizzare il biglietto o la prenotazione"},{"id":"costs","label":"Quali costi o penali fossero previsti"},{"id":"deadlines","label":"Entro quando fosse possibile chiedere modifiche o cancellazioni"},{"id":"not_checked","label":"Non ho controllato queste condizioni","exclusive":true},{"id":"dont_remember","label":"Non ricordo","exclusive":true}]},{"id":"A3","branch":"alternative","type":"single","required":true,"short":"Chiarezza delle possibilità","title":"Quanto ti erano chiare le possibilità disponibili nel caso in cui avessi dovuto cambiare programmi?","options":[{"id":"not_at_all","label":"Per niente chiare"},{"id":"slightly","label":"Poco chiare"},{"id":"fairly","label":"Abbastanza chiare"},{"id":"very","label":"Molto chiare"},{"id":"completely","label":"Del tutto chiare"},{"id":"not_searched","label":"Non avevo cercato queste informazioni"},{"id":"dont_remember","label":"Non ricordo"}]},{"id":"A4","branch":"alternative","type":"multi","required":true,"short":"Influenza sulla scelta","title":"La possibilità di dover cambiare programmi ha influenzato la tua scelta finale?","options":[{"id":"flexible_fare","label":"Ho scelto una tariffa con maggiori possibilità di modifica o cancellazione"},{"id":"insurance","label":"Ho aggiunto un’assicurazione o una protezione per la cancellazione"},{"id":"other_provider","label":"Ho scelto un altro fornitore con condizioni più adatte alle mie esigenze"},{"id":"waited","label":"Ho aspettato di essere più sicuro dei miei programmi prima di acquistare"},{"id":"cheapest","label":"Ho mantenuto l’opzione più economica, accettandone le limitazioni"},{"id":"no_influence","label":"Non ha influenzato la mia scelta","exclusive":true},{"id":"other","label":"Altro"},{"id":"dont_remember","label":"Non ricordo","exclusive":true}]},{"id":"O2","branch":"alternative","type":"text","required":false,"maxLength":1200,"short":"Cosa capire meglio (aperta)","title":"Prima di acquistare, c’era qualcosa che avresti voluto capire meglio su cosa sarebbe successo se i tuoi programmi fossero cambiati? Se ti va, raccontacelo.","help":"Facoltativa. Non inserire nomi, codici di prenotazione o altri dati personali."},{"id":"F1a","branch":"feedback","type":"single","required":true,"short":"F1a Chiarezza alternative","title":"Quali alternative sono disponibili per la prenotazione di esempio.","options":[{"id":"not_at_all","label":"Per niente chiaro"},{"id":"slightly","label":"Poco chiaro"},{"id":"fairly","label":"Abbastanza chiaro"},{"id":"very","label":"Molto chiaro"},{"id":"completely","label":"Del tutto chiaro"},{"id":"cannot_say","label":"Non saprei valutarlo"}]},{"id":"F1b","branch":"feedback","type":"single","required":true,"short":"F1b Chiarezza alternativa vantaggiosa","title":"Quale alternativa sarebbe più vantaggiosa per te, considerando quanto recupereresti, eventuali costi e le tue esigenze.","options":[{"id":"not_at_all","label":"Per niente chiaro"},{"id":"slightly","label":"Poco chiaro"},{"id":"fairly","label":"Abbastanza chiaro"},{"id":"very","label":"Molto chiaro"},{"id":"completely","label":"Del tutto chiaro"},{"id":"cannot_say","label":"Non saprei valutarlo"}]},{"id":"F2","branch":"feedback","type":"single","required":true,"short":"F2 Utilità","title":"Rispetto al modo in cui cercheresti normalmente queste informazioni, quanto ti sarebbe utile un servizio come quello mostrato?","options":[{"id":"not_at_all","label":"Per niente utile"},{"id":"slightly","label":"Poco utile"},{"id":"fairly","label":"Abbastanza utile"},{"id":"very","label":"Molto utile"},{"id":"extremely","label":"Estremamente utile"},{"id":"cannot_say","label":"Non saprei valutarlo"}]},{"id":"F3","branch":"feedback","type":"single","required":true,"short":"F3 Ostacolo principale","title":"Quale sarebbe il principale ostacolo a utilizzare un servizio come questo?","options":[{"id":"prefer_provider","label":"Preferirei cercare le informazioni direttamente dal fornitore"},{"id":"trust","label":"Non mi fiderei abbastanza della correttezza o dell’aggiornamento delle informazioni"},{"id":"no_upload","label":"Non vorrei caricare la mia prenotazione"},{"id":"want_completion","label":"Vorrei che il servizio completasse anche la procedura per me"},{"id":"too_rare","label":"Mi capita troppo raramente di avere questa esigenza"},{"id":"not_understood","label":"Non ho capito abbastanza bene come funzionerebbe"},{"id":"need_price","label":"Dovrei conoscere il prezzo prima di decidere"},{"id":"no_obstacle","label":"Nessun ostacolo particolare, sulla base della demo"},{"id":"other","label":"Altro"}]},{"id":"F3_other","branch":"feedback","type":"text","required":false,"maxLength":300,"short":"F3 Altro (testo)","title":"Altro ostacolo (facoltativo)"}]}$tr$::jsonb)
on conflict (version) do nothing;

insert into public.demo_versions (version, definition)
values ($tr$demo-v1$tr$, $tr${"version":"demo-v1","cases":[{"id":"hotel-01","version":"demo-v1","category":"hotel","categoryLabel":"Hotel e strutture","categoryHint":"Soggiorni, B&B, appartamenti","title":"Due notti al Hotel Lanterna Verde","provider":"Hotel Lanterna Verde (struttura inventata)","channel":"Prenotato tramite Stanzefacili (intermediario inventato)","place":"Ravenna","serviceDay":21,"serviceTime":"15:00","details":["Camera doppia, 2 ospiti","2 notti, colazione inclusa","Pagamento anticipato"],"paid":312,"paidBreakdown":[{"label":"2 notti × 156,00 €","amount":312}],"bookingRef":"ESEMPIO-HTL-0421","clauses":[{"id":"H1","text":"Cancellazione gratuita fino a 7 giorni prima della data di arrivo. Dopo tale termine viene addebitato l’importo della prima notte (156,00 €)."},{"id":"H2","text":"Le date del soggiorno possono essere modificate una sola volta, senza penale, fino a 7 giorni prima dell’arrivo e in base alla disponibilità. L’eventuale differenza di prezzo è calcolata al momento della modifica."},{"id":"H3","text":"Il nominativo dell’ospite principale può essere sostituito su richiesta alla struttura, almeno 48 ore prima dell’arrivo. La struttura si riserva di accettare la richiesta per le prenotazioni effettuate tramite intermediari."},{"id":"H4","text":"Non sono previsti voucher o crediti in sostituzione del rimborso."}],"needs":{"cancel":["h-cancel-free","h-cancel-late","h-change-dates","h-voucher"],"change_date":["h-change-dates","h-cancel-free","h-voucher"],"other_person":["h-guest-change","h-cancel-free"]},"alternatives":[{"id":"h-cancel-free","title":"Cancellazione gratuita","benefit":"refund","status":"available","summary":"Annulli il soggiorno entro il termine gratuito e ricevi il rimborso dell’intero importo pagato.","refundGross":312,"deductions":[],"deadline":{"days":14,"time":"23:59","text":"Entro 7 giorni prima dell’arrivo"},"conditions":["Vale solo fino a 7 giorni prima dell’arrivo.","Il rimborso avviene sul metodo di pagamento usato per la prenotazione."],"steps":["Apri la prenotazione nell’area personale dell’intermediario.","Scegli “Cancella prenotazione” e conferma.","Conserva l’email di conferma della cancellazione."],"contact":"Stanzefacili, l’intermediario con cui hai prenotato","clauseIds":["H1"],"provider":{"label":"Area prenotazioni di Stanzefacili","where":"Sito o app dell’intermediario, sezione “Le mie prenotazioni”","how":["Accesso con il tuo account","Selezione della prenotazione","Cancellazione e conferma via email"]}},{"id":"h-cancel-late","title":"Cancellazione dopo il termine gratuito","benefit":"refund","status":"available","summary":"Se annulli dopo il termine gratuito, la struttura trattiene la prima notte e rimborsa il resto.","refundGross":312,"deductions":[{"label":"Penale: prima notte","amount":156}],"deadline":{"days":21,"time":"15:00","text":"Dopo il termine gratuito e prima dell’arrivo"},"conditions":["Si applica solo se cancelli dopo il termine gratuito.","La penale è trattenuta una sola volta."],"steps":["Apri la prenotazione nell’area personale dell’intermediario.","Scegli “Cancella prenotazione”: il riepilogo indicherà la penale.","Conserva l’email di conferma."],"contact":"Stanzefacili, l’intermediario con cui hai prenotato","clauseIds":["H1"]},{"id":"h-change-dates","title":"Cambio delle date","benefit":"change","status":"available","summary":"Sposti il soggiorno su altre date: conservi la possibilità di soggiornare, ma non ricevi un rimborso.","keepsUse":true,"extraCosts":[],"toVerify":["Differenza di prezzo per le nuove date"],"deadline":{"days":14,"time":"23:59","text":"Entro 7 giorni prima dell’arrivo, una sola volta"},"conditions":["Una sola modifica consentita.","Dipende dalla disponibilità della struttura."],"steps":["Verifica la disponibilità per le nuove date.","Richiedi la modifica dall’area personale dell’intermediario.","Controlla la differenza di prezzo prima di confermare."],"contact":"Stanzefacili, che inoltra la richiesta alla struttura","clauseIds":["H2"],"provider":{"label":"Richiesta di modifica su Stanzefacili","where":"Sito o app dell’intermediario, “Modifica date”","how":["Scelta delle nuove date","Visualizzazione della differenza di prezzo","Conferma della modifica"]}},{"id":"h-guest-change","title":"Sostituzione dell’ospite principale","benefit":"transfer","status":"to_confirm","summary":"Un’altra persona soggiorna al posto tuo. La struttura deve accettare la richiesta.","keepsUse":true,"extraCosts":[],"notGuaranteed":"Nessun rimborso dalla struttura. Eventuali accordi economici tra te e l’altra persona non fanno parte del servizio.","deadline":{"days":19,"time":"15:00","text":"Almeno 48 ore prima dell’arrivo"},"conditions":["Per le prenotazioni tramite intermediario la struttura può non accettare la sostituzione."],"steps":["Contatta la struttura indicando il codice della prenotazione.","Comunica il nominativo del nuovo ospite.","Attendi la conferma scritta prima di considerare valida la sostituzione."],"contact":"Hotel Lanterna Verde, direttamente","clauseIds":["H3"],"reason":"Le condizioni dell’esempio lasciano alla struttura la decisione per le prenotazioni tramite intermediari.","provider":{"label":"Contatto con la struttura","where":"Email o telefono della struttura indicati nella conferma","how":["Richiesta scritta con codice prenotazione","Nominativo del nuovo ospite","Conferma scritta della struttura"]}},{"id":"h-voucher","title":"Voucher o credito","benefit":"credit","status":"not_provided","summary":"Trasformare il soggiorno in un credito per un’altra occasione.","conditions":[],"steps":[],"contact":"—","clauseIds":["H4"],"reason":"Le condizioni dell’esempio escludono voucher o crediti in sostituzione del rimborso."}]},{"id":"train-01","version":"demo-v1","category":"train","categoryLabel":"Treni","categoryHint":"Alta velocità, regionali, notte","title":"Bologna Centrale → Roma Termini","provider":"Ferrovie Aurora (operatore inventato)","channel":"Acquistato sull’app dell’operatore","place":"Bologna → Roma","serviceDay":10,"serviceTime":"08:15","details":["1 passeggero, posto 7A","Tariffa “Flessibile Base”","Biglietto nominativo"],"paid":59.9,"paidBreakdown":[{"label":"Tariffa Flessibile Base","amount":59.9}],"bookingRef":"ESEMPIO-TRN-7Q2L","clauses":[{"id":"T1","text":"Tariffa Flessibile Base: cambio di data e orario gratuito fino alla partenza, pagando l’eventuale differenza tariffaria."},{"id":"T2","text":"Rimborso consentito fino alla partenza con una trattenuta del 20% del prezzo pagato."},{"id":"T3","text":"Il biglietto è nominativo e non può essere ceduto ad altre persone."},{"id":"T4","text":"Errori materiali nel nome del passeggero possono essere corretti dall’assistenza, che valuta la richiesta caso per caso."},{"id":"T5","text":"Dopo la partenza del treno non sono possibili rimborsi né cambi."}],"needs":{"cancel":["t-refund","t-change","t-credit"],"change_date":["t-change","t-refund","t-credit"],"other_person":["t-transfer","t-name-fix","t-refund"]},"alternatives":[{"id":"t-change","title":"Cambio data o orario","benefit":"change","status":"available","summary":"Scegli un altro treno: il biglietto resta valido, con l’eventuale differenza di prezzo da pagare.","keepsUse":true,"extraCosts":[],"toVerify":["Differenza tariffaria del nuovo treno"],"deadline":{"days":10,"time":"08:15","text":"Fino alla partenza del treno"},"conditions":["Nessuna penale.","Si paga solo l’eventuale differenza tariffaria.","Non possibile dopo la partenza."],"steps":["Apri il biglietto nell’app dell’operatore.","Scegli “Cambia” e seleziona il nuovo treno.","Verifica la differenza e conferma."],"contact":"Ferrovie Aurora, app o biglietteria","clauseIds":["T1","T5"],"provider":{"label":"Cambio biglietto nell’app Ferrovie Aurora","where":"App dell’operatore, sezione “I miei viaggi”","how":["Selezione del biglietto","Scelta del nuovo treno","Pagamento dell’eventuale differenza"]}},{"id":"t-refund","title":"Rimborso prima della partenza","benefit":"refund","status":"available","summary":"Rinunci al viaggio e ricevi il prezzo pagato meno la trattenuta prevista.","refundGross":59.9,"deductions":[{"label":"Trattenuta del 20%","amount":11.98}],"deadline":{"days":10,"time":"08:15","text":"Fino alla partenza del treno"},"conditions":["Trattenuta del 20% sul prezzo pagato.","Non possibile dopo la partenza."],"steps":["Apri il biglietto nell’app dell’operatore.","Scegli “Richiedi rimborso”.","Conferma: il rimborso arriva sul metodo di pagamento originale."],"contact":"Ferrovie Aurora, app o biglietteria","clauseIds":["T2","T5"],"provider":{"label":"Richiesta di rimborso nell’app Ferrovie Aurora","where":"App dell’operatore, sezione “I miei viaggi”","how":["Selezione del biglietto","Richiesta di rimborso","Conferma via email"]}},{"id":"t-transfer","title":"Cedere il biglietto a un’altra persona","benefit":"transfer","status":"not_provided","summary":"Far viaggiare un’altra persona con il tuo biglietto.","conditions":[],"steps":[],"contact":"—","clauseIds":["T3"],"reason":"Nell’esempio il biglietto è nominativo e non cedibile."},{"id":"t-credit","title":"Credito per un viaggio futuro","benefit":"credit","status":"not_provided","summary":"Trasformare il biglietto in un credito da usare più avanti.","conditions":[],"steps":[],"contact":"—","clauseIds":["T1","T2"],"reason":"Le condizioni dell’esempio prevedono il cambio o il rimborso con trattenuta, non la conversione in credito."},{"id":"t-name-fix","title":"Correzione di un errore nel nome","benefit":"correction","status":"to_confirm","summary":"Correggere un errore di battitura nel tuo nome. Non permette di sostituire il passeggero.","extraCosts":[],"keepsUse":true,"conditions":["Vale per errori materiali, non per cambiare persona."],"steps":["Contatta l’assistenza dell’operatore.","Indica l’errore e il nome corretto.","Attendi la conferma della correzione."],"contact":"Assistenza clienti di Ferrovie Aurora","clauseIds":["T4","T3"],"reason":"Nell’esempio l’assistenza valuta la correzione caso per caso."}]},{"id":"flight-01","version":"demo-v1","category":"flight","categoryLabel":"Voli","categoryHint":"Andata e ritorno, tariffe base","title":"Bologna ⇄ Lisbona","provider":"Aerolinea Meridia (compagnia inventata)","channel":"Acquistato sul sito della compagnia","place":"Bologna → Lisbona","serviceDay":30,"serviceTime":"06:40","details":["1 passeggero, andata e ritorno","Tariffa “Light”, solo bagaglio a mano","Ritorno dopo 4 giorni"],"paid":214.4,"paidBreakdown":[{"label":"Tariffa Light","amount":175.8},{"label":"Tasse e supplementi aeroportuali","amount":38.6}],"bookingRef":"ESEMPIO-FLY-M4K9","clauses":[{"id":"F1","text":"Tariffa Light non rimborsabile. In caso di rinuncia volontaria sono rimborsabili solo le tasse aeroportuali (38,60 €), con un costo di gestione di 15,00 €."},{"id":"F2","text":"Fino a 14 giorni prima della partenza, il valore del biglietto può essere convertito in un credito di 150,00 € utilizzabile entro 12 mesi per nuovi voli della compagnia."},{"id":"F3","text":"Cambio data consentito fino a 24 ore prima della partenza, con una penale di 60,00 € più l’eventuale differenza tariffaria."},{"id":"F4","text":"Sono consentite correzioni gratuite del nome fino a 3 caratteri. La sostituzione del passeggero non è consentita."},{"id":"F5","text":"Se è la compagnia ad annullare o modificare il volo si applicano condizioni diverse, non simulate in questo esempio."}],"needs":{"cancel":["f-credit","f-taxes","f-change","f-substitute"],"change_date":["f-change","f-free-change","f-credit","f-taxes"],"other_person":["f-substitute","f-name-fix","f-credit"]},"alternatives":[{"id":"f-taxes","title":"Rimborso delle tasse aeroportuali","benefit":"refund","status":"available","summary":"Rinunci al volo e recuperi solo le tasse aeroportuali, meno il costo di gestione.","refundGross":38.6,"deductions":[{"label":"Costo di gestione","amount":15}],"deadline":{"days":30,"time":"06:40","text":"Prima della partenza"},"conditions":["La tariffa non è rimborsabile: si recuperano solo le tasse.","Rinuncia volontaria, non annullamento della compagnia."],"steps":["Accedi a “Gestisci prenotazione” sul sito della compagnia.","Scegli “Rinuncia al volo e rimborso tasse”.","Conferma la richiesta."],"contact":"Aerolinea Meridia, area “Gestisci prenotazione”","clauseIds":["F1","F5"],"provider":{"label":"Gestisci prenotazione — Aerolinea Meridia","where":"Sito della compagnia, area “Gestisci prenotazione”","how":["Codice prenotazione e cognome","Richiesta di rimborso tasse","Conferma via email"]}},{"id":"f-credit","title":"Credito per un nuovo volo","benefit":"credit","status":"available","summary":"Trasformi il biglietto in un credito da usare per altri voli della stessa compagnia.","credit":{"amount":150,"validity":"12 mesi dalla conversione"},"deadline":{"days":16,"time":"23:59","text":"Fino a 14 giorni prima della partenza"},"conditions":["Il credito non è denaro rimborsato.","Utilizzabile solo per voli della compagnia."],"steps":["Accedi a “Gestisci prenotazione”.","Scegli “Converti in credito”.","Conserva il codice del credito ricevuto via email."],"contact":"Aerolinea Meridia, area “Gestisci prenotazione”","clauseIds":["F2"],"provider":{"label":"Conversione in credito — Aerolinea Meridia","where":"Sito della compagnia, area “Gestisci prenotazione”","how":["Selezione del volo","Conversione in credito","Codice credito via email"]}},{"id":"f-change","title":"Cambio data del volo","benefit":"change","status":"available","summary":"Sposti il viaggio su un’altra data pagando la penale e l’eventuale differenza tariffaria.","keepsUse":true,"extraCosts":[{"label":"Penale di cambio","amount":60}],"toVerify":["Differenza tariffaria della nuova data"],"deadline":{"days":29,"time":"06:40","text":"Fino a 24 ore prima della partenza"},"conditions":["Penale fissa più eventuale differenza tariffaria."],"steps":["Accedi a “Gestisci prenotazione”.","Scegli “Cambia volo” e la nuova data.","Verifica penale e differenza prima di pagare."],"contact":"Aerolinea Meridia, area “Gestisci prenotazione”","clauseIds":["F3"],"provider":{"label":"Cambio volo — Aerolinea Meridia","where":"Sito della compagnia, area “Gestisci prenotazione”","how":["Scelta della nuova data","Riepilogo di penale e differenza","Pagamento e conferma"]}},{"id":"f-free-change","title":"Cambio data senza penale","benefit":"change","status":"not_provided","summary":"Spostare il volo su un’altra data senza pagare la penale di cambio.","conditions":[],"steps":[],"contact":"—","clauseIds":["F3"],"reason":"Nell’esempio la tariffa Light prevede sempre una penale di 60,00 € per il cambio data."},{"id":"f-substitute","title":"Sostituire il passeggero","benefit":"transfer","status":"not_provided","summary":"Far volare un’altra persona al posto tuo.","conditions":[],"steps":[],"contact":"—","clauseIds":["F4"],"reason":"Nell’esempio la sostituzione del passeggero non è consentita: è prevista solo la correzione del nome."},{"id":"f-name-fix","title":"Correzione del nome","benefit":"correction","status":"available","summary":"Correggi un errore di battitura fino a 3 caratteri. Non cambia la persona che viaggia.","extraCosts":[],"keepsUse":true,"deadline":{"days":29,"time":"06:40","text":"Prima del check-in"},"conditions":["Massimo 3 caratteri.","Non è una sostituzione del passeggero."],"steps":["Accedi a “Gestisci prenotazione”.","Scegli “Correggi nome”.","Verifica che il nome coincida con il documento."],"contact":"Aerolinea Meridia, area “Gestisci prenotazione”","clauseIds":["F4"]}]},{"id":"sport-01","version":"demo-v1","category":"sport","categoryLabel":"Eventi sportivi","categoryHint":"Partite, gare, tornei","title":"Finale regionale di pallavolo","provider":"Lega Volley Est (organizzatore inventato)","channel":"Acquistato su TicketRiva (circuito inventato)","place":"Arena Nord, Ferrara","serviceDay":18,"serviceTime":"20:30","details":["2 biglietti, settore B","Biglietti nominativi","Ingresso dalle 19:30"],"paid":80.5,"paidBreakdown":[{"label":"2 biglietti × 38,00 €","amount":76},{"label":"Commissione di servizio","amount":4.5}],"bookingRef":"ESEMPIO-SPT-22B","clauses":[{"id":"S1","text":"I biglietti non sono rimborsabili, salvo annullamento dell’evento da parte dell’organizzatore. La commissione di servizio non è rimborsabile."},{"id":"S2","text":"Il cambio del nominativo è possibile dall’area personale di TicketRiva fino a 48 ore prima dell’evento, al costo di 2,50 € per biglietto."},{"id":"S3","text":"La rivendita è consentita esclusivamente tramite la piattaforma di scambio ufficiale dell’organizzatore. La vendita e il prezzo non sono garantiti; in caso di vendita è trattenuta una commissione dell’8% sul prezzo di vendita."}],"needs":{"cancel":["s-official-resale","s-name-change","s-refund"],"other_person":["s-name-change","s-official-resale"]},"alternatives":[{"id":"s-name-change","title":"Cambio nominativo","benefit":"transfer","status":"available","summary":"Intesti i biglietti a un’altra persona che parteciperà al tuo posto.","keepsUse":true,"extraCosts":[{"label":"Cambio nominativo, 2 × 2,50 €","amount":5}],"notGuaranteed":"Nessun rimborso dall’organizzatore. Eventuali accordi tra te e l’altra persona non fanno parte del servizio.","deadline":{"days":16,"time":"20:30","text":"Fino a 48 ore prima dell’evento"},"conditions":["Costo per ogni biglietto modificato.","Il nuovo intestatario deve presentare un documento."],"steps":["Accedi all’area personale di TicketRiva.","Scegli “Cambia nominativo” per ogni biglietto.","Paga il costo e scarica i nuovi biglietti."],"contact":"TicketRiva, area personale","clauseIds":["S2"],"provider":{"label":"Cambio nominativo su TicketRiva","where":"Area personale del circuito di vendita","how":["Selezione dei biglietti","Dati del nuovo intestatario","Pagamento del costo e nuovi biglietti"]}},{"id":"s-official-resale","title":"Rivendita sul canale ufficiale","benefit":"resale","status":"to_confirm","summary":"Metti in vendita i biglietti sulla piattaforma di scambio dell’organizzatore. La vendita non è garantita.","notGuaranteed":"L’importo dipende dall’eventuale vendita e non è garantito. Se i biglietti vengono venduti, è trattenuta una commissione dell’8% sul prezzo di vendita.","deadline":{"days":18,"time":"18:30","text":"Finché la piattaforma accetta la vendita"},"conditions":["Solo canale ufficiale dell’organizzatore.","Commissione dell’8% in caso di vendita."],"steps":["Accedi alla piattaforma di scambio ufficiale.","Inserisci i biglietti in vendita.","Attendi l’eventuale acquirente: fino ad allora i biglietti restano tuoi."],"contact":"Piattaforma di scambio ufficiale dell’organizzatore","clauseIds":["S3"],"reason":"L’esito dipende dalla presenza di un acquirente: l’esempio non può confermarlo.","provider":{"label":"Piattaforma di scambio ufficiale","where":"Canale autorizzato indicato dall’organizzatore","how":["Inserimento dei biglietti in vendita","Eventuale acquisto da parte di un’altra persona","Accredito al netto della commissione"]}},{"id":"s-refund","title":"Rimborso per rinuncia","benefit":"refund","status":"not_provided","summary":"Ricevere indietro il prezzo dei biglietti perché non puoi partecipare.","conditions":[],"steps":[],"contact":"—","clauseIds":["S1"],"reason":"Nell’esempio il rimborso è previsto solo se l’evento viene annullato dall’organizzatore, non per rinuncia volontaria."}]},{"id":"concert-01","version":"demo-v1","category":"concert","categoryLabel":"Concerti e spettacoli","categoryHint":"Concerti, teatro, festival","title":"Orchestra delle Valli in concerto","provider":"Teatro Sirio (inventato)","channel":"Acquistato su Biglietteria Lumen (inventata)","place":"Teatro Sirio, Modena","serviceDay":40,"serviceTime":"21:00","details":["1 biglietto, platea fila H","Biglietto nominativo","Stagione concertistica"],"paid":72.8,"paidBreakdown":[{"label":"Biglietto platea","amount":65},{"label":"Diritti di prevendita","amount":7.8}],"bookingRef":"ESEMPIO-CNC-H12","clauses":[{"id":"C1","text":"Non è previsto il rimborso per rinuncia volontaria."},{"id":"C2","text":"Fino a 20 giorni prima dello spettacolo il biglietto può essere convertito in un credito pari al prezzo del biglietto (65,00 €), esclusi i diritti di prevendita, utilizzabile per altri spettacoli della stagione."},{"id":"C3","text":"Il cambio del nominativo è consentito tramite la biglietteria ufficiale fino a 5 giorni prima, al costo di 3,00 €."},{"id":"C4","text":"Il passaggio a un’altra replica della stessa produzione è valutato dalla biglietteria in base alla disponibilità."},{"id":"C5","text":"In caso di rinvio deciso dall’organizzatore si applicano condizioni diverse, non simulate in questo esempio."}],"needs":{"cancel":["c-credit","c-name-change","c-refund"],"change_date":["c-other-date","c-credit"],"other_person":["c-name-change","c-third-party"]},"alternatives":[{"id":"c-credit","title":"Credito per altri spettacoli","benefit":"credit","status":"available","summary":"Converti il biglietto in un credito da usare per un altro spettacolo della stagione.","credit":{"amount":65,"validity":"Fino al termine della stagione"},"deadline":{"days":20,"time":"23:59","text":"Fino a 20 giorni prima dello spettacolo"},"conditions":["I diritti di prevendita (7,80 €) non sono inclusi nel credito.","Il credito non è denaro rimborsato."],"steps":["Accedi alla Biglietteria Lumen.","Scegli “Converti in credito”.","Usa il codice credito per un altro spettacolo."],"contact":"Biglietteria Lumen","clauseIds":["C2","C1"],"provider":{"label":"Conversione in credito — Biglietteria Lumen","where":"Biglietteria ufficiale online","how":["Selezione del biglietto","Conversione in credito","Codice credito via email"]}},{"id":"c-name-change","title":"Cambio nominativo","benefit":"transfer","status":"available","summary":"Intesti il biglietto a un’altra persona tramite la biglietteria ufficiale.","keepsUse":true,"extraCosts":[{"label":"Costo del cambio nominativo","amount":3}],"notGuaranteed":"Nessun rimborso dalla biglietteria. Eventuali accordi tra te e l’altra persona non fanno parte del servizio.","deadline":{"days":35,"time":"21:00","text":"Fino a 5 giorni prima dello spettacolo"},"conditions":["Solo tramite la biglietteria ufficiale."],"steps":["Accedi alla Biglietteria Lumen.","Scegli “Cambia nominativo”.","Paga il costo e invia il nuovo biglietto all’intestatario."],"contact":"Biglietteria Lumen","clauseIds":["C3"],"provider":{"label":"Cambio nominativo — Biglietteria Lumen","where":"Biglietteria ufficiale online","how":["Dati del nuovo intestatario","Pagamento del costo","Emissione del nuovo biglietto"]}},{"id":"c-other-date","title":"Passare a un’altra replica","benefit":"change","status":"to_confirm","summary":"Assistere allo stesso spettacolo in un’altra data, se la biglietteria lo consente.","keepsUse":true,"toVerify":["Disponibilità e costo di un’altra replica"],"conditions":["Valutato in base alla disponibilità."],"steps":["Contatta la Biglietteria Lumen.","Chiedi la disponibilità per le altre repliche.","Attendi la conferma prima di considerare valido il cambio."],"contact":"Biglietteria Lumen, assistenza","clauseIds":["C4"],"reason":"Nell’esempio il cambio di replica non è garantito: la biglietteria valuta la disponibilità."},{"id":"c-third-party","title":"Cessione fuori dalla biglietteria ufficiale","benefit":"transfer","status":"not_provided","summary":"Passare il biglietto a un’altra persona senza aggiornare il nominativo.","conditions":[],"steps":[],"contact":"—","clauseIds":["C3"],"reason":"Nell’esempio il biglietto è nominativo: un’altra persona può usarlo solo dopo il cambio tramite la biglietteria ufficiale."},{"id":"c-refund","title":"Rimborso per rinuncia","benefit":"refund","status":"not_provided","summary":"Ricevere indietro il prezzo del biglietto perché non puoi partecipare.","conditions":[],"steps":[],"contact":"—","clauseIds":["C1","C5"],"reason":"Nell’esempio la rinuncia volontaria non dà diritto a rimborso; il rinvio deciso dall’organizzatore è un caso diverso."}]}]}$tr$::jsonb)
on conflict (version) do nothing;

insert into public.consent_versions (version, text)
values ($tr$consent-v1$tr$, $tr$Desidero ricevere via email aggiornamenti sul lancio di Travel Recovery. Posso revocare il consenso in qualsiasi momento.$tr$)
on conflict (version) do nothing;

insert into public.app_config (id, project_name, mode, questionnaire_version, demo_version, privacy_version, consent_version)
values (1, $tr$Travel Recovery$tr$, 'test', $tr$q-v1$tr$, $tr$demo-v1$tr$, $tr$privacy-v1$tr$, $tr$consent-v1$tr$)
on conflict (id) do nothing;

-- ===== 20261026000005_english.sql =====
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

