-- Test SQL: percorsi, validazione, idempotenza, isolamento tra partecipazioni, ruoli e RLS.
-- Eseguito da run-local.sh su un database temporaneo. Dati esclusivamente sintetici.
\set QUIET on
\pset tuples_only on
\pset format unaligned
\o /dev/null

create schema tst;
grant usage on schema tst to anon, authenticated;
create function tst.ok(c boolean, msg text) returns void language plpgsql as $$
begin
  if c is not true then raise exception 'FALLITO: %', msg; end if;
  raise notice 'ok  %', msg;
end $$;
create function tst.err(p_sql text, p_like text, msg text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm like p_like then raise notice 'ok  % (%)', msg, sqlerrm; return; end if;
    raise exception 'FALLITO: % — errore inatteso: %', msg, sqlerrm;
  end;
  raise exception 'FALLITO: % — nessun errore', msg;
end $$;
grant execute on all functions in schema tst to anon, authenticated;

insert into auth.users (id, email, email_confirmed_at, is_anonymous) values
  ('00000000-0000-0000-0000-0000000000a1', null, null, true),                         -- visitatore 1
  ('00000000-0000-0000-0000-0000000000a2', null, null, true),                         -- visitatore 2
  ('00000000-0000-0000-0000-0000000000a3', null, null, true),                         -- visitatore 3
  ('00000000-0000-0000-0000-0000000000a4', null, null, true),                         -- visitatore 4 (mai acquistato)
  ('00000000-0000-0000-0000-0000000000b1', 'owner@test.example', now(), false),      -- owner
  ('00000000-0000-0000-0000-0000000000b2', 'crea@test.example', now(), false),       -- creator invitato
  ('00000000-0000-0000-0000-0000000000b3', 'altro@test.example', now(), false);      -- autenticato non autorizzato

\echo '— Visitatore 1: percorso esperienza con cambio di ramo'
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
set role authenticated;

select (public.start_participation('11111111-1111-1111-1111-111111111111') ->> 'id') as p1 \gset
select tst.ok((public.start_participation('11111111-1111-1111-1111-111111111111') ->> 'id') = :'p1', 'retry di start_participation non crea duplicati');
select tst.ok((public.get_participation(:'p1') ->> 'is_test')::boolean, 'in modalità test la partecipazione è marcata test dal server');

select tst.err($$select public.save_step('$$ || :'p1' || $$', '{"Q1":{"kind":"multi","values":["none","train"]}}', 'Q2')$$, 'TR:invalid_answer', 'Q1: "Nessuno" esclusivo');
select public.save_step(:'p1', '{"Q1":{"kind":"multi","values":["none"]}}', 'Q2');
select tst.err($$select public.save_step('$$ || :'p1' || $$', '{"Q2":{"kind":"single","value":"forse"}}', 'Q3')$$, 'TR:invalid_answer', 'Q2: opzione inesistente respinta');
select public.save_step(:'p1', '{"Q2":{"kind":"single","value":"yes_open"}}', 'exp_intro');
select tst.ok(public.get_participation(:'p1') ->> 'path' = 'experience', 'Q1 "Nessuno" + Q2 "Sì" → percorso esperienza (nessun limite di 12 mesi)');

select tst.err($$select public.save_step('$$ || :'p1' || $$', '{"Q8":{"kind":"multi","values":["costs","deadlines","compare","other"]}}', 'Q9')$$, 'TR:invalid_answer', 'Q8: massimo tre risposte');
select tst.err($$select public.save_step('$$ || :'p1' || $$', '{"Q8":{"kind":"multi","values":["no_difficulty","did_not_search"]}}', 'Q9')$$, 'TR:invalid_answer', 'Q8: esclusive anche tra loro');
select tst.err($$select public.save_step('$$ || :'p1' || $$', '{"A1":{"kind":"single","value":"fairly"}}', 'A2')$$, 'TR:not_applicable', 'domanda del ramo alternativo respinta nel percorso esperienza');
select tst.err($$select public.save_step('$$ || :'p1' || $$', ('{"O1":{"kind":"text","text":"' || repeat('x', 1201) || '"}}')::jsonb, 'demo_intro')$$, 'TR:invalid_answer', 'O1: oltre 1.200 caratteri respinta');
select tst.err($$select public.save_step('$$ || :'p1' || $$', '{"Q3":{"kind":"single","value":"hotel"}}', 'admin')$$, 'TR:bad_step', 'passaggio inesistente respinto');

select public.save_step(:'p1', '{"Q3":{"kind":"single","value":"multiple"}}', 'Q4');
select public.save_step(:'p1', '{"Q4":{"kind":"single","value":"own_change"}}', 'Q5');
select public.save_step(:'p1', '{"Q5":{"kind":"multi","values":["confirmation","customer_care"]}}', 'Q6');
select public.save_step(:'p1', '{"Q6":{"kind":"single","value":"30_60"}}', 'Q7');
select public.save_step(:'p1', '{"Q7":{"kind":"single","value":"fairly_hard"}}', 'Q8');
select public.save_step(:'p1', '{"Q8":{"kind":"multi","values":["costs","deadlines","compare"]}}', 'Q9');
select public.save_step(:'p1', '{"Q9":{"kind":"single","value":"partial_refund"}}', 'O1');
select public.save_step(:'p1', '{"O1":{"kind":"text","text":"<script>alert(1)</script> Le condizioni erano in tre posti diversi."}}', 'demo_intro');
select public.save_step(:'p1', '{"O1":{"kind":"text","text":"   "}}', 'demo_intro');
reset role;
select tst.ok(not exists (select 1 from public.answers where participation_id = :'p1' and question_id = 'O1'), 'aperta svuotata = nessuna risposta (facoltativa)');
set role authenticated;

-- cambio di ramo: Q2 "No" → le risposte del ramo esperienza diventano non applicabili
select public.save_step(:'p1', '{"Q2":{"kind":"single","value":"no"}}', 'alt_intro');
reset role;
select tst.ok((select count(*) from public.answers where participation_id = :'p1' and status = 'not_applicable' and question_id like 'Q_' ) = 7, 'cambio percorso: Q3–Q9 marcate non applicabili e svuotate');
select tst.ok((select path from public.participations where id = :'p1') is null, 'Q2 "No" senza scelta del sottogruppo: percorso non ancora determinato');
set role authenticated;
select public.save_step(:'p1', '{"A0":{"kind":"single","value":"continue"}}', 'A1');
select tst.ok(public.get_participation(:'p1') ->> 'path' = 'alternative', 'A0 "continua" → percorso alternativo');
select tst.err($$select public.save_step('$$ || :'p1' || $$', '{"A2":{"kind":"multi","values":["refund","not_checked"]}}', 'A3')$$, 'TR:invalid_answer', 'A2: esclusive');
select public.save_step(:'p1', '{"A1":{"kind":"single","value":"fairly"}}', 'A2');
-- ritorno al ramo esperienza: le risposte A diventano non applicabili, Q3–Q9 vanno ridate
select public.save_step(:'p1', '{"Q2":{"kind":"single","value":"yes_once_closed"}}', 'exp_intro');
reset role;
select tst.ok((select status from public.answers where participation_id = :'p1' and question_id = 'A1') = 'not_applicable', 'ritorno al ramo esperienza: A1 non applicabile');
select tst.ok((select status from public.answers where participation_id = :'p1' and question_id = 'A0') = 'not_applicable', 'ritorno al ramo esperienza: A0 non applicabile');
set role authenticated;

select tst.err($$select public.demo_start('$$ || :'p1' || $$', gen_random_uuid(), 'hotel-99', 'cancel', current_date)$$, 'TR:unknown_case', 'caso demo inesistente respinto');
select tst.err($$select public.demo_start('$$ || :'p1' || $$', gen_random_uuid(), 'sport-01', 'change_date', current_date)$$, 'TR:unknown_need', 'esigenza non gestita dal dataset respinta');
select (public.demo_start(:'p1', '22222222-2222-2222-2222-222222222222', 'hotel-01', 'cancel', current_date) ->> 'exploration_id') as e1 \gset
select tst.ok((public.demo_start(:'p1', '22222222-2222-2222-2222-222222222222', 'hotel-01', 'cancel', current_date) ->> 'exploration_id') = :'e1', 'retry demo_start idempotente');

select tst.err($$select public.submit_final('$$ || :'p1' || $$', '$$ || :'e1' || $$', '{"F1a":{"kind":"single","value":"very"},"F1b":{"kind":"single","value":"fairly"},"F2":{"kind":"single","value":"very"},"F3":{"kind":"single","value":"trust"}}')$$, 'TR:demo_not_explored', 'feedback bloccato finché nessun dettaglio è aperto');
select tst.err($$select public.demo_action('$$ || :'p1' || $$', '$$ || :'e1' || $$', 'open_detail', 't-refund')$$, 'TR:unknown_alternative', 'alternativa di un altro caso respinta');
select public.demo_action(:'p1', :'e1', 'open_detail', 'h-cancel-free');
select public.demo_action(:'p1', :'e1', 'open_detail', 'h-cancel-free');
select tst.err($$select public.demo_action('$$ || :'p1' || $$', '$$ || :'e1' || $$', 'provider_click', 'h-cancel-late')$$, 'TR:unknown_alternative', 'passaggio al fornitore solo per alternative pertinenti');
-- seconda esplorazione: F1 si riferisce all'ultima
select (public.demo_start(:'p1', '33333333-3333-3333-3333-333333333333', 'flight-01', 'cancel', current_date) ->> 'exploration_id') as e2 \gset
select public.demo_action(:'p1', :'e2', 'open_detail', 'f-credit');

-- invio con risposte del ramo esperienza mancanti → incompleto
select tst.err($$select public.submit_final('$$ || :'p1' || $$', '$$ || :'e2' || $$', '{"F1a":{"kind":"single","value":"very"},"F1b":{"kind":"single","value":"fairly"},"F2":{"kind":"single","value":"very"},"F3":{"kind":"single","value":"trust"}}')$$, 'TR:incomplete', 'invio finale atomico: nessun completamento con risposte obbligatorie mancanti');
reset role;
select tst.ok((select status from public.participations where id = :'p1') = 'in_progress', 'dopo un invio respinto la partecipazione resta in corso');
select tst.ok(not exists (select 1 from public.answers where participation_id = :'p1' and question_id = 'F2'), 'dopo un invio respinto non resta nessuna risposta parziale di F2');
set role authenticated;

select public.save_step(:'p1', '{"Q3":{"kind":"single","value":"train"},"Q4":{"kind":"single","value":"provider_change"},"Q5":{"kind":"multi","values":["did_not_search"]},"Q6":{"kind":"single","value":"none"},"Q7":{"kind":"single","value":"not_enough_info"},"Q8":{"kind":"multi","values":["did_not_search"]},"Q9":{"kind":"single","value":"still_open"}}', 'O1');
select tst.err($$select public.submit_final('$$ || :'p1' || $$', '$$ || :'e2' || $$', '{"F1a":{"kind":"single","value":"very"},"F2":{"kind":"single","value":"very"},"F3":{"kind":"single","value":"trust"}}')$$, 'TR:incomplete', 'F1b obbligatoria');
select public.submit_final(:'p1', :'e2', '{"F1a":{"kind":"single","value":"very"},"F1b":{"kind":"single","value":"cannot_say"},"F2":{"kind":"single","value":"very"},"F3":{"kind":"single","value":"other"},"F3_other":{"kind":"text","text":"Vorrei sapere chi aggiorna i dati"}}');
select tst.ok((public.submit_final(:'p1', :'e2', '{}') ->> 'already')::boolean, 'doppio invio finale idempotente');
select tst.err($$select public.save_step('$$ || :'p1' || $$', '{"Q9":{"kind":"single","value":"lost"}}', 'O1')$$, 'TR:already_completed', 'nessuna modifica dopo il completamento');
reset role;
select tst.ok((select f1_exploration_id from public.participations where id = :'p1') = :'e2', 'F1 collegata all''ultimo esempio esplorato');
select tst.ok((select count(*) from public.answers where participation_id = :'p1' and question_id in ('F1a','F1b') and status = 'answered') = 2, 'F1a e F1b entrambe salvate');
select tst.ok((select status from public.answers where participation_id = :'p1' and question_id = 'A3') = 'not_applicable', 'domande non applicabili registrate esplicitamente');
select tst.ok((select count(*) from public.events where participation_id = :'p1') = 5, 'eventi chiave registrati una sola volta (started, initial_done, demo_started, demo_explored, feedback_submitted)');
set role authenticated;

\echo '— Email facoltativa'
select tst.err($$select public.subscribe_email('$$ || :'p1' || $$', 'persona@test.example', false, 'consent-v1')$$, 'TR:consent_required', 'iscrizione senza consenso respinta');
select tst.err($$select public.subscribe_email('$$ || :'p1' || $$', 'non-una-email', true, 'consent-v1')$$, 'TR:invalid_email', 'email invalida respinta');
select public.email_screen_shown(:'p1');
select public.subscribe_email(:'p1', '  Persona@Test.example ', true, 'consent-v1');
select tst.ok((public.subscribe_email(:'p1', 'persona@test.example', true, 'consent-v1') ->> 'ok')::boolean, 'retry iscrizione: risposta generica, nessun duplicato');
reset role;
select tst.ok((select count(*) from public.subscription_requests where participation_id = :'p1') = 1, 'una sola richiesta per partecipazione');
select tst.ok((select email_normalized from public.contacts) = 'persona@test.example', 'email normalizzata (spazi esterni e maiuscole), punti e suffissi intatti');

\echo '— Visitatore 2: isolamento'
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', false);
set role authenticated;
select tst.err($$select public.get_participation('$$ || :'p1' || $$')$$, 'TR:not_found', 'un altro visitatore non legge la partecipazione cambiando ID');
select tst.err($$select public.save_step('$$ || :'p1' || $$', '{"Q1":{"kind":"multi","values":["hotel"]}}', 'Q2')$$, 'TR:not_found', 'un altro visitatore non modifica la partecipazione');
select tst.err($$select public.subscribe_email('$$ || :'p1' || $$', 'x@test.example', true, 'consent-v1')$$, 'TR:not_found', 'un altro visitatore non collega email alla partecipazione');
select tst.err($$select public.demo_action('$$ || :'p1' || $$', '$$ || :'e1' || $$', 'choose', 'none')$$, 'TR:not_found', 'un altro visitatore non registra eventi demo altrui');
select tst.err('select count(*) from public.participations', '%permission denied%', 'nessuna lettura diretta della tabella partecipazioni');
select tst.err('select count(*) from public.answers', '%permission denied%', 'nessuna lettura diretta delle risposte');
select tst.err('select count(*) from public.contacts', '%permission denied%', 'nessuna lettura diretta dei contatti');
select tst.err('insert into public.user_roles values (''00000000-0000-0000-0000-0000000000a2'', ''owner'')', '%permission denied%', 'nessuna autoassegnazione di ruoli');
select tst.err('select public.admin_dataset()', 'TR:forbidden', 'visitatore anonimo: dashboard respinta');
select tst.err('select public.admin_contacts()', 'TR:forbidden', 'visitatore anonimo: contatti respinti');
select tst.err('select private.missing_required(gen_random_uuid())', '%permission denied%', 'funzioni interne non invocabili');
select tst.err($$select public.bootstrap_owner('owner@test.example')$$, '%permission denied%', 'bootstrap owner non invocabile dal browser');
select tst.ok((public.admin_whoami() ->> 'role') is null, 'utente anonimo non diventa creator');

-- seconda partecipazione con la stessa email
select (public.start_participation('44444444-4444-4444-4444-444444444444') ->> 'id') as p2 \gset
select public.save_step(:'p2', '{"Q1":{"kind":"multi","values":["concert"]},"Q2":{"kind":"single","value":"dont_remember"},"A0":{"kind":"single","value":"continue"},"A1":{"kind":"single","value":"very"},"A2":{"kind":"multi","values":["dont_remember"]},"A3":{"kind":"single","value":"slightly"},"A4":{"kind":"multi","values":["flexible_fare","insurance"]}}', 'demo_intro');
select (public.demo_start(:'p2', gen_random_uuid(), 'concert-01', 'cancel', current_date) ->> 'exploration_id') as e3 \gset
select public.demo_action(:'p2', :'e3', 'open_detail', 'c-refund');
select public.submit_final(:'p2', :'e3', '{"F1a":{"kind":"single","value":"fairly"},"F1b":{"kind":"single","value":"fairly"},"F2":{"kind":"single","value":"cannot_say"},"F3":{"kind":"single","value":"need_price"}}');
select public.subscribe_email(:'p2', 'PERSONA@test.example', true, 'consent-v1');
reset role;
select tst.ok((select count(*) from public.contacts) = 1 and (select count(*) from public.subscription_requests) = 2, 'stessa email: un contatto, due collegamenti, nessuna sovrascrittura');

\echo '— Anon (chiave pubblica senza sessione)'
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select tst.ok(public.get_public_config() ->> 'mode' = 'test', 'configurazione pubblica leggibile');
select tst.err('select public.start_participation(gen_random_uuid())', '%permission denied%', 'anon senza sessione non avvia partecipazioni');
select tst.err('select public.admin_dataset()', '%permission denied%', 'anon non invoca la dashboard');
reset role;

\echo '— Creator e owner'
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b3', false);
set role authenticated;
select tst.ok((public.admin_whoami() ->> 'role') is null, 'utente autenticato non invitato: nessun ruolo');
select tst.err('select public.admin_dataset()', 'TR:forbidden', 'utente autenticato non creator: dashboard respinta');
select tst.err($$select public.admin_set_mode('research')$$, 'TR:forbidden', 'utente non creator: impostazioni respinte');
reset role;

select public.bootstrap_owner('owner@test.example');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', false);
set role authenticated;
select tst.ok(public.admin_whoami() ->> 'role' = 'owner', 'owner assegnato con procedura amministrativa');
select public.admin_invite_creator(' Crea@Test.example ');
select tst.err($$select public.admin_set_mode('research')$$, 'TR:privacy_incomplete', 'ricerca attiva bloccata con informativa incompleta');
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', false);
set role authenticated;
select tst.ok(public.admin_whoami() ->> 'role' = 'creator', 'creator invitato ottiene il ruolo al primo accesso');
select tst.err($$select public.admin_set_mode('test')$$, 'TR:forbidden', 'creator: cambio modalità riservato all''owner');
select tst.err($$select public.admin_invite_creator('x@test.example')$$, 'TR:forbidden', 'creator: autorizzazioni riservate all''owner');
select tst.ok(jsonb_array_length(public.admin_dataset() -> 'participations') = 0, 'test esclusi per impostazione predefinita');
select tst.ok(jsonb_array_length(public.admin_dataset(null, null, true, true) -> 'participations') = 2, 'test inclusi su richiesta esplicita');
select tst.ok(jsonb_array_length(public.admin_contacts()) = 1, 'contatti visibili al creator');
select public.admin_revoke_contact((select (public.admin_contacts() -> 0 ->> 'id')::uuid), 'Richiesta via email');
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', false);
set role authenticated;
select public.admin_update_config('{"privacy_controller":"Gruppo di test","privacy_contact":"test@test.example","privacy_legal_basis":"Consenso (test)","privacy_retention":"Fino a fine progetto (test)"}');
select public.admin_set_mode('research');
reset role;

\echo '— Visitatore 3: ricerca attiva e contatto revocato'
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a3', false);
set role authenticated;
select (public.start_participation(gen_random_uuid()) ->> 'id') as p3 \gset
select tst.ok(not (public.get_participation(:'p3') ->> 'is_test')::boolean, 'in ricerca attiva la partecipazione è reale');
select public.save_step(:'p3', '{"Q1":{"kind":"multi","values":["flight"]},"Q2":{"kind":"single","value":"yes_many_closed"},"Q3":{"kind":"single","value":"flight"},"Q4":{"kind":"single","value":"prefer_not"},"Q5":{"kind":"multi","values":["ai_tools"]},"Q6":{"kind":"single","value":"lt15"},"Q7":{"kind":"single","value":"very_easy"},"Q8":{"kind":"multi","values":["no_difficulty"]},"Q9":{"kind":"single","value":"voucher"}}', 'demo_intro');
select (public.demo_start(:'p3', gen_random_uuid(), 'train-01', 'other_person', current_date) ->> 'exploration_id') as e4 \gset
select public.demo_action(:'p3', :'e4', 'open_detail', 't-transfer');
select public.demo_action(:'p3', :'e4', 'choose', 'none');
select public.submit_final(:'p3', :'e4', '{"F1a":{"kind":"single","value":"completely"},"F1b":{"kind":"single","value":"very"},"F2":{"kind":"single","value":"extremely"},"F3":{"kind":"single","value":"no_obstacle"}}');
select public.subscribe_email(:'p3', 'persona@test.example', true, 'consent-v1');
reset role;
select tst.ok((select status from public.contacts where email_normalized = 'persona@test.example') = 'revoked', 'nuovo invio non riattiva un contatto revocato');
select tst.ok((select contact_status_at_request from public.subscription_requests where participation_id = :'p3') = 'revoked', 'la nuova richiesta è registrata separatamente');

\echo '— Visitatore 4: mai acquistato personalmente'
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a4', false);
set role authenticated;
select (public.start_participation(gen_random_uuid()) ->> 'id') as p4 \gset
select public.save_step(:'p4', '{"Q1":{"kind":"multi","values":["none"]},"Q2":{"kind":"single","value":"no"},"A0":{"kind":"single","value":"never_purchased"}}', 'demo_intro');
select tst.ok(public.get_participation(:'p4') ->> 'path' = 'never_purchased', 'sottogruppo "mai acquistato" registrato separatamente');
select tst.err($$select public.save_step('$$ || :'p4' || $$', '{"A1":{"kind":"single","value":"little"}}', 'A2')$$, 'TR:not_applicable', 'A1–A4 non applicabili al sottogruppo');
select (public.demo_start(:'p4', gen_random_uuid(), 'sport-01', 'other_person', current_date) ->> 'exploration_id') as e5 \gset
select public.demo_action(:'p4', :'e5', 'open_detail', 's-name-change');
select public.demo_action(:'p4', :'e5', 'provider_click', 's-name-change');
select public.submit_final(:'p4', :'e5', '{"F1a":{"kind":"single","value":"slightly"},"F1b":{"kind":"single","value":"not_at_all"},"F2":{"kind":"single","value":"slightly"},"F3":{"kind":"single","value":"too_rare"}}');
select public.decline_email(:'p4');
reset role;
select tst.ok((select count(*) from public.answers where participation_id = :'p4' and status = 'not_applicable' and question_id in ('A1','A2','A3','A4','O2','Q3','Q9','O1')) = 8, 'mai acquistato: ramo esperienza e alternativo non applicabili');
select tst.ok((select email_screen from public.participations where id = :'p4') = 'declined', 'rifiuto esplicito registrato');
select tst.ok((select status from public.participations where id = :'p4') = 'completed', 'completato senza email');

\echo '— Cancellazione'
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', false);
set role authenticated;
select tst.err($$select public.admin_delete_participation('$$ || :'p2' || $$')$$, 'TR:forbidden', 'creator: cancellazione riservata all''owner');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', false);
set role authenticated;
select public.admin_delete_participation(:'p2');
reset role;
select tst.ok(not exists (select 1 from public.answers where participation_id = :'p2') and not exists (select 1 from public.events where participation_id = :'p2'), 'cancellazione: risposte ed eventi rimossi');
select tst.ok((select count(*) from public.subscription_requests) = 2 and (select count(*) from public.contacts) = 1, 'cancellazione: il contatto collegato ad altre partecipazioni resta');
select tst.ok(exists (select 1 from public.participations where id = :'p1'), 'cancellazione: partecipazioni indipendenti intatte');


\echo '— Lingua inglese'
insert into auth.users (id, email, email_confirmed_at, is_anonymous) values ('00000000-0000-0000-0000-0000000000a5', null, null, true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a5', false);
set role authenticated;
select tst.err($$select public.start_participation(gen_random_uuid(), 'fr')$$, 'TR:bad_request', 'lingua non prevista respinta');
select (public.start_participation(gen_random_uuid(), 'en') ->> 'id') as p5 \gset
select tst.ok(public.get_participation(:'p5') ->> 'language' = 'en', 'lingua inglese registrata dal server');
select public.save_step(:'p5', '{"Q1":{"kind":"multi","values":["flight"]},"Q2":{"kind":"single","value":"no"},"A0":{"kind":"single","value":"never_purchased"}}', 'demo_intro');
select (public.demo_start(:'p5', gen_random_uuid(), 'hotel-01', 'cancel', current_date) ->> 'exploration_id') as e6 \gset
select public.demo_action(:'p5', :'e6', 'open_detail', 'h-cancel-free');
select public.submit_final(:'p5', :'e6', '{"F1a":{"kind":"single","value":"very"},"F1b":{"kind":"single","value":"very"},"F2":{"kind":"single","value":"very"},"F3":{"kind":"single","value":"trust"}}');
select public.subscribe_email(:'p5', 'english@test.example', true, 'consent-v1-en');
reset role;
select tst.ok((select consent_text from public.subscription_requests where participation_id = :'p5') like 'I would like to receive%', 'consenso inglese registrato con il suo testo');
select tst.ok((select count(*) from public.participations where language = 'it') >= 1, 'partecipazioni senza lingua indicata restano in italiano');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', false);
set role authenticated;
select tst.ok(exists (select 1 from jsonb_array_elements(public.admin_dataset(null, null, true, true) -> 'participations') x where x ->> 'language' = 'en'), 'la dashboard riceve la lingua');
reset role;

\echo 'TUTTI I TEST SQL SUPERATI'
