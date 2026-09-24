# Web — galerie a východiska učení

Úprava rodičovské stránky `landing.html`. Nová sekce „Věda a pedagogika“ vysvětluje cílené procvičování, školu hrou a flow. Odkazy na zdroje jsou přímo u příslušných tvrzení. Nejde o nové texty v dětském herním rozhraní.

## Galerie

Čtyři snímky ve dvou sloupcích, na telefonu pod sebou. Každý jde otevřít v plné velikosti. Původní městečko a les s vlkem nahradil obchod a most s houbou; přibyl arénový souboj s porovnáváním čtyř a tří jablíček.

- `public/assets/images/screenshots/landing-menu.webp`
- `public/assets/images/screenshots/landing-shop.webp`
- `public/assets/images/screenshots/landing-river-puzzle.webp`
- `public/assets/images/screenshots/landing-arena-comparison.webp`

Pořízeno skriptem `scripts/capture-landing-screenshots.mjs` ve skutečném produkčním pilotu. Skript používá izolovanou ukázkovou uloženou hru, na skutečné hráčské uložené hry ani účty nesahá. Přístup ke stavu hry přidává pouze do odpovědi pro testovací prohlížeč. Obrázky nejsou dokreslené ani poskládané z různých scén.

Houba se objeví až po dokončení mostu, proto snímek zachycuje skutečný stav se dvěma správně doplněnými kameny. Aréna používá existující početní fázi krokodýlí kapitoly a společný MathBoard; místo pro odpověď je prázdné, všechny tři volby jsou rovnocenné. Přiložený obrázek uživatele posloužil jako reference obsahu, pro web vznikl nový snímek přímo v aréně.

Seznam souborů pilotu je aktualizovaný v `scripts/pilot-content.config.mjs`. Kontrola pilotního obsahu nyní čte požadované snímky přímo z HTML, aby chybějící obrázek v sestavení neprošel.

## Zdroje a formulace

Ověřeno 24. září 2026. Text je parafrází, nepoužívá vymyšlené přímé citáty.

1. **Ericsson, Krampe a Tesch-Römer (1993)** — [The Role of Deliberate Practice in the Acquisition of Expert Performance](https://doi.org/10.1037/0033-295X.100.3.363), *Psychological Review*, 100(3), 363–406. Přečten také [plný text studie](https://gwern.net/doc/psychology/writing/1993-ericsson.pdf). Cílené procvičování má konkrétní cíl a zpětnou vazbu; pouhé opakování nezaručuje zlepšení. Poznatky o expertize nejsou vydávány za přímý důkaz účinnosti dětské matematické hry.
2. **Ericsson a Pool (2016)** — [Peak: Secrets from the New Science of Expertise](https://books.google.com/books?id=GmcpCgAAQBAJ). Popularizační výklad principů cíleného tréninku. *Deliberate practice* je na webu přeložené jako **cílené procvičování**.
3. **Komenský (1656)** — [Schola ludus v přehledu Muzea J. A. Komenského](https://komensky.mjakub.cz/schola-ludus-idc387). Historicky jde o učení prostřednictvím dramatizace; text netvrdí, že Komenský popsal počítačové hry nebo provedl moderní experiment. Jeho dílo je označeno jako pedagogická inspirace.
4. **Nakamura a Csikszentmihalyi (2002; přetisk 2014)** — [The Concept of Flow](https://doi.org/10.1007/978-94-017-9088-8_16), s. 239–263 v *Flow and the Foundations of Positive Psychology*. Podmínky zahrnují náročnou, ale zvládnutelnou činnost, jasné cíle a bezprostřední zpětnou vazbu. Flow ani vzdělávací výsledek hra neslibuje automaticky.
5. **IES / What Works Clearinghouse (2009)** — [Assisting Students Struggling with Mathematics](https://ies.ed.gov/ncee/wwc/PracticeGuide/2), zejména doporučení věnovat část podpory upevňování základních početních vztahů. Dokládá význam procvičování v matematické podpoře.
6. **Macnamara, Hambrick a Oswald (2014)** — [metaanalýza vztahu cíleného procvičování a výkonu](https://doi.org/10.1177/0956797614535810). Podklad pro zdrženlivou formulaci, že počet hodin nevysvětluje všechny rozdíly. Neuvádíme procenta ani obecné tvrzení, že čas tréninku převažuje nad všemi ostatními vlivy.

Web rozlišuje východiska návrhu od důkazu účinnosti konkrétní hry. Obtíže dětí nepopisuje jako nedostatek vůle nebo nevyhnutelné selhání; zdůrazňuje srozumitelný cíl, přiměřenou výzvu a radost z vlastního pokroku.

## Ověření

Změna statického webu a galerie nevyžaduje databázovou migraci. Volitelné přihlášení se při testování nahrazuje odpověďmi testovacího API. Playwright MCP měl obsazený sdílený profil, proto kontrola běží v izolovaném Playwrightu.

- `npm run build:pilot` — prošlo, nová galerie je součástí výstupu.
- `npm run test:pilot-content` — všech 9 kontrol prošlo, včetně vazby HTML na publikované obrázky.
- `npm run test:landing` — desktop 1440 × 1000, tablet 1024 × 768 a telefon 390 × 844 bez vodorovného přetečení, všechny obrázky načtené, bez chyb JavaScriptu. Stávající kontroly přihlášení a stavů tlačítek prošly také.
- Otevření arénového snímku kliknutím ověřeno v samostatné záložce: kompletní obrázek 1280 × 720.
- Vizuálně prohlédnuté soubory: `/private/tmp/cislokraj-research-{desktop,tablet,phone}.png`, `/private/tmp/cislokraj-gallery-{desktop,tablet,phone}.png` a původní čtyři WebP obrázky. Čísla a krokodýlí volby jsou ve snímku celé, obrázky zachovávají poměr stran 16 : 9. Karty a citace se nepřekrývají, na telefonu jsou pod sebou.
- Dodatečný skutečný pohled na tabletovou sekci: `/private/tmp/cislokraj-research-real-viewport.png`. Odlišuje artefakt dlouhého screenshotu (odkaz „Přeskočit na obsah“ zachycený mimo skutečný viewport) od reálného zobrazení. DOM kontrola potvrdila, že odkaz nemá focus a jeho spodní okraj leží 21 px nad viewportem; do stránky nezasahuje.

Kontrola screenshotů se týká věrnosti zobrazeného obsahu a jeho vložení na web. Neoznačuje veškeré starší herní UI za schválené podle `UI_PRE_READER_GATES.md`; most například stále obsahuje původní delší slovní nápovědu. Tato úprava herní scénu nepřepisuje.
