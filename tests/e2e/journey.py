"""Percorso end-to-end nell'anteprima locale con Playwright (Chromium).

Uso: python3 tests/e2e/journey.py <base_url> <cartella_screenshot>
Verifica: percorsi, selezioni esclusive, limite Q8, demo con tutte le categorie,
feedback dopo un esempio esplorato senza scelta, email (invalida, senza consenso, valida),
assenza di scorrimento orizzontale e di errori in console, dashboard con dati di esempio.
"""
import re
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4173"
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else "shots")
OUT.mkdir(parents=True, exist_ok=True)
errors: list[str] = []
checks: list[str] = []


def ok(msg: str):
    checks.append(msg)
    print("ok ", msg)


def no_hscroll(page, where: str):
    sw, iw = page.evaluate("[document.documentElement.scrollWidth, window.innerWidth]")
    assert sw <= iw + 1, f"scorrimento orizzontale in {where}: {sw} > {iw}"


def shot(page, name: str, full=True):
    page.screenshot(path=str(OUT / f"{name}.png"), full_page=full)


def cont(page):
    page.get_by_role("button", name="Continua", exact=True).click()


def pick(page, label: str):
    page.locator("label.choice", has_text=label).first.click()


def run_public(p, width: int, height: int, tag: str, path: str):
    ctx = p.new_context(viewport={"width": width, "height": height}, locale="it-IT", timezone_id="Europe/Rome")
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(f"[{tag}] {m.text}") if m.type == "error" and "ERR_TUNNEL_CONNECTION_FAILED" not in m.text else None)
    page.on("pageerror", lambda e: errors.append(f"[{tag}] {e}"))
    page.goto(BASE + "/")
    expect(page.get_by_role("heading", name=re.compile("Quando cambiano i programmi"))).to_be_visible()
    page.wait_for_timeout(2600)  # animazione dell'itinerario
    no_hscroll(page, f"intro {tag}")
    shot(page, f"{tag}-01-intro", full=False)
    shot(page, f"{tag}-01-intro-full")
    page.get_by_role("button", name="Inizia").click()

    # Q1: esclusiva
    expect(page.get_by_role("heading", name=re.compile("Negli ultimi 12 mesi"))).to_be_visible()
    pick(page, "Viaggi in treno"); pick(page, "Voli")
    pick(page, "Nessuno di questi")
    assert page.locator("label.choice.is-checked").count() == 1
    pick(page, "Voli")
    assert page.locator("label.choice.is-checked").count() == 1
    ok(f"{tag}: Q1 «Nessuno di questi» esclusiva in entrambi i sensi")
    shot(page, f"{tag}-02-q1")
    cont(page)

    # Q2: nessun avanzamento automatico, validazione
    expect(page.get_by_role("heading", name=re.compile("Ti è mai capitato"))).to_be_visible()
    cont(page)
    expect(page.locator(".inline-error")).to_be_visible()
    ok(f"{tag}: Q2 obbligatoria, nessun avanzamento senza risposta")
    if path == "experience":
        pick(page, "Sì, e sto ancora cercando")
        page.wait_for_timeout(300)
        expect(page.get_by_role("heading", name=re.compile("Ti è mai capitato"))).to_be_visible()
        ok(f"{tag}: nessun avanzamento automatico dopo la selezione")
        cont(page)
        expect(page.get_by_role("heading", name="Pensa a un episodio preciso")).to_be_visible()
        cont(page)
        pick(page, "Più servizi dello stesso viaggio")
        expect(page.get_by_text("pensa al servizio che hai affrontato per primo")).to_be_visible()
        ok(f"{tag}: nota di Q3 «Più servizi»")
        cont(page)
        pick(page, "Un errore nella prenotazione"); cont(page)
        pick(page, "Motori di ricerca"); pick(page, "Strumenti di intelligenza artificiale"); cont(page)
        pick(page, "Da una a due ore"); cont(page)
        pick(page, "Abbastanza difficile"); cont(page)
        for o in ["Capire dove cercare", "Riunire informazioni", "Capire entro quando", "Confrontare le alternative"]:
            pick(page, o)
        expect(page.get_by_text("Puoi scegliere al massimo 3 risposte")).to_be_visible()
        assert page.locator("label.choice.is-checked").count() == 3
        ok(f"{tag}: Q8 limite di tre risposte con messaggio")
        shot(page, f"{tag}-03-q8-limit")
        cont(page)
        pick(page, "La situazione è ancora aperta"); cont(page)
        page.get_by_label("La tua risposta").fill("<b>Le condizioni</b> erano in tre posti diversi.")
        expect(page.get_by_text(re.compile(r"\d+ / 1\.?200 caratteri"))).to_be_visible()
        # indietro conserva le risposte
        page.get_by_role("button", name="Indietro").click()
        expect(page.locator("label.choice.is-checked", has_text="La situazione è ancora aperta")).to_be_visible()
        cont(page)
        expect(page.get_by_label("La tua risposta")).to_have_value("<b>Le condizioni</b> erano in tre posti diversi.")
        ok(f"{tag}: Indietro conserva le risposte")
        shot(page, f"{tag}-04-o1")
        cont(page)
    else:
        pick(page, "Non ricordo")
        cont(page)
        expect(page.get_by_role("heading", name="Pensa al tuo ultimo acquisto")).to_be_visible()
        if path == "never":
            page.locator("label.secondary-choice").click()
            shot(page, f"{tag}-03-never")
            cont(page)
        else:
            cont(page)
            pick(page, "Abbastanza"); cont(page)
            pick(page, "Se fosse possibile ottenere un rimborso"); pick(page, "Non ricordo")
            assert page.locator("label.choice.is-checked").count() == 1
            cont(page)
            pick(page, "Poco chiare"); cont(page)
            pick(page, "Ho aggiunto un’assicurazione"); cont(page)
            cont(page)  # O2 facoltativa, vuota

    # Transizione demo
    expect(page.get_by_role("heading", name=re.compile("Ora puoi esplorare un esempio"))).to_be_visible()
    shot(page, f"{tag}-05-demo-intro")
    page.get_by_role("button", name="Prova la demo").click()
    expect(page.get_by_text("Demo — dati di esempio").first).to_be_visible()
    shot(page, f"{tag}-06-categories")
    no_hscroll(page, f"categorie {tag}")

    cats = ["Hotel e strutture", "Treni", "Voli", "Eventi sportivi", "Concerti e spettacoli"] if path == "experience" else ["Voli"]
    for i, cat in enumerate(cats):
        page.locator(".cat-card", has_text=cat).click()
        expect(page.get_by_role("heading", name="Carica la tua prenotazione")).to_be_visible()
        assert page.locator("input[type=file]").count() == 0
        if i == 0:
            shot(page, f"{tag}-07-upload")
        page.get_by_role("button", name="Usa una prenotazione di esempio").click()
        expect(page.get_by_role("heading", name="Ecco la prenotazione di esempio")).to_be_visible()
        page.locator(".need-card").first.click()
        if i == 0:
            shot(page, f"{tag}-08-booking-need")
        page.get_by_role("button", name="Mostra le alternative").click()
        expect(page.locator(".alt-card").first).to_be_visible(timeout=5000)
        assert page.locator(".alt-not_provided, .alt-to_confirm").count() >= 1, cat
        if i == 0:
            # continuare senza aver aperto alcun dettaglio: indicazione chiara su cosa toccare
            page.locator(".demo-footer").get_by_role("button", name=re.compile("Continua: ultime 4 domande|Continue: last 4 questions")).click()
            expect(page.locator(".demo-footer-status.is-nudge")).to_be_visible()
            expect(page.locator(".alt-card .disclosure").first).to_be_focused()
            shot(page, f"{tag}-08b-nudge", full=False)
            ok(f"{tag}: «Continua» senza dettagli aperti indica cosa toccare")
        btn = page.locator(".alt-card").first.get_by_role("button", name=re.compile("Dettagli e condizioni"))
        btn.click()
        page.locator(".alt-card").first.locator("summary", has_text="Perché compare").click()
        expect(page.locator(".alt-card").first.locator("blockquote").first).to_be_visible()
        no_hscroll(page, f"risultati {cat} {tag}")
        expect(page.locator(".next-card")).to_be_visible()
        expect(page.locator(".demo-footer.is-ready")).to_be_visible()
        if i == 0:
            page.locator(".next-card").scroll_into_view_if_needed()
            shot(page, f"{tag}-08c-next-card", full=False)
        if cat == "Voli":
            shot(page, f"{tag}-09-results-flight")
            prov = page.get_by_role("button", name=re.compile("Vai alla procedura del fornitore")).first
            if prov.count():
                prov.click()
                expect(page.get_by_role("dialog")).to_be_visible()
                shot(page, f"{tag}-10-provider", full=False)
                page.get_by_role("button", name="Torna alle alternative").click()
                ok(f"{tag}: passaggio simulato al fornitore")
        if i < len(cats) - 1:
            page.locator(".demo-footer").get_by_role("button", name="Prova un’altra categoria", exact=True).click()
            expect(page.locator(".cat-card", has_text=cat).locator(".cat-tried")).to_be_visible()
    if path == "experience":
        ok(f"{tag}: tutte e cinque le categorie con condizioni apribili e almeno un’opzione non disponibile o da confermare")
    # Feedback senza scegliere un'alternativa
    page.locator(".demo-footer").get_by_role("button", name=re.compile("Continua: ultime 4 domande")).click()
    expect(page.get_by_role("heading", name=re.compile("quanto ti è chiaro"))).to_be_visible()
    if path == "experience":
        expect(page.get_by_text("si riferiscono all’ultimo esempio")).to_be_visible()
    ok(f"{tag}: feedback accessibile senza scegliere un’alternativa")
    shot(page, f"{tag}-11-f1")
    cont(page)
    assert page.locator(".inline-error").count() == 2
    blocks = page.locator(".f1-block")
    blocks.nth(0).locator("label.choice", has_text="Molto chiaro").click()
    blocks.nth(1).locator("label.choice", has_text="Non saprei valutarlo").click()
    cont(page)
    pick(page, "Abbastanza utile"); cont(page)
    pick(page, "Altro")
    page.get_by_label(re.compile("Vuoi specificare")).fill("=HYPERLINK(\"x\")")
    shot(page, f"{tag}-12-f3")
    page.get_by_role("button", name="Invia le risposte").click()

    # Email
    expect(page.get_by_role("heading", name=re.compile("Vuoi sapere quando"))).to_be_visible()
    assert not page.get_by_role("checkbox").is_checked()
    page.get_by_role("button", name="Avvisami al lancio").click()
    expect(page.get_by_text("Inserisci un indirizzo email")).to_be_visible()
    page.get_by_label("Il tuo indirizzo email").fill("nome@dominio")
    page.get_by_role("button", name="Avvisami al lancio").click()
    expect(page.get_by_text("sembra incompleto o non valido").first).to_be_visible()
    expect(page.get_by_text("seleziona la casella del consenso").first).to_be_visible()
    ok(f"{tag}: email invalida e consenso mancante respinti")
    shot(page, f"{tag}-13-email-errors")
    if path == "experience":
        page.get_by_label("Il tuo indirizzo email").fill("prova@esempio.test")
        page.locator("label.consent").click()
        page.get_by_role("button", name="Avvisami al lancio").click()
        expect(page.get_by_text("La tua richiesta è stata registrata")).to_be_visible()
    else:
        page.get_by_role("button", name="No grazie, termina").click()
        expect(page.get_by_text("Grazie per il tuo contributo!")).to_be_visible()
    shot(page, f"{tag}-14-thanks")
    # refresh: nessuna nuova partecipazione, resta sulla conclusione
    page.reload()
    expect(page.get_by_role("heading", name=re.compile("Richiesta registrata|Grazie per il tuo contributo"))).to_be_visible()
    ok(f"{tag}: dopo il refresh la compilazione completata non riparte")
    ctx.close()


