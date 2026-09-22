# Číslokraj pilot 0.1.4

Google přihlášení je dostupné také z herního menu pod ovládáním celé obrazovky.
Úspěšná autorizace se vrací přímo na `/hra/`. Chybějící OAuth konfigurace zůstává
viditelná jako neaktivní tlačítko se stavem „Není dostupné“ a obnovením kontroly.
Toto vydání samo nezřizuje Google OAuth klienta ani cloudové ukládání savů.

## Změny

- Host `googleAccountHost` v `scenes.json` řídí polohu, rozměry a hloubku.
- Stav účtu se ověřuje přes existující `/v1/me`; chyba serveru se nezaměňuje
  za nepřihlášeného uživatele. Odhlášení se potvrzuje až úspěchem serveru.
- OAuth URL musí patřit HTTPS hostu `accounts.google.com`. Návratové adresy
  používají pevnou cestu; údaje v URL hry se nepřenášejí do OAuth callbacku.
- Po opuštění menu se odstraní DOM i listenery a zruší čekající požadavky.
  Google nedostává žádné požadavky před kliknutím; ikona i písmo jsou lokální.
- Plátno centruje pouze Phaser. Současné CSS flex centrování předtím posouvalo
  HTML vrstvu oproti plátnu na tabletech. Oprava srovnává i pole jména postavy.

## Ověření

- 10 cílených testů pro Google klienta a existující ovládání menu prošlo.
- Prohlížečová kontrola prošla na desktopu i tabletu, včetně Canvas rendereru,
  změny velikosti okna, chyb přihlášení/odhlášení, zachování lokálních savů a
  úklidu po vstupu do výběru postavy. Opakování: `npm run test:game-account`.
- OAuth start a návrat jsou v UI testech simulované. Skutečné přihlášení uživatele
  nelze potvrdit bez Google OAuth klienta a dokončení autorizace v Google.
- Není potřeba nová databázová migrace; server ani SQL se v tomto vydání nemění.

## Vizuální přejímka

Použit [povinný checklist](../UI_PRE_READER_GATES.md). V novém herním ovládání
jsou jen krátké popisky, Google ikona, potvrzovací značka, ikona odhlášení a
šipka obnovení. Přihlášení je volitelné; není předpokladem hraní ani práce se savy.

Prohlédnuté snímky v `/tmp/`:

- `cislokraj-game-account-desktop-normal.png`, `-desktop-unavailable.png`,
  `-desktop-authenticated.png`;
- `cislokraj-game-account-desktop-hover-button.png`, `-desktop-pressed-button.png`,
  `-desktop-pointer-out-button.png`;
- `cislokraj-game-account-tablet-canvas-normal.png`, `-tablet-canvas-unavailable.png`,
  `-tablet-canvas-authenticated.png`;
- `cislokraj-game-account-tablet-character-name.png`.
- `cislokraj-game-account-no-prose-authenticated.png` a `-no-prose-anonymous.png`:
  ovládání odhlášení a návrat ke Google ikoně se skrytými slovy a pozastaveným
  zvukovým kontextem.

Nové ovládání po opravě nepřekrývá titul ani celou obrazovku. Na tabletu mají
oba dotykové cíle alespoň 44 CSS px, během interakce se nemění jejich poloha.
Google tlačítko používá oficiální vizuální podobu poskytovatele přihlášení.
