# pilot-0.1.13 — odolnější načítání na slabším internetu

## Oprava

- Selhání `fetch`, timeout a přerušené tělo odpovědi už nevynechají druhý
  pokus s `cache: reload`. Stejný pokus opravuje i odpověď 304 bez těla,
  částečný zvuk nebo chybnou HTTP cache. Oba pokusy jsou omezené; špatná
  délka nebo SHA-256 stále brání přijetí jiné verze či HTML místo assetu.
- Velké soubory nejsou automaticky přerušované po 20 sekundách. Deadline
  je 20 s + 1 s na započatých 128 KiB, nejvýše 120 s na jeden pokus.
- Výběr postavy a počítání připravují příběh a místo přistání před městem
  a arénou. Během příběhu má první scéna se Zyxem a raketou nejvyšší prioritu.
  Omezení dvou přenosů na pozadí a 64 MiB spekulativních textur zůstávají.
- Beze změn uložení, výuky, rozložení UI, autentizace a API. Offline worker
  nemaže hráčská data a nová verze nevynucuje reload rozehrané hry.

## Oddělení souběžné práce

Oprava vznikla v izolovaném worktree. Během ověřování přibylo souběžné
vydání `pilot-0.1.12`; oprava byla navázána na jeho následný dokumentační
commit `f9889f5bd69e5a813fc8f958aaef3449fe69dd1f`. Zachovává tedy opravy
pokroku, zavření návodů a lesního krystalu. Rozpracovaná analytika ani SQL
migrace 0005–0009 nejsou zahrnuté. Push nesmí být vynucený a release tag
se po zveřejnění neposouvá; před nasazením se znovu kontroluje vzdálený
main i skutečná Cloudflare verze.

## Ověření

Před testy porovnán `server/`: žádná změna ani nová migrace. DB není
potřeba pro smysluplné testování této klientské opravy.

- 19 Node testů prošlo: manifest, worker, přerušení sítě/těla, abort,
  304, reconnect, offline zvuk, staré verze, kvóty a ochrana soukromých dat.
- 12 Vitest testů prošlo: prioritizace úvodu, fronta a souběh cache textur.
- Sestavený pilot a kontrola Cloudflare assetů prošly: 352 souborů,
  největší 7 240 124 bajtů. Zůstává stávající upozornění na velikost chunků;
  celá testovací sada ani globální typová kontrola se znovu nespouštějí.
- Izolovaný smoke `scripts/check-intro-loading.mjs` prošel se studenou
  cache v Canvasu i výchozím WebGL (`INTRO_QA_RENDERER=webgl`):
  menu → postava → počítání → automatický příběh → Zyx a raketa.
  Server omezil všechny přenosy včetně workeru na společné 2 MiB/s + 60 ms
  a první přenos pozadí havárie přerušil po 256 bajtech. Následoval nový
  přenos s `Cache-Control: no-cache`; žádná výjimka ani chyba textury.
- Po úplném stažení 344 souborů prošel offline reload a načtení nového
  QA profilu do města. Save zůstal byte-for-byte stejný. Totéž prošlo
  v produkčním výchozím WebGL režimu, bez síťových požadavků na assety.
  Test používá samostatný prohlížeč a lokální server blokující API;
  skutečné dětské profily ani produkční analytika nejsou použité.

První WebGL pokus vypršel při čekání na konec příběhu, před získáním
diagnostického snímku. Není započítaný jako úspěšný test ani automaticky
připsaný síti. Opakovaný úplný WebGL průchod stejným buildem se stejným
omezením sítě a přerušením odpovědi prošel; herní kód ani podmínky nebyly
kvůli tomuto timeoutu měněné. První offline kontrola nesprávně očekávala
návrat do havárie; test byl opraven podle stávající politiky návratu do města.
Vestavěný prohlížeč se při diagnostice stal nedostupným, sdílený Playwright
MCP byl obsazený; smoke proto používá izolovaný existující Playwright runner.

## Vizuální přejímka a omezení

