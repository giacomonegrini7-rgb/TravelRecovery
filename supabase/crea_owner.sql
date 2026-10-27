-- Travel Recovery: assegna il ruolo di OWNER al vostro account.
-- 1) Prima create l'utente in Authentication → Users → Add user (con "Auto Confirm User").
-- 2) Sostituite l'email qui sotto con quella dell'utente creato, poi premete Run.
select public.bootstrap_owner('SCRIVI-QUI-LA-TUA-EMAIL@esempio.it');
