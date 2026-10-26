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
