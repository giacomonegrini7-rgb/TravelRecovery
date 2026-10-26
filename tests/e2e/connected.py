"""Percorso end-to-end in modalità collegata (gateway di test + funzioni SQL reali).

Verifica: modalità test dichiarata, doppio clic su «Inizia» senza duplicati, perdita di rete
con errore recuperabile e nessun falso successo, ripresa dopo refresh, invio finale, email,
due partecipazioni indipendenti, accesso negato alla dashboard per visitatori, login creator,
dati reali nella dashboard (test esclusi per impostazione predefinita) e logout.
"""
import re
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1]
OUT = Path(sys.argv[2]); OUT.mkdir(parents=True, exist_ok=True)
API = "http://127.0.0.1:54321"


def ok(m):
    print("ok ", m)


def cont(page):
    page.get_by_role("button", name="Continua", exact=True).click()


def pick(page, label):
    page.locator("label.choice", has_text=label).first.click()


def full_never_path(page, email: str | None):
    pick(page, "Nessuno di questi"); cont(page)
    pick(page, "No, non mi è mai capitato"); cont(page)
    page.locator("label.secondary-choice").click(); cont(page)
    page.get_by_role("button", name="Prova la demo").click()
    page.locator(".cat-card", has_text="Treni").click()
    page.get_by_role("button", name="Usa una prenotazione di esempio").click()
    page.locator(".need-card", has_text="Farla usare").click()
    page.get_by_role("button", name="Mostra le alternative").click()
    page.locator(".alt-card").first.get_by_role("button", name=re.compile("Dettagli")).click()
    page.wait_for_timeout(400)
    page.get_by_role("button", name="Passa alle domande finali").click()
    b = page.locator(".f1-block")
    b.nth(0).locator("label.choice", has_text="Poco chiaro").click()
    b.nth(1).locator("label.choice", has_text="Abbastanza chiaro").click()
    cont(page)
    pick(page, "Molto utile"); cont(page)
    pick(page, "Dovrei conoscere il prezzo")
    page.get_by_role("button", name="Invia le risposte").click()
    expect(page.get_by_text("Le tue risposte sono state inviate.")).to_be_visible()
    if email:
        page.get_by_label("Il tuo indirizzo email").fill(email)
        page.locator("label.consent").click()
        page.get_by_role("button", name="Avvisami al lancio").click()
        expect(page.get_by_text("La tua richiesta è stata registrata")).to_be_visible()
    else:
        page.get_by_role("button", name="No grazie, termina").click()
        expect(page.get_by_text("Grazie per il tuo contributo!")).to_be_visible()


