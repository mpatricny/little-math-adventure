# Číslokraj pilot 0.1.2

Oprava vydání z 22. 9. 2026. Navazuje na herní změny v
[pilotu 0.1.1](pilot-0.1.1.md); herní kód se proti němu nemění.

## Opravené vydávací problémy

- Cloudflare předává handleru jako třetí parametr `ExecutionContext`. Přímý
  export testovatelného handleru jej omylem použil jako funkci `fetch`, takže
  `/v1/*` a `/api/*` končily chybou 1101. Produkční vstup nyní kontext odděluje.
- Landing nenabízí přihlášení, pokud API danou funkci zatím neposkytuje nebo
  je nedostupné. Vstup do hry zůstává viditelný. Odpověď 401 z připraveného
  backendu zobrazí přihlášení, úspěšná odpověď přihlášený stav.

## Ověření

- Regresní test skutečného podpisu Worker handleru před opravou reprodukoval
  `TypeError: fetcher is not a function`; po opravě prošlo všech šest testů proxy.
- `npm run test:landing`: desktop/tablet, stavy tlačítek, přihlášení/odhlášení
  a nedostupnost API (404, 503, síťová chyba). Vstup do hry zůstává funkční.
- Produkční build a kontrola limitů Cloudflare prošly (326 statických souborů).
- Přes Playwright MCP ověřena skrytá nedostupná nabídka a žádný vodorovný
  overflow. Prohlédnuty `artifacts/releases/pilot-0.1.2/landing-desktop.png`
  a `landing-tablet.png`. Změna nepřidává žádný text ani nové herní UI;
  platí [UI pro nečtenáře](../UI_PRE_READER_GATES.md).
- Živá hra 0.1.1 po nasazení prošla načtením menu na desktopu/tabletu a vstupem
  do výběru postavy, bez chyb JavaScriptu a chybějících souborů. Snímky jsou
  v `artifacts/releases/pilot-0.1.1/`; stejné herní soubory zůstávají v 0.1.2.

## Oddělený stav API

Produkční API zůstává na dřívějším funkčním zdroji. Nasazení aktuálního `server/`
zastavil pre-deploy krok ještě před migracemi: v produkci chybí `BETTER_AUTH_URL`,
`BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID` a `GOOGLE_CLIENT_SECRET`. Ani Doppler
`cislokraj/prd`, ani `dev` dosud OAuth údaje neobsahují. Nevytvářet zástupná
tajemství ani nepovažovat samotný zdravý `/ready` za ověření přihlášení.

Při synchronizaci release metadata Doppler znovu nasadil původní API pod ID
`f45908e4-8c43-44f5-b2c2-678293abce86`; tento běh je zdravý a hlásí
`APP_RELEASE=pilot-0.1.1`. To není důkaz nasazení aktuálního zdrojového kódu API.
Vrácení tohoto označení na 0.1.0 nebylo provedeno: automatická kontrola odmítla
změnu, protože synchronizace spouští další deployment. Žádná SQL migrace ani
uživatelský save se během tohoto pokusu nezměnily.

Dokončení OAuth vyžaduje skutečného Google klienta s callbackem
`https://cislokraj.cz/api/auth/callback/google`, tajemství v Doppleru a
`BETTER_AUTH_URL=https://cislokraj.cz` v konfiguraci Railway; postup je v
[infrastruktuře](../INFRASTRUCTURE.md). Potom lze nasadit API z vydaného tagu,
zkontrolovat migrace, `/ready` a přihlášení. Hra na tomto dokončení nezávisí.
