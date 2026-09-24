# pilot-0.1.10 — web, první kroky a offline příprava

## Obsah vydání

- Web a hra používají název Číslokraj: Tajemství krystalů. Landing má upravené
  vysvětlení procvičování, pedagogické zdroje a čtyři skutečné herní snímky.
- Nová postava výslovně vybírá počáteční rozsah počítání. Návrat zachovává
  rozepsané jméno, vzhled a zvolenou úroveň.
- Obrázkové návody obchodu, kovárny, arény a Pythie doprovází 19 místních
  českých nahrávek. Návody lze opakovat; jejich dokončení se ukládá zvlášť
  pro každého hráče. Samotná ukázka nespotřebovává zdroje ani neuděluje postup.
- Meče +1/+2/+3 nezvyšují zároveň základní sílu hrdiny. Starší uložené hry
  dostávají jednorázovou opravu při načtení; výbava a výukový postup zůstávají.
- Po první interakci se na pozadí připravují blízké lokace a poté zbytek
  pilotního obsahu. Stažené soubory jsou oddělené od rozbalených textur v paměti.
  Sestavená hra přes HTTPS se po úplném stažení otevře také offline.
- Na výslovný požadavek vydat všechny aktuální změny je zahrnuto také dříve
  lokální ladění lesního vlka: odčítání do 10 a násobitel síly 7 místo sčítání
  do 5 a násobitele 3. Ve vydání 0.1.9 tato změna ještě nebyla.

Podrobnosti: [playtest](../PLAYTEST_FEEDBACK_2026_09_24.md),
[meče](../WEAPON_ATTACK_FIX_2026_09_24.md),
[web](../LANDING_RESEARCH_REVIEW_2026_09_24.md),
[načítání a offline režim](../ASSET_STREAMING_OFFLINE.md).

## Data a podmínky

Serverový kód ani SQL migrace se nemění; před testy byla tato skutečnost
ověřena. Oprava síly meče je migrace klientského JSON s příznakem
`attackPowerVersion: 1`, nikoli změna databázového schématu. Skutečné profily
dětí se při vydávání ručně neupravují.

Offline režim vyžaduje jednou kompletně staženou hru v témže profilu prohlížeče
a následné otevření přímo `/hra/`. Manifest obsahuje 344 souborů,
92 949 884 bajtů; revize `085a0e834531b5bb948fbeca`. Přihlášení a serverové
funkce zůstávají online. Prohlížeč může cache odstranit; viditelný ukazatel
úplného stažení zatím není. První velmi pomalé stahování lze rychlým postupem
předběhnout. Aktualizace nepřerušuje rozehranou hru vynuceným obnovením.

## Ověření před vydáním

- 32 Node testů: offline build/worker, výběr pilotního obsahu, závislosti
  scén a Cloudflare routování — prošlo.
- 102 cílených Vitest testů v 11 souborech — prošlo.
- Celá sada `src/systems/__tests__`: 378 úspěšných a 8 známých selhání,
  ve stejných kategoriích jako 0.1.9: `EncounterCatalog` (1),
  `EnemyPresentationSystem` (3), `GuildExamMockScene` (1),
  `UnderwaterCreatureAnimations` (3). Nejde o plně zelenou globální sadu.
- Klientský TypeScript: 141 existujících diagnostik; normalizované porovnání
  proti stavu před načítáním neukázalo žádnou novou. Proti 0.1.9 byla jedna
  diagnostika odstraněna. Úspěšný Vite build tento neúplný typecheck nenahrazuje.
- 17 databázově nezávislých API testů a API build — prošlo. Databázové
  integrační testy bez testovací databáze neběžely.
- Pilotní build a Cloudflare kontrola: 352 souborů, největší 7 240 124 bajtů.
- `check-landing`: desktop/tablet/telefon, obrázky, přihlášený/anonymní stav,
  nedostupné API a stavy ovládání — prošlo.
- `check-playtest-feedback` a `check-playtest-guidance`: výběr úrovně,
  obrázkové ukázky, opakování a zastavení hlasu, uložení a oddělené postavy,
  žádné odměny za ukázku — prošlo.
- Všech 12 Playwright testů obchodu — prošlo na desktopu WebGL i tabletu
  Canvas: návody podle skutečné výbavy, platba/nákup/upgrade, přepínání co-op,
  všechny tři meče a jednorázová migrace. Starý test hlášky `vo.shop.prep`
  byl nahrazen kontrolou nové konkrétní hlasové ukázky a co-op fixture nyní
  výslovně označuje úvodní návody za dokončené, aby netestovala klik pod nimi.
- `check-asset-streaming` s omezením serveru 2 MiB/s a 60 ms: 22 počátečních
  assetů, úplné stažení na pozadí v menu za přibližně 47 sekund; aktualizace
  čeká bez reloadu; po restartu izolovaného prohlížeče offline průchod
  menu → město → aréna → boj, zachované uložení a zvukové Range požadavky.

Playwright MCP měl obsazený sdílený profil; použity izolované CLI prohlížeče.
Vizuálně byly znovu prohlédnuty `artifacts/playtest-feedback/tablet-canvas-level-selected.png`,
`tablet-canvas-shop-shop.shield.v1.png`, `advanced-prism-no-prose-muted.png`,
`artifacts/shop/tablet-canvas-sword_reinforced-migrated-book.png`,
`artifacts/asset-streaming/battle-offline-tablet.png` a responzivní landing
v `/private/tmp/cislokraj-landing-{tablet,phone}.png` a `cislokraj-gallery-phone.png`.
Čísla, rámy a ovládání se nepřekrývají; ukázka s vypnutým zvukem a skrytými
slovy zachovává obrázkové vstupy a výsledek. Použity pre-reader brány podle
`UI_PRE_READER_GATES.md`; nejde o nové plošné schválení všech starších obrazovek.
Fyzický tablet ani Safari tímto nejsou otestované.

## Vydání a návrat

Nasazuje se čistý commit označený anotovaným tagem `pilot-0.1.10`.
Cloudflare, Doppler `cislokraj/prd` a Railway `production/api` používají stejné
`APP_RELEASE`; jiné produkční proměnné se nemění. Stávající pre-deploy kontrola
migrací zůstává aktivní. Doklad nasazení bude doplněn následným dokumentačním
commitem bez posouvání tagu.

Předchozí Cloudflare verze pro případ návratu:
`1f3ae337-f0ac-4f81-9189-4d1d8b1d5ee2` (`pilot-0.1.9`). Předchozí Railway
deployment: `c5c182fa-ca24-434c-b4a8-538d3cc88155`. Návrat frontendové verze
nesmí mazat místní uložené hry ani účetní data.