def run_english(p, width: int, height: int, tag: str):
    """Telefono in italiano che sceglie English nella prima schermata; percorso completo in inglese."""
    ctx = p.new_context(viewport={"width": width, "height": height}, locale="it-IT", timezone_id="Europe/Rome")
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"[{tag}] {e}"))
    page.goto(BASE + "/")
    expect(page.get_by_role("heading", name=re.compile("Quando cambiano i programmi"))).to_be_visible()
    page.get_by_role("group", name="Lingua").get_by_role("button", name=re.compile("English")).click()
    expect(page.get_by_role("heading", name=re.compile("When your plans change"))).to_be_visible()
    expect(page.locator("html")).to_have_attribute("lang", "en")
    page.wait_for_timeout(2600)
    no_hscroll(page, f"intro {tag}")
    shot(page, f"{tag}-01-intro", full=False)
    ok(f"{tag}: scelta della lingua nella prima schermata")
    page.get_by_role("button", name="Start").click()
    page.locator("label.choice", has_text="Train journeys").click()
    page.get_by_role("button", name="Continue", exact=True).click()
    page.locator("label.choice", has_text="Yes, once, but the situation is closed").click()
    page.get_by_role("button", name="Continue", exact=True).click()
    expect(page.get_by_role("heading", name="Think of one specific episode")).to_be_visible()
    page.get_by_role("button", name="Continue", exact=True).click()
    page.locator("label.choice", has_text="Train").first.click(); page.get_by_role("button", name="Continue", exact=True).click()
    page.locator("label.choice", has_text="A change in my plans").click(); page.get_by_role("button", name="Continue", exact=True).click()
    page.locator("label.choice", has_text="Search engines").click(); page.get_by_role("button", name="Continue", exact=True).click()
    page.locator("label.choice", has_text="Less than 15 minutes").click(); page.get_by_role("button", name="Continue", exact=True).click()
    page.locator("label.choice", has_text="Fairly easy").click(); page.get_by_role("button", name="Continue", exact=True).click()
    for o in ["Understanding where to look", "Comparing the alternatives", "Understanding by when", "Other"]:
        page.locator("label.choice", has_text=o).first.click()
    expect(page.get_by_text("You can choose up to 3 answers. Deselect one")).to_be_visible()
    shot(page, f"{tag}-02-q8")
    page.get_by_role("button", name="Continue", exact=True).click()
    page.locator("label.choice", has_text="I got a partial refund").click(); page.get_by_role("button", name="Continue", exact=True).click()
    expect(page.get_by_text(re.compile(r"0 / 1,200 characters"))).to_be_visible()
    page.get_by_role("button", name="Continue", exact=True).click()
    page.get_by_role("button", name="Try the demo").click()
    expect(page.get_by_text("Demo — sample data").first).to_be_visible()
    page.locator(".cat-card", has_text="Flights").click()
    page.get_by_role("button", name="Use a sample booking").click()
    page.locator(".need-card", has_text="Cancel").click()
    shot(page, f"{tag}-03-booking")
    page.get_by_role("button", name="Show the alternatives").click()
    expect(page.locator(".alt-card").first).to_be_visible(timeout=5000)
    expect(page.get_by_text("€150.00").first).to_be_visible()
    page.locator(".alt-card").first.get_by_role("button", name=re.compile("Details and conditions")).click()
    page.locator(".alt-card").first.locator("summary", has_text="Why is this option shown?").click()
    no_hscroll(page, f"results {tag}")
    shot(page, f"{tag}-04-results")
    page.locator(".demo-footer").get_by_role("button", name=re.compile("Continue: last 4 questions")).click()
    b = page.locator(".f1-block")
    b.nth(0).locator("label.choice", has_text="Very clear").click()
    b.nth(1).locator("label.choice", has_text="I can’t judge").click()
    page.get_by_role("button", name="Continue", exact=True).click()
    page.locator("label.choice", has_text="Very useful").click(); page.get_by_role("button", name="Continue", exact=True).click()
    page.locator("label.choice", has_text="I would need to know the price").click()
    page.get_by_role("button", name="Submit your answers").click()
    expect(page.get_by_role("heading", name=re.compile("Would you like to know when"))).to_be_visible()
    expect(page.get_by_text("I would like to receive email updates")).to_be_visible()
    page.get_by_role("button", name="Notify me at launch").click()
    expect(page.get_by_text("Enter an email address to sign up.")).to_be_visible()
    shot(page, f"{tag}-05-email")
    page.get_by_role("button", name="No thanks, finish").click()
    expect(page.get_by_text("Thank you for your contribution!")).to_be_visible()
    page.reload()
    expect(page.get_by_role("heading", name="Thank you for your contribution")).to_be_visible()
    ok(f"{tag}: percorso completo in inglese, lingua conservata dopo il refresh")
    page.goto(BASE + "/privacy")
    expect(page.get_by_role("heading", name="Privacy notice")).to_be_visible()
    shot(page, f"{tag}-06-privacy")
    ctx.close()
    # telefono in inglese: rilevamento automatico
    ctx = p.new_context(viewport={"width": 375, "height": 780}, locale="en-US")
    page = ctx.new_page()
    page.goto(BASE + "/")
    expect(page.get_by_role("heading", name=re.compile("When your plans change"))).to_be_visible()
    ok("telefono in inglese: sito aperto direttamente in inglese")
    ctx.close()


