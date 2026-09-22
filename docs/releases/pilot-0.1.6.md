# Číslokraj pilot 0.1.6

Odhlášení v herním menu i na úvodním webu posílá platný JSON požadavek.
Původní prázdný POST bez `Content-Type` produkční Better Auth odmítal stavem
415, takže rodič zůstával přihlášený. Obě místa nyní používají společné
`signOutGoogle()`; neúspěšná odpověď dál zachová přihlášený stav a místní savy.

## Ověření před nasazením

- `npm run test:auth-contract`: skutečný Hono HTTP adaptér a Better Auth přijmou
  požadavek frontendového helperu a vrátí úspěch i expiraci cookies. Test před
  opravou selhal a po opravě prošel. Pouhý přímý `auth.handler(new Request())`
  problém prázdného HTTP těla nereprodukoval. Test nepoužívá databázi.
- Šest cílených testů `src/auth/googleAuth.test.ts` prošlo.
- `npm run test:game-account -- http://127.0.0.1:8026`: desktop a tabletový
  Canvas, odmítnuté i úspěšné odhlášení, odhlášený stav po reloadu, zachování
  místních savů, stavy tlačítka, resize a úklid při opuštění scény.
- `npm run test:landing -- http://127.0.0.1:8026`: úvodní web na desktopu a
  tabletu, odhlášení a stav po reloadu, bez načítání Phaseru.
- Obě browserové kontroly nově ověřují skutečnou hlavičku a JSON tělo
  odhlašovacího požadavku, místo bezpodmínečně úspěšné odpovědi mocku.
- `npm run cloudflare:check`: 332 souborů, největší 7 240 124 bajtů.

Síťová oprava nemění rozložení ani texty UI. V souladu s
[pre-reader kontrolou](../UI_PRE_READER_GATES.md) byly prohlédnuty také
`/tmp/cislokraj-game-account-desktop-authenticated.png`,
`/tmp/cislokraj-game-account-tablet-canvas-normal.png` a
`/private/tmp/cislokraj-google-authenticated.png`: ovladače účtu se nepřekrývají
s herním menu, stav přihlášení je krátký a ovladač zůstává ve svém hostu.
Jde o kontrolu dotčeného přihlašování, nikoli všech starších obrazovek hry.

Vydání zachovává mobilní úpravy pilotu 0.1.5. Nemění SQL, serverovou logiku
ani formát uložených her a nevyžaduje novou databázovou migraci.
