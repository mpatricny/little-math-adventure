# pilot-0.1.7 — ukládání herních dat do PostgreSQL

Herní výsledky dosud zůstávaly pouze v lokálních savech. Pilot nyní průběžně
odesílá skutečné odpovědi, časy, kontexty, krokodýlí asistenci, postup a odměny
do databáze, včetně hraní bez Google přihlášení.

Každý prohlížeč má náhodnou trvalou identitu a každá hra vlastní UUID. První
přihlášení rodiče propojí předchozí anonymní historii s jeho účtem. Transakční
IndexedDB fronta přežije restart a výpadek; PostgreSQL deduplikuje opakované
dávky a chrání novější revize. Skutečné odpovědi se počítají odděleně od
předvyplněných úspěchů při volbě vyššího startovního pásma.

Migrace **0003** a **0004** jsou nutné; nasadit API a úspěšně dokončit preDeploy
před publikací frontendové verze. Jde o sběr dat, nikoli o obnovu cloudových savů.
Popis tabulek, identity a reportů: [GAMEPLAY_DATA.md](../GAMEPLAY_DATA.md).

Ověření před vydáním:

- 25 API a PostgreSQL testů; všechny migrace aplikované do oddělené lokální DB.
- 43 cílených klientských testů: fronta, save import/export, co-op, porovnávání a auth.
- Skutečný prohlížeč → HTTP adapter → PostgreSQL: anonymní hraní, pozdější
  propojení rodiče, různé profily/rodiče/prohlížeče, offline, restart a ztracené
  potvrzení. Test zachytil a oprava odstranila nesprávný receiver nativního fetch.
- HTTP kontrakt odhlášení; desktop a tablet Canvas account/menu testy.
- API build a pilot/Cloudflare build; 332 souborů, největší 7 240 124 B.
- Read-only administrátorský report spuštěný proti testovací databázi.

Vzhled hry se nemění. Vizuálně zkontrolovány aktuální snímky
`/tmp/cislokraj-game-account-desktop-authenticated.png` a
`/tmp/cislokraj-game-account-tablet-canvas-normal.png`: bez překryvů a bez nových
textových instrukcí pro děti. Pravidla `UI_PRE_READER_GATES.md` zůstávají platná.

Po nasazení ověřit `/ready`, identifikátor release na `/hra/` a skutečný záznam
hráče v `gameplay_attempts` nebo přes chráněný `/v1/gameplay/summary`.
