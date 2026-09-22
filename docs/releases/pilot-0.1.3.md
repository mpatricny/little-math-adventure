# Číslokraj pilot 0.1.3

Oprava startu Railway API po vydání 0.1.2. Herní kód a UI se nemění.

## Příčina a oprava

Sestavení serveru procházelo, ale `db:migrate:prod` načítal kompletní konfiguraci
serveru včetně dosud nenastavených Google údajů. Nasazení proto skončilo ještě
před kontrolou migrací. Migrace nyní načítají pouze `DATABASE_URL`.

API explicitně podporuje stav před zřízením přihlášení. Zdravotní endpointy
fungují, přihlašovací endpointy vracejí 503 `auth_not_configured` a nečtou
uživatelské účty. Existující landing tuto odpověď zpracuje bez nefunkční nabídky.
Jakmile je zadáno kterékoli OAuth tajemství, je vyžadována celá platná sada;
neúplné nebo prázdné údaje se nadále odmítnou. Skutečné Google přihlášení
vyžaduje doplnění údajů podle [infrastruktury](../INFRASTRUCTURE.md).

## Ověření před nasazením

- TypeScript build serveru prošel.
- Všech 20 API testů včetně integračních prošlo proti izolované lokální PostgreSQL.
- Skutečný příkaz `db:migrate:prod` bez OAuth/HTTP konfigurace aplikoval obě
  dosavadní migrace. Opakované spuštění neaplikovalo žádnou novou migraci.
- Sestavený server nastartoval v produkčním režimu bez Google údajů;
  `/health` a `/ready` vracejí 200, přihlašovací endpointy očekávanou 503.
- Testy kontrolují také neúplnou konfiguraci, zachování ověřování uživatele při
  aktivním OAuth a nemožnost číst účty bez připraveného přihlášení.

Nepřibyl ani se nezměnil žádný SQL soubor. Produkční pre-deploy nadále ověřuje
kontrolní součty a transakčně aplikuje dosud chybějící migrace před startem API.
