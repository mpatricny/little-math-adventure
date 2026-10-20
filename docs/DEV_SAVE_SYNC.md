# Ukládání vývojové hry mezi Wi-Fi sítěmi

Vývojová hra spuštěná přes `npm run dev` ukládá kompletní profily také na stejném
Macu. Nová IP adresa si před spuštěním hry stáhne dostupné profily. Při návratu
na dříve používanou adresu se známá místní kopie aktualizuje, pokud od poslední
potvrzené zálohy nebyla změněna.

Prohlížeč dál ukládá každou hru místně, takže výpadek serveru nezablokuje hraní.
Zápis na Mac probíhá po uložení a neúspěšný přenos se opakuje každých pět sekund
a při obnovení spojení. Před odchodem z Wi-Fi je potřeba nechat spojení doběhnout;
neodeslané změny zůstávají jen v původním prohlížeči a na původní adrese.

## Umístění a rozsah

- Aktuální kopie: `.local-saves/development/catalog.json`.
- Historie a konfliktní verze: `.local-saves/development/history/*.json.gz`.
- Správa pro rodiče: `http://ADRESA-MACU:8001/__dev-saves/`.
- Získání dat z prohlížeče: `/__dev-saves/recover` na **původní adrese hry**.

Soubory jsou mimo `public`, jsou ignorované Gitem a Vite zakazuje jejich přímé
čtení přes běžné i `/@fs/` cesty. Rozhraní přijímá zápisy pouze ze stejného
originu; soubory mají oprávnění `0600`. Jde o rodinné úložiště přístupné přes
lokální vývojový server, bez oddělených přihlášených účtů. Nejde o externí cloud:
je potřeba stejný Mac, zachovaná složka `.local-saves` a běžící vývojový server.

Funkce neběží v pilotním režimu, sestavené hře ani `vite preview`. Nezávisí na
analytice, souhlasu s měřením, Google přihlášení ani databázovém API. Databázová
migrace není pro tuto úpravu ani její testy potřeba.

## Ochrana postupu

Identitu určuje `gameplayProfileId`, nikoli jméno nebo číslo slotu. Každá změna
na Macu má rostoucí revizi a požadavek obsahuje naposledy známou revizi i identitu
úložiště. Opakovaný přenos totožného obsahu je bezpečný i po ztracené odpovědi.
Celá co-op dvojice se ověří před změnou katalogu; konflikt jednoho profilu
neprovede jen polovinu požadavku.

Před aktualizací vznikne komprimovaná kopie příchozích dat i starého katalogu.
Aktuální katalog se nahrazuje atomicky. Poškozený katalog se nikdy nenahradí
prázdným. Historie se automaticky nemaže; při dlouhodobém hraní je potřeba
zahrnout `.local-saves` do běžného zálohování a počítat s růstem složky.

Neznámá starší místní kopie nebo skutečně rozvětvené hraní se tiše nepřepíše.
Příchozí konfliktní verze zůstane v historii a původní místní hra v prohlížeči.
Rodič na stránce správy zvolí postavy a tlačítkem **OBNOVIT** výslovně vybere
kopii z Macu. Tlačítko **ZÁLOHOVAT** výslovně vybere aktuální kopie v prohlížeči.
Obnova nejdřív zálohuje místní profily, zachovává cizí sloty a při chybě zápisu
vrátí původní data. Duplicity identit nebo nedostatek místa operaci zastaví.

Obnova i zápis na Mac nyní odmítnou zjevnou ztrátu postupu: nižší úroveň,
méně zodpovězených příkladů, ztrátu příběhového milníku, dokončené arény nebo
historického výsledku vlny. Stránka označí takovou kopii **STARŠÍ NA MACU** a
obnova skončí bez změny dat. Starší datum bez dalšího postupu se rovněž odmítne.
Samotný novější čas automatického uložení nepřebije doložený vyšší postup ve
starším snímku. Tato kontrola zachytává zjevný návrat zpět; neskládá postavu
z jednotlivých statistik a nepředstírá, že bezpečně seřadí všechny rozvětvené hry.

Při obnově 17. října měla získaná kopie z vybrané adresy menší postup než hry
na domácí adrese. Novější kompletní savy se podařilo získat z automatického
archivu vytvořeného těsně před obnovou. Tento případ je nově pokrytý testem:
správná revize serveru sama neopravňuje přepsat novější místní postup starším.

