# Katakomby a společná cesta k lišce

18. listopadu 2026, revize po zpětné vazbě autora. **Izolovaný proklikávací návrh,
nikoli produkční nasazení.** Není třeba databázová migrace: tato revize mění jen
návrhy a dokumentaci, používá fiktivní profily v paměti stránky.

## Současný směr

- Konkrétní modul se vybírá zde. Klik na modul nemění režim; před soubojem se
  potvrdí Trénovat / Dál. Zyx tuto cestu představí.
- Na přehledu je pouze rychlost, hranice a stav dveří. Minipečeti a Podrobnosti
  byly odstraněny. Zámek používá společný runtime predikát, ne samotnou lištu.
- Klik na zámek vysvětlí chybějící zkoušku obrázkovou sekvencí a hlasem
  „Nejdřív splň zkoušku“. Přesnost, počty a formy se dál kontrolují v pravidlech.
  Ostatní překážky nabídnou trénink; neoznačují se nepravdivě za chybějící zkoušku.
- Vybrat lze v návrhu i dokončený modul. Aktuální runtime to ještě neumí.
  Vyšší rychlostní stupně a odměna za udržení jsou v návrhu pravidel níže.

## Společná data

`../shared/practice-journey.ts` importuje současné `getCatacombReadiness`,
`PersonalBattleBonuses`, `CatacombPetProgress` a katalog mazlíčků. Nad ukázkovými
profily vrací jeden snapshot pro obě galerie. Neimportuje GameStateManager,
nečte ani nezapisuje skutečné save soubory, localStorage, sessionStorage ani API.

`getReviewSession()` sdílí instanci přes stejnooriginové `window.top`.
Katakomby hostují výhru, volbu režimu a lišku z `training-flow-v5` v iframe.
Galerie v5 může naopak hostovat katakomby. Obě přijímají `?embedded=1`.

- `snapshot(owner, targetId?)`: speed, readiness, lockReason, dvě současné
  výzvy a skutečný stav/síla lišky. `owner` je A/B.
- `preference / chooseTarget / setMode`: cíl nezávislý na režimu.
- `battle(owner)`: již vytvořený výsledek, rychlost before/after a bonus.
- `trial(owner)`: již vytvořená záchrana/posílení, skutečné attackBefore/After.
- `route({view, owner, targetId, returnTo})`: navigace, nikdy udělení odměny.
- `subscribe`: změna nebo navigace. Čtení, render ani Hotovo nevytváří výhru.

Výsledek běžné výhry posune správný modul; Cesta k lišce otevře přesně tento
modul a portrét. První úspěšná výzva odemkne lišku **ke spoutání u Pythie**
(amulet s hodnotou 5); neuděluje vlastnictví. Katalogová síla je **6**.
Další úspěch skutečně zvýší sílu například 6 → 7, i před spoutáním.
Normální výhra ani nově otevřené dveře sílu nepřidávají.

## Jak projít návrh

Review tlačítka nahoře jsou mimo dětskou herní plochu a explicitně simulují
výsledky. Běh skutečného souboje ani celé zkoušky nepředstírají.

1. Výchozí B1: 9,2 s, cíl 7 s. Ukázka lepšího výsledku vytvoří skutečně
   vypočtený bonus nad fiktivními odpověďmi: 6,6 s a +1 mana.
2. Na výhře kliknout na cestu modulu. Vrátí stejné hodnoty a otevřený zámek.
3. Simulovat výhru ve výzvě. Obrazovka lišky ukáže záchranu, sílu 6 a Pythii.
4. Simulovat spoutání mění jen ukázkový profil. Nebo trénovat dál a splnit
   druhou výzvu: posílení 6 → 7, bez dvojího udělení.
5. B2 má od začátku 6,7 s a dostatek správných řešení, ale chybí základní
   zkouška. Klik na zámek předvede požadovaný stav s hlasem.
6. Druhý portrét má jiný čas a vlastní cíl i odměnu. Vybrat jeho modul
   nepřepne ani nezmění hráče 1.

