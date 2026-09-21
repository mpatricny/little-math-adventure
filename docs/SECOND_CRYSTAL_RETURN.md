# Návrat s druhým krystalem

## Průchod

- Osvobozený strážce sleduje vodorovnou polohu prvního hráče. `setFlipX`
  obrací aktuální animační snímek; spritesheet ani pořadí snímků se nemění.
  Pásmo 32 px přímo pod drakem brání neustálému překlápění. Zůstává oddělený
  od hráčů i krystalu a dál přehrává skutečnou friendly-idle animaci.
- Po získání krystalu lze dál prozkoumávat jezero. Jakmile se hráč vynoří,
  navazuje `ZyxRocketInterludeScene` ve variantě druhého krystalu.
- Krátká Zyxova zpráva a svítící průlez vedou ke stroji. Před přechodem
  k němu postavy dojdou. V co-opu jsou u lodi vidět oba hráči.
- Ve stroji se volí tři z šesti čísel pro cílový součet. Samostatný klíč
  `zyx:depth-machine` drží zadání, pokusy i rozpracovanou volbu. Generátor
  zachovává rozsah dítěte a nabízí jen jednu nebo dvě správné kombinace.
  Pro rozsah do pěti prohledává kompletní malou doménu, místo aby zvyšoval
  rozsah nebo počet správných možností; zachovává minimálně 20 významově
  odlišných zadání. Volby se promíchají.
- Po vyřešení se krystal přesune do druhého otvoru; první zelený zůstává
  zachovaný. Aktivace ukáže `2 ZE 3 HOTOVO!` a odemkne další cestu.

## Ukládání a návaznost

`underwaterProgress.depthCrystalInstalled` je trvalý příběhový příznak;
`hasNextCityAccess()` je jediná kontrola odemknutí nové kapitoly.
`depthCrystalShipActive` drží návratový bod u lodi, dokud hráč neodejde.
Starší savy s již získaným krystalem a neaktivním průzkumem automaticky
pokračují u Zyxovy lodi. Aktivní průzkum zůstává v podvodní místnosti.
Nejsou potřeba databázové migrace ani přepis starých savů.

Instalace vyžaduje získaný krystal a dokončené nové zadání; první lesní
hádanka nestačí. Opakovaná aktivace nic znovu neuděluje. Nemění manu,
spotřební krystaly, odměny, první krystal ani sílu strážce.
V co-opu dostanou příběhový postup oba účastníci, ale pozorování odpovědi
se nezapisuje fiktivně také druhému hráči. Menu preview zůstává izolované od savů.

Po návratu do Silverpondu je dostupná cesta `ZYXOVA LOĎ`. Nové město je
zatím **pouze odemknutá budoucí kapitola**; jeho ovladač tuto skutečnost
výslovně vysvětlí. Žádná nová městská lokace ani její vzhled se zde nepředjímá.

## Grafika a ověření

> **POVINNÁ PŘEJÍMKA UI OD 20. 9. 2026: DĚTI NEUMĚJÍ ČÍST. Žádný dlouhý text
> nikde v herním UI; vysvětlení musí být obrázkové a názorné. Všechny kontroly
> zahrnují [UI pro nečtenáře](UI_PRE_READER_GATES.md), včetně nejméně 2× větších `<`, `>` a `=`.
> Starší výsledky testů nejsou dokladem splnění této nové podmínky.**

Všechny nové statické hosty jsou v `scenes.json`. Nové ovladače sdílejí
existující modrý smaltovaný rám. Druhý otvor stroje používá frame původní
ilustrace stroje bez změny poměru stran. Modrý krystal se načítá také při
přímém načtení savu u lodi/stroje, nejen při předchozí návštěvě podvodí.
Selhání načtení nabízí opakování a nesmaže postup.

Prohlédnuté výstupy v `artifacts/underwater/`:

- `friendly-{desktop,tablet,coop-tablet}-{resting,facing-left}.png`: orientace,
  živá animace a oddělení od hráčů.
- `depth-crystal-{desktop,tablet,coop-tablet}-{ship,normal,wrong,calibrated,socket,ready,installed,unlocked,next-city,town}.png`:
  průlez, obě zasazená světla, správná i chybná volba, bezpečné okraje a čitelnost.
- `depth-ship-controls-{desktop,tablet}-{normal,hover,pressed,pointer-out}.png`:
  stabilní geometrie ovladačů. Trvale zamčená třetí zdířka a deaktivované
  aktivační tlačítko jsou součástí normálního stavu stroje.

Při vizuální kontrole bylo opraveno chybějící načtení krystalu po reloadu,
nesourodý provizorní otvor stroje, překryv návratového tlačítka s druhou
postavou a staré pozdní nastavení rozlišení textury u městského toastu.
Tabletové kontroly používají Canvas fallback (1024×768 a co-op 1280×800),
desktop používá WebGL (1280×720); nejde o ověření přímo na fyzickém Samsungu.

Testy: `DepthCrystalProgress.test.ts`, rozšířený
`underwater-friendly-guardian.spec.ts`, `underwater-depth-crystal.spec.ts`.
Browserové testy zahrnují skutečný reload obou savů, starou první instalaci,
nedotknutelnost preview savu, kontrolu textur a měření vykreslených textů.
Celorepozitářový TypeScript check má nadále chyby mimo tuto implementaci
(mj. chybějící Node typy a starší scény); produkční build a cílené testy
se proto uvádějí odděleně, nikoli jako průchod celého typechecku.
