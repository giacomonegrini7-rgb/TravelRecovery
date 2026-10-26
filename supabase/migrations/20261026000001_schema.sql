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
