# pilot-0.1.9 — srozumitelné zkoušky a opravy po hraní

## Změny

- Zkoušky a brány ukazují název dovednosti a velký nevyřešený příklad místo
  samotného kódu. Stejná identita zůstává během zkoušky i ve výsledku.
- Porovnávání má počty prvních odpovědí, úspěšnost a časy, včetně souhrnů
  jednotlivých kroků. Nové čítače přežijí zkrácení podrobné historie.
- Při sbírání many příklad přeskakuje mezi patry a na prvním patře má delší
  pauzu. Ukázka předvádí stejné chování; co-op dráhy mají nezávislé časování.
- Údaje postupu ke zkoušce jsou větší a dostupné katakomby trvale svítí.
- První osvobození lišky ponechá její základní sílu; bonus přidává až další
  vítězství. Již uložené bonusy se zpětně nesnižují.
- Explicitní oprava nedokončeného pásma umožňuje vrátit se k němu bez ztráty
  pozdějších dovedností. Nenasazuje se automaticky podle jména hráče; vyžaduje
  čerstvou zálohu a samostatně ověřený plán pro konkrétní uložení.

Audio příkladů je pouze [návrh](../audio/SPOKEN_PROBLEMS_PLAN_CS.md).
Neobsahuje nové nahrávky, automatické předčítání ani časovanou nápovědu.
Samostatná lokální změna parametrů lesního vlka není součástí tohoto vydání.

## Data a nasazení

Serverové schéma ani SQL migrace se nemění. Nová volitelná pole jsou součástí
stávajícího JSON uložení; vydání nepřepisuje skutečné profily dětí.
Frontend se sestavuje z čistého tagu `pilot-0.1.9`, nikoli z pracovního adresáře
s nezahrnutou změnou vlka. API a Doppler `prd.APP_RELEASE` používají tentýž
identifikátor vydání. Stávající pre-deploy kontrola migrací zůstává zapnutá.

## Ověření před vydáním

- Cílené funkční a vizuální kontroly jsou zaznamenané v
  [kontrole zpětné vazby](../PLAYER_FEEDBACK_2026_09_24.md) a
  [kontrole zkoušek](../EXAM_IDENTITY_REVIEW_2026_09_24.md).
  Zahrnují Canvas/WebGL, tabletové rozměry, skutečné odpovědi i chybnou odpověď,
  stavy ovládání a zobrazení bez slovních textů a zvuku. Nejde o fyzický tabletový playtest.
- Celá sada `src/systems/__tests__`: 366 úspěšných a 8 neúspěšných testů.
  Stejných 8 chyb bylo samostatně reprodukováno na čistém předchozím vydání
  `692f5e6` (`pilot-0.1.8`): `GuildExamMockScene` (1),
  `UnderwaterCreatureAnimations` (3), `EncounterCatalog` (1) a
  `EnemyPresentationSystem` (3). Tyto starší chyby toto vydání neopravuje.
- 24 testů opravy uložení, obsahu pilotu, manifestu obrázků a Cloudflare
  routování prošlo. 17 databázově nezávislých API testů a API build prošly;
  databázové integrační sady bez testovací databáze neběžely.
- Úplná klientská TypeScript kontrola má nadále 142 předchozích diagnostik;
  normalizované porovnání nezjistilo novou chybu. Produkční Vite build je
  samostatná kontrola a tento výsledek nenahrazuje.

Nejde o plošné schválení všech starších herních obrazovek podle pre-reader
pravidel. Konkrétní prohlédnuté snímky a omezení jsou uvedené v obou kontrolách.
