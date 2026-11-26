# Schopnosti lišky V3 — tři stabilní řádky

19. listopadu 2026. Prokliknutelný koncept podle autorova upřesnění:
Štít, Léčení a Zásah vlevo; vedle každé schopnosti vodorovný postup
vylepšení. Používá existující rámy a ikony a nový preferovaný výraz původní
lišky. Žádné nové obrázky schopností ani animace postav se negenerovaly.

[Otevřít ukázku](http://localhost:8013/docs/design-drafts/fox-abilities-v3/index.html).
Server na 8013 používá `../mathboard-variants-v4/vite.config.ts`.

## Chování

- Přesně tři hlavní ikony zůstávají na stejném místě. Zamčené mají zámek,
  první odměna ho odstraní. Další odměny zvýší číslo účinku bez nového odemčení.
- Každý řádek má sedm dvojic runových kamenů. Dvojice má konkrétní ID modulu,
  patří zvolenému hráči a představuje I a II. Celkem je v modelu 21 modulů.
- Dosažené kameny svítí a mají fajfku; nejbližší cíl má světlý obrys a plus;
  vzdálené kameny jsou ztlumené. Rozlišení není založené jen na barvě.
- Kliknutí na dvojici otevře její skutečný modul, vlastníka a aktuální →
  příští účinek rodinné schopnosti. Celá dvojice je jeden dotykový cíl.
- Návrhářské tlačítko „Ukázat odměnu“ simuluje nový úspěch vybraného modulu:
  kámen zazáří, přeletí k hlavní ikoně a změní její sílu. Není to hráčské
  tlačítko pro bezplatné získávání odměn.
- I → II nahrazuje příspěvek 1 hodnotou 2. Není to součet 1 + 2.
  Další úspěch modulu po II nic nepřidává. Úspěchy jiných modulů rodiny
  posilují tutéž schopnost.
- Hráči A a B mají oddělené fiktivní profily. Přepnutí, obnovení a skrytí
  stránky ruší rozběhnuté efekty. Reduced motion zachová výsledek bez letu.
- Značky jsou trvalý postup, nikoli spotřební náboje. Počet použití každé
  schopnosti v boji zůstává jeden; toto UI ho neimplementuje ani nemění.

## Kontrakt a soubory

- `scenes.json`: všechny statické hosty, pozice, hloubky, safe inset,
  vnitřní rozvržení řádků a detailu. Obrázky jsou vložené uniformně.
- `model.json`: pouze **ilustrační** rozdělení reálných ID modulů mezi rodiny,
  příspěvky [0, 1, 2] a ukázkové stavy. Toto není schválené vyvážení hry.
- `main.js`: lokální stav a vizuální reakce. `getExamPresentation()` dodává
  skutečné názvy a příklady z projektu, bez závislosti na ukládání nebo DB.
- Nové dvě odměny jednotlivého modulu nemění dosavadní Plynulost,
  Mistrovství ani jejich bonus k běžnému útoku.
- Produkční hru, API, data mazlíčků, animace, souboje a savy tato ukázka nemění.

## Kontrola

Před kontrolou ověřeno: standalone server ani tato stránka nepotřebují
databázi nebo migrace. Playwright prošel 18 funkčními kontrolami; všechny
prošly. `review/functional-review.json` obsahuje výsledek a
`review/verify.mjs` reprodukovatelný vizuální průchod.

Ověřené velikosti: desktop 1440 × 1100, tablet 1024 × 768 a 768 × 1024.
Dotykové cíle na tabletu mají nejméně 44 CSS px. Hover/stisk pohybuje
rámem i obsahem společně, root zůstává pevný a pointer-out polohu obnoví.

Skutečně prohlédnuté obrázky a limity jsou v `review/visual-review.json`.
Kontrola bez slov ukazuje stejný postup pomocí ikon, zámků, kamenů,
fajfek a hodnot. V herní ploše nejsou odstavce. Generické redakční popisy
jsou mimo herní rám. Vztah = má větší vlastní glyf, jeho nakreslená výška
odpovídá sousedním číslicím. Přijetí konceptu autorem stále čeká;
automatické kontroly neznamenají schválení vzhledu ani test s dětmi.