U porovnávání lze v přehledu ukázat rychlost a skutečný zámek; jednoduchý
generátor fiktivní výhry zatím nevytváří jeho osobní rychlostní bonus.
Nejde o omezení produkčního porovnávání. Runtime se touto revizí nemění.

## Odměny a další rychlostní stupně

[Celý návrh](../../PRACTICE_JOURNEY_PROPOSAL.md) odděluje současná pravidla
od navržených: trénink po mastery, čtyři rychlostní stupně, stejný základ
mincí, osobní zlepšení v obou režimech a odměna za udržení po odstupu.
Nové časy 3/2 s ani nová ekonomika nejsou natvrdo přidány do galerie.

## Vizuály, hlas a předání

`detail-art.png` a `entrance-art.png` jsou dříve vygenerované koncepty.
Používáme společný rám a portréty v5, runtime popisky a čísla. České audio
`audio/exam-preview.wav` je **pracovní systémový hlas Zuzana**, nikoli
finální ElevenLabs hlas Zyxe. Při produkčním předání jej nahradit schválenou
Zyxovou replikou a připojit přes herní AudioManager.

Zapečené světlo první karty zakrývá přesně stejně velký okraj třetí karty;
jde o skládání existujícího podkladu v CSS bez změny poměru stran. Výběr má
jediný aktivní obrys a pohyblivé ✓. Karty mají při hoveru stabilní geometrii;
samostatné akce posouvají svůj povrch i ikonu společně. Ve výrobě rozdělit
bitmapu na společný rám a ikony. Celé desky nejsou produkční spritesheet.

Produkční hosty všech panelů, portrétů, rychlosti, modulů, zámků, akcí a
safe inset musí být v `public/assets/data/scenes.json`; pozice/depth číst
přes SceneBuilder. Zde jde o HTML návrh, nikoli o již hotovou Phaser integraci.
Před vydáním navíc ověřit Canvas/WebGL, první předvedení a porozumění dítětem
podle `docs/UI_PRE_READER_GATES.md`. Prohlédnuté snímky a automatické kontroly
této revize jsou v `review/journey-checks.json`.

## Zámky a cesta k Pythii — 18. listopadu 2026

`detail-clean.webp` je přesná obrazová revize původního podkladu bez čtyř
zapečených zámků. Všechny zámky v přehledu, na bráně i v průvodci používají
společné zlaté bitmapy `training-flow-v5/assets/journey-lock-*.webp`.
Zavřený/otevřený/dokončený stav stále čte runtime readiness. Dokončení má
navíc zelenou fajfku. Hover mění světlo, stisk posouvá povrch uvnitř pevného
hit area. Pointer-out a disabled jej vrátí; rozměry zůstávají stejné.

Nejasnou řadu mečů a čárového amuletu nahradily tři ilustrace ve stejném
rámu: brána se zachráněnou liškou → Pythiina dílna s amuletem → dítě a liška.
Číslo v amuletu pochází z `pets.json → pet_catacomb_A.requiredAmulet.value`
(nyní 5). Není to počet výher ani cena v mincích. Hotové kroky mají fajfku,
aktuální krok světelný obrys. Číslo je runtime text; nesmí se zapéct do obrázku.
Přechod k Pythii sám nepřiděluje vlastnictví ani další odměnu.

Nové hosty, oblasti průvodce a safe inset jsou v místním `scenes.json`.
Prompty, původní generované zdroje a opakovatelná normalizace leží ve
`training-flow-v5/assets/pet-*` a `build-pet-art.mjs`. Generované aktivní
varianty tlapky/amuletu mají mírný posun geometrie, proto je runtime nepřepíná;
světlo animuje nad jedinou kanonickou normální bitmapou.

Ověření: 50 kontrol společného průchodu, 21 snímků, bez runtime chyb; navíc
ruční vizuální průchod novými stavy na 1280, 1024 a 768 px, skrytá slova,
vypnutý hlas, reduced motion a obě vlastnictví. Nejmenší ovládání průvodce
má 48 × 48 CSS px. Výčet prohlédnutých snímků a omezení:
`review/pet-lock-polish-review.json`. Produkční hru a save tento návrh nemění.
