# Databázové migrace

Produkční změny schématu patří do souborů `NNNN_popis.sql`. Aplikované soubory se
nikdy neupravují; oprava dostane nové pořadové číslo. `npm run db:migrate` drží
transakční advisory lock, kontroluje SHA-256 a zapisuje stav do
`app_schema_migrations`.

První doménová migrace `0001_accounts_and_save_slots.sql` vytváří účty, identity
přihlášení a osm cloudových save slotů. Události dostanou samostatnou navazující
migraci, aby bylo schéma pilotního měření možné revidovat nezávisle.

`0002_google_auth.sql` přidává schéma vygenerované pro Better Auth 1.7.4. OAuth
profil, relace a zašifrované tokeny jsou oddělené od `player_accounts`; spojení
vzniká přes stabilní Google subject v `account_identities`.