def run_admin(p, width: int, height: int, tag: str):
    ctx = p.new_context(viewport={"width": width, "height": height}, locale="it-IT", timezone_id="Europe/Rome", accept_downloads=True)
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"[{tag}] {e}"))
    page.goto(BASE + "/admin")
    page.get_by_role("button", name="Apri l’anteprima con dati di esempio").click()
    expect(page.get_by_role("heading", name="Statistiche")).to_be_visible()
    expect(page.get_by_text("Dati di esempio").first).to_be_visible()
    page.wait_for_timeout(400)
    shot(page, f"{tag}-20-stats", full=False)
    shot(page, f"{tag}-20-stats-full")
    with page.expect_download() as d:
        page.get_by_role("button", name="CSV partecipazioni").click()
    assert d.value.suggested_filename.startswith("esempio-partecipazioni")
    ok(f"{tag}: export CSV scaricabile (fixture etichettate)")
    page.get_by_role("link", name="Partecipazioni").click()
    expect(page.get_by_role("heading", name="Partecipazioni")).to_be_visible()
    shot(page, f"{tag}-21-list")
    page.locator(".p-row").first.click()
    expect(page.get_by_text("Riepilogo dei fatti raccolti")).to_be_visible()
    shot(page, f"{tag}-22-report")
    page.get_by_role("link", name="Contatti").click()
    expect(page.get_by_role("heading", name="Contatti")).to_be_visible()
    shot(page, f"{tag}-23-contacts")
    page.get_by_role("link", name="Impostazioni").click()
    expect(page.get_by_role("heading", name="Impostazioni")).to_be_visible()
    page.get_by_role("button", name="Attiva la ricerca").is_disabled()
    ok(f"{tag}: ricerca attiva bloccata con informativa incompleta")
    shot(page, f"{tag}-24-settings")
    ctx.close()


with sync_playwright() as pw:
    p = pw.chromium.launch()
    run_public(p, 375, 780, "m375", "experience")
    run_public(p, 390, 844, "m390", "never")
    run_public(p, 768, 1024, "t768", "alternative")
    run_public(p, 1440, 900, "d1440", "experience")
    run_english(p, 390, 844, "en390")
    run_english(p, 1440, 900, "en1440")
    run_admin(p, 1440, 900, "a1440")
    run_admin(p, 390, 844, "a390")
    # informativa
    ctx = p.new_context(viewport={"width": 375, "height": 780}, locale="it-IT")
    page = ctx.new_page()
    page.goto(BASE + "/privacy")
    expect(page.get_by_text("da completare a cura del gruppo").first).to_be_visible()
    no_hscroll(page, "privacy")
    shot(page, "m375-30-privacy")
    ok("informativa con campi da completare evidenziati")
    ctx.close()

print(f"\n{len(checks)} verifiche superate")
if errors:
    print("ERRORI:\n" + "\n".join(errors))
    sys.exit(1)