Použity `docs/UI_PRE_READER_GATES.md`. Prohlédnuty skutečné snímky
`artifacts/intro-loading/crash-desktop.png` a `crash-tablet.png`: pozadí,
raketa, Zyx, hrdina a HUD jsou kompletní, s oddělenými prvky a zachovanými
proporcemi. Prohlédnuty i `save-offline-tablet.png`,
`save-offline-webgl-tablet.png` a WebGL snímek `webgl/crash-tablet.png`.
Žádný nový text ani ovládání nepřibylo. Nejde o nové schválení
všech starších herních dialogů a slovní hádanky. Tablet je Chromium viewport
1024×768, nikoli fyzický iPad/Safari. Po úplném výpadku před prvním stažením
nelze zaručit pokračování ani nulové čekání na první velmi pomalé lince.

Offline manifest: `553d18ec3ae6f883eea2cd06`, 344 zdrojů / 92 955 707 bajtů.

## Nasazení a návrat

Nasazuje se čistý tag `pilot-0.1.13` se shodným `APP_RELEASE` na Cloudflare
a v Doppler `cislokraj/prd`. Ostatní proměnné a serverový zdroj se nemění.
Předchozí Cloudflare verze `2cbbb7d4-bb22-4baa-955e-1c05d7c26ad0`,
Railway deployment `2da60904-fd78-4d5e-960f-3f024162d7e9` (`pilot-0.1.12`).
Rollback nikdy nemaže localStorage, IndexedDB ani účetní data hráčů.

Nový offline worker čeká na uzavření starých herních záložek; nerozbíjí
rozehranou hru vynuceným reloadem. Pro získání nové verze zavřít všechny
záložky hry a otevřít `/hra/` znovu online, bez mazání uložených dat.

## Nasazeno 2. 10. 2026

- Zdrojový commit `64e1d66ec765d80c6d5fe88757328272007654ed` a anotovaný
  tag `pilot-0.1.13` jsou na GitHubu. Atomický push bez force aktualizoval
  vzdálený `main`, izolovanou hotfix větev a nový tag společně. Tag se nemění.
- Nasazen čistý worktree odpovídající tagu s Wrangler `--strict`.
  Cloudflare verze `840ac58f-196c-492d-8ed9-423b81608f54`; nahráno pět
  změněných souborů, 347 bylo beze změny. Žádný souběžný release se nevrátil.
- Ověřeno 12 veřejných produkčních souborů: obě HTML, všechny vstupní
  JavaScript chunky, tři herní katalogy a offline manifest/worker mají
  shodné SHA-256 s uloženým otestovaným buildem. `/` a `/hra/` vracejí 200
  a `X-Cislokraj-Release: pilot-0.1.13`; `www` přesměrovává 308 a
  nepřihlášený `/v1/me` správně vrací 401.
- V Doppler `cislokraj/prd` změněn pouze `APP_RELEASE=pilot-0.1.13`.
  Po automatickém redeploy API vrací `/ready` HTTP 200 a `pilot-0.1.13`.
  Serverový zdroj ani čtyři SQL migrace nebyly změněné.
- Přesný build a snímky jsou zachované v lokálním
  `artifacts/releases/pilot-0.1.13/`. Produkční ověření bylo pouze čtení;
  žádné syntetické savy ani herní výsledky nešly do produkčního API.

Lokální rozpracovaný `main` je stále na `f9889f5`; vzdálený main už obsahuje
hotfix. Bezpečnostní kontrola nepovolila indexovou synchronizaci v dirty
worktree kvůli souběžné analytické práci. Příkaz nebyl proveden, index
zůstal prázdný a původní lokální změny včetně rout `wrangler.jsonc` byly
zachované. Do lokálního mainu se nic nestashovalo ani nepřepínalo. Oprava
je dostupná v čistém worktree a větvi `codex/weak-network-hotfix-20261002`;
před dalším vydáním je potřeba bezpečné sloučení se souběžnou prací.

Tato sekce je následný dokumentační commit, nikoli přesunutí release tagu.