with sync_playwright() as pw:
    browser = pw.chromium.launch()

    # ——— Visitatore 1 ———
    ctx = browser.new_context(viewport={"width": 390, "height": 844})
    page = ctx.new_page()
    page.goto(BASE + "/")
    expect(page.get_by_text("Modalità test: le risposte sono salvate come prova")).to_be_visible()
    ok("modalità test dichiarata dal server")
    page.get_by_role("button", name="Inizia").dblclick()
    expect(page.get_by_role("heading", name=re.compile("Negli ultimi 12 mesi"))).to_be_visible()
    pick(page, "Voli"); cont(page)

    # perdita di rete al salvataggio di Q2
    state = {"fail": True}
    def flaky(route):
        if state["fail"]:
            state["fail"] = False
            route.abort("internetdisconnected")
        else:
            route.continue_()
    page.route("**/rest/v1/rpc/save_step", flaky)
    pick(page, "Sì, una volta, ma la situazione si è conclusa"); cont(page)
    expect(page.get_by_text("Connessione non riuscita")).to_be_visible()
    expect(page.get_by_role("heading", name=re.compile("Ti è mai capitato"))).to_be_visible()
    page.screenshot(path=str(OUT / "c-network-error.png"), full_page=True)
    ok("rete assente: errore recuperabile, nessun avanzamento né falso successo")
    page.get_by_role("button", name="Riprova").click()
    expect(page.get_by_role("heading", name="Pensa a un episodio preciso")).to_be_visible()
    ok("Riprova completa il salvataggio")
    page.unroute("**/rest/v1/rpc/save_step")
    cont(page)
    pick(page, "Treno"); cont(page)

    # refresh: ripresa dallo step salvato
    page.reload()
    expect(page.get_by_role("heading", name=re.compile("Che cosa aveva reso necessario"))).to_be_visible()
    ok("ripresa dopo il refresh nello stesso browser")
    pick(page, "Altro"); cont(page)
    pick(page, "Assistenza clienti"); cont(page)
    pick(page, "Meno di 15 minuti"); cont(page)
    pick(page, "Molto difficile"); cont(page)
    pick(page, "Ottenere una risposta chiara"); cont(page)
    pick(page, "Ho ottenuto un rimborso parziale"); cont(page)
    page.get_by_label("La tua risposta").fill("Il sito diceva una cosa,\nl'assistenza un'altra.")
    cont(page)
    # cambio di percorso tornando a Q2: le risposte del ramo esperienza diventano non applicabili
    for _ in range(10):
        if page.get_by_role("heading", name=re.compile("Ti è mai capitato")).count():
            break
        page.get_by_role("button", name="Indietro").click()
    pick(page, "Non ricordo"); cont(page)
    cont(page)  # A0 = continua
    pick(page, "Molto"); cont(page)
    pick(page, "Quali costi o penali fossero previsti"); cont(page)
    pick(page, "Abbastanza chiare"); cont(page)
    pick(page, "Ho aspettato di essere più sicuro"); cont(page)
    cont(page)
    page.get_by_role("button", name="Prova la demo").click()
    page.locator(".cat-card", has_text="Voli").click()
    page.get_by_role("button", name="Usa una prenotazione di esempio").click()
    page.locator(".need-card", has_text="Rinunciare").click()
    page.get_by_role("button", name="Mostra le alternative").click()
    page.locator(".alt-card").nth(1).get_by_role("button", name=re.compile("Dettagli")).click()
    page.locator(".alt-card").nth(1).get_by_role("button", name="Scegli questa").click()
    page.get_by_role("button", name=re.compile("Vai alla procedura del fornitore")).first.click()
    page.get_by_role("button", name="Torna alle alternative").click()
    page.get_by_role("button", name="Passa alle domande finali").click()
    b = page.locator(".f1-block")
    b.nth(0).locator("label.choice", has_text="Del tutto chiaro").click()
    b.nth(1).locator("label.choice", has_text="Molto chiaro").click()
    cont(page)
    pick(page, "Estremamente utile"); cont(page)
    pick(page, "Nessun ostacolo particolare")
    btn = page.get_by_role("button", name="Invia le risposte")
    btn.dblclick()
    expect(page.get_by_text("Le tue risposte sono state inviate.")).to_be_visible()
    page.get_by_role("button", name="Avvisami al lancio").click()
    expect(page.get_by_text("seleziona la casella del consenso").first).to_be_visible()
    page.get_by_label("Il tuo indirizzo email").fill("  Persona.Test+tr@Esempio.it ")
    page.locator("label.consent").click()
    page.get_by_role("button", name="Avvisami al lancio").dblclick()
    expect(page.get_by_text("La tua richiesta è stata registrata")).to_be_visible()
    ok("visitatore 1 completato con email")
    # un visitatore non può usare la dashboard dal browser
    r = page.evaluate("""async (api) => {
      const s = JSON.parse(localStorage.getItem('tr.participant.session'));
      const res = await fetch(api + '/rest/v1/rpc/admin_dataset', {method: 'POST', headers: {apikey: 'test-anon-key', Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json'}, body: '{}'});
      return [res.status, await res.text()];
    }""", API)
    assert r[0] >= 400 and "forbidden" in r[1], r
    ok("visitatore: API della dashboard respinta")
    pid1 = page.evaluate("JSON.parse(localStorage.getItem('tr.public.v1')).pid")
    ctx.close()

    # ——— Visitatore 2: indipendente, stessa email ———
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    page.goto(BASE + "/")
    page.get_by_role("button", name="Inizia").click()
    expect(page.get_by_role("heading", name=re.compile("Negli ultimi 12 mesi"))).to_be_visible()
    r = page.evaluate("""async ([api, pid]) => {
      const s = JSON.parse(localStorage.getItem('tr.participant.session'));
      const res = await fetch(api + '/rest/v1/rpc/get_participation', {method: 'POST', headers: {apikey: 'test-anon-key', Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json'}, body: JSON.stringify({p_id: pid})});
      return [res.status, await res.text()];
    }""", [API, pid1])
    assert r[0] >= 400 and "not_found" in r[1], r
    ok("visitatore 2 non legge la partecipazione del visitatore 1 conoscendone l’ID")
    full_never_path(page, "persona.test+tr@esempio.it")
    ctx.close()

    # ——— Visitatore 3: senza email ———
    ctx = browser.new_context(viewport={"width": 768, "height": 1024})
    page = ctx.new_page()
    page.goto(BASE + "/")
    page.get_by_role("button", name="Inizia").click()
    expect(page.get_by_role("heading", name=re.compile("Negli ultimi 12 mesi"))).to_be_visible()
    full_never_path(page, None)
    ok("completamento senza email non bloccato")
    ctx.close()

    # ——— Creator ———
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True)
    page = ctx.new_page()
    page.on("pageerror", lambda e: print("PAGEERROR", e))
    page.on("console", lambda m: print("CONSOLE", m.text) if m.type == "error" else None)
    page.goto(BASE + "/admin")
    page.get_by_label("Email").fill("owner@test.example")
    page.get_by_label("Password").fill("sbagliata")
    page.get_by_role("button", name="Accedi").click()
    expect(page.locator(".alert-error")).to_be_visible()
    page.get_by_label("Password").fill("password-owner-1")
    page.get_by_role("button", name="Accedi").click()
    expect(page.get_by_role("heading", name="Ancora nessuna partecipazione")).to_be_visible()
    ok("dashboard: test esclusi per impostazione predefinita, nessun dato simulato")
    page.locator(".filters select").nth(3).select_option("test")
    expect(page.get_by_role("heading", name="Statistiche")).to_be_visible()
    kpis = page.locator(".kpi")
    expect(kpis.nth(0)).to_contain_text("3")
    expect(kpis.nth(1)).to_contain_text("3")
    expect(kpis.nth(4)).to_contain_text("2")
    expect(kpis.nth(7)).to_contain_text("1")
    ok("dashboard: KPI calcolati sui dati reali (3 avviate, 3 completate, 2 iscrizioni, 1 email unica)")
    page.screenshot(path=str(OUT / "c-admin-stats.png"), full_page=True)
    with page.expect_download() as d:
        page.get_by_role("button", name="CSV partecipazioni").click()
    csv = Path(d.value.path()).read_text(encoding="utf-8-sig")
    assert "persona.test+tr@esempio.it" not in csv and "'=" not in csv
    assert "Il sito diceva" not in csv  # O1 del ramo abbandonato non incluso
    assert "Non applicabile" in csv
    ok("CSV: email escluse, risposte del ramo abbandonato non incluse")
    page.get_by_role("link", name="Partecipazioni").click()
    page.locator(".p-row").first.click()
    expect(page.get_by_text("Riepilogo dei fatti raccolti")).to_be_visible()
    page.screenshot(path=str(OUT / "c-admin-report.png"), full_page=True)
    page.get_by_role("link", name="Contatti").click()
    expect(page.get_by_text("Nessun contatto corrisponde ai filtri")).to_be_visible()
    page.get_by_label(re.compile("includi richieste da partecipazioni di test")).check()
    expect(page.locator(".contact")).to_have_count(1)
    ok("contatti: un contatto unico per due partecipazioni")
    page.get_by_role("button", name="Esci").click()
    expect(page.get_by_role("heading", name="Accedi all’area creator")).to_be_visible()
    page.goto(BASE + "/admin/partecipazioni")
    expect(page.get_by_role("heading", name="Accedi all’area creator")).to_be_visible()
    ok("logout e accesso diretto a /admin/partecipazioni respinto")
    ctx.close()
    browser.close()
print("PERCORSO COLLEGATO SUPERATO")