Před obnovou zavřete ostatní záložky se hrou. Otevřená dev hra kontroluje značku
obnovy před dalším zápisem; po obnově z jiné záložky se nejdřív znovu načte.
Smazání místní postavy ji na stejné adrese samo neobnoví. Kopie na Macu zůstává
jako záloha. Současné nezávislé hraní jedné postavy na více zařízeních může
vyžadovat výběr verze rodičem.

## Získání uložených her z adresy používané na jiné Wi-Fi

Na Macu spusťte hru a omezenou záchrannou proxy:

```sh
npm run dev
npm run dev:recover -- --old-origin http://192.168.1.198:8001
```

Proxy vypíše aktuální domácí adresu a URL `proxy.pac`. Na Androidu/Samsungu
v nastavení aktuální Wi-Fi zvolte automatickou konfiguraci proxy a zadejte tuto
PAC URL. Ve stejném prohlížeči otevřete původní adresu s cestou
`/__dev-saves/recover`. Zobrazí se skutečné místní profily této adresy.
Tlačítko **ZÁLOHOVAT** odešle jejich kompletní stav na Mac. Záchranná stránka
nespouští hru a původní uložené hry v tabletu nemění.

Po hlášce **ULOŽENO NA MACU** vraťte proxy na **Žádná**, otevřete domácí adresu
`/__dev-saves/`, vyberte příslušné postavy a stiskněte **OBNOVIT**, potom **HRÁT**.
U nové adresy bez místních her stačí otevřít přímo hru. Záchrannou proxy po
dokončení ukončete; při další obnově se spustí znovu.

Proxy přeposílá pouze dva záchranné endpointy výslovně zadané původní HTTP adresy.
Ostatní weby používají přímé spojení. Proxy nepodporuje HTTPS/CONNECT ani jiné
cíle a odstraňuje cookies a autorizační hlavičky. Nemění síťové adresy, router,
certifikáty nebo samotná pravidla oddělení úložišť v prohlížeči.

## Ověření 17. října 2026

```sh
npm run test:dev-saves
npm run test:dev-saves:browser
```

Ověřeno 26 testů včetně původního přenosu souborů. Pokryté jsou obě adresy,
návrat domů, ztracená odpověď, výpadek, souběžné zápisy, co-op konflikt,
archivace, nedostatek místa, selhání zápisu, mazání a otevřená stará záložka.
Izolovaný prohlížeč prošel přes skutečnou HTTP proxy, načetl profily z původního
originu, zálohoval je na testovací Mac, obnovil je doma a automaticky přenesl
další postup na další origin. Ověřené je i odmítnutí cizího originu a jiného
proxy cíle. QA používá jen umělé profily v dočasné složce; skutečné profily se do
testovacího serveru ani analytiky neposílají.

Prohlédnuté snímky v `artifacts/dev-save-review/`:

- `tablet-recovery-normal.png`, `tablet-recovery-hover.png`,
  `tablet-recovery-pressed.png`, `tablet-recovery-complete.png`;
- `desktop-manager-normal.png`, `tablet-manager-normal.png`,
  `tablet-manager-selection.png`, `tablet-manager-complete.png`;
- `game-menu-tablet.png`: skutečný start hry, s izolovanými testovacími
  odpověďmi ukládání a analytiky; nová inicializace ukládání proběhla před menu.
- `tablet-older-restore-blocked.png`: starší kopie na Macu je označená a
  pokus o její obnovení ponechá novější místní hru beze změny.

Stránky pro rodiče používají krátké popisky, samostatné karty profilů a velké
ovládací prvky. Byly prohlédnuty rozměry 1280×800, 1024×768 a 600×800, včetně
hoveru, stisku, výběru, zakázaného tlačítka a dokončení. Bez překryvů a
vodorovného přetečení. Nevznikají bitmapové rámy ani nové herní scény; vzhled
hráčského menu a výukové kapitoly se tím nemění. Toto ověření neslouží jako
schválení všech starších herních obrazovek podle `UI_PRE_READER_GATES.md`.

Celý `tsc --noEmit` nadále hlásí existující chyby v jiných scénách a testech.
V novém synchronizačním modulu, `SaveSystem.ts` a upraveném `main.ts` nebyly
hlášeny typové chyby.
