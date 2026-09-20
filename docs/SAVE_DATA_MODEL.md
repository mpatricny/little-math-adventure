# Účty a cloudové savy

První verze schématu drží přihlášení oddělené od herních dat. Jeden herní účet může
mít identitu u poskytovatele přihlášení a nejvýše osm obsazených slotů.

```text
player_accounts 1 ─── * account_identities
        │
        └──────── 0..8 save_slots
```

## Tabulky

| Tabulka | Účel | Důležitá pravidla |
|---|---|---|
| `player_accounts` | Vlastník herních dat | Neobsahuje skutečné jméno ani fotografii. |
| `account_identities` | Vazba na Google nebo budoucího poskytovatele | Identita je určena stabilní dvojicí `provider + provider_subject`; e-mail není klíč. |
| `user`, `account`, `session`, `verification` | Přihlášení spravované Better Auth | OAuth tokeny jsou šifrované; herní data ani save payload sem nepatří. |
| `save_slots` | Poslední cloudová kopie hry v jednom slotu | `slot_number` je 1–8 a s `account_id` tvoří primární klíč. |

Každá nová hra má vlastní `save_id`. Když hráč začne novou hru v dříve použitém
slotu, klient vytvoří nové UUID; analytické události staré hry se tím později
nesmíchají s novou. `schema_version` verzuje JSON formát a `revision` slouží pro
optimistický zámek: update musí uvést naposledy načtenou revizi a server ji zvýší.

`client_saved_at` zachovává čas vzniku lokálního savu, zatímco `updated_at` je čas
posledního zápisu přijatého databází. `payload` musí být JSON objekt, aby zůstal
kompatibilní se současným lokálním formátem.

## Google přihlášení

Google callback vytvoří relaci v Better Auth. První autentizovaný požadavek na
`/v1/me` současně vytvoří (nebo dohledá) `player_accounts` podle stabilního Google
subject. Skutečné jméno ani fotografie se do herního účtu nekopírují; e-mail je
pomocný údaj a nikdy se nepoužívá jako identifikátor.

## Přenos existujících savů

Přihlášení a synchronizace přijdou v dalším kroku. Do té doby zůstává místní save
beze změny. Při prvním přihlášení klient načte obsazené cloudové sloty a nabídne
import místních pozic pouze do volných slotů nebo po výslovném rozhodnutí hráče;
cloudový obsah se nesmí tiše přepsat.

## Migrace

Schéma vytváří `server/migrations/0001_accounts_and_save_slots.sql`. UUID generuje
aplikační vrstva, takže migrace nepotřebuje PostgreSQL rozšíření. Produkční deploy
API spouští migrátor před startem služby a kontroluje neměnný SHA-256 souboru.
