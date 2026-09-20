# Číslokraj — jednoduchý plán pilotu

Aktualizováno 11. 9. 2026: pilotní build, hosting, lehký landing, Google OAuth a první schéma účtů/savů jsou implementované. Cíl: rozeslat funkční hru několika kamarádům, ukládat postup a zjistit, jak se učí a kde hra potřebuje zlepšit. Google OAuth je lokálně ověřený; vytvoření produkčního OAuth klienta, tajemství v Doppleru, produkční migrace a nasazení čekají na výslovné dokončení vydání. Příkazy, rozsah a ověření jsou v [BUILD_VARIANTS.md](BUILD_VARIANTS.md).

## Rozsah pilotu

- Mathoria a les; konec po vložení lesního krystalu, s návratem do Mathorie. Silverpond, podvodní říše a assety potřebné pouze tam jsou vyřazené z pilotního balíku; vývojová hra je zachovává.
- Jeden běžný účet, pod ním až osm savů. Doporučení: začít Google přihlášením; e-mail/heslo přidat, pokud ho testeři potřebují.
- Současná mapa učení, informace u uzlů a přehled po dnech jsou společné dítěti i dospělému. Samostatná rodičovská aplikace nevzniká.
- Učební model a budoucí podobu mapy navrhuje autor hry. Nyní doplnit pouze výslovně požadovanou kapitolu `> < =` a podmínky pro předkládání porovnávacích úloh; celý model ani mapu nepřestavovat.
- Ukládat původní funkční data o učení navázaná na konkrétní save. Anonymizační pipeline, průzkumy a e-mailové insights jsou pozdější práce.
- Cloudflare pro hru, malé API a PostgreSQL na Railway, konfigurace přes Doppler. Pouze prostředí dev a prod.
- Běžný hosting bez vyhrazeného privátního serveru, zvláštního řešení EU jurisdikce a složité zálohovací infrastruktury.

## Práce, kterými můžeme začít

| Úkol | Konkrétní výstup | Kdy začít / ověření |
|---|---|---|
| **1. Menu a vydávání** | Vyčistit veřejné menu, webovou identitu a připravit produkční build. Jeden repozitář: vývoj na `main`, produkce z vybraného tagu. | **Hned.** Menu bez vývojových vstupů; ověřit desktop/tablet; další vývoj nezmění vydanou verzi. |
| **2. Hosting + Doppler** | Cloudflare doména a frontend, malé Node/TypeScript API, PostgreSQL; konfigurace `dev` a `prd`. | **Hned po buildu.** Hra a API fungují přes HTTPS, klient neobsahuje tajné údaje. |
| **3. Landing, přihlášení a savy** | Lehký web s about, screenshoty a principy učení; Google SSO/registrace, osm savů na účet. | Landing lze připravit hned, propojení po API. Ověřit první i další login a pokračování na druhém zařízení. |
| **4. Data a analýza pilotu** | Podrobné pokusy, průchod hrou, jednoduché grafy kategorií a míst, kde se hráči zdržují či končí. | Schéma **hned**, sběr po identitě savů. Ověřit správné přiřazení, časy, duplicity a filtry testovacích úseků. |
| **5. Chyby a nápady** | Automaticky zachytit exceptions, console.error, chyby loadingu/synchronizace; formulář a výpis reportů. | Klientskou část lze připravit hned. Chyba má stack/verzi/kontext a neopakuje se bez omezení. |
| **6. Zrychlit loading** | Změření startu, minimum pro menu/první hraní, pozdější scény načítané postupně. | **Hned, souběžně s hostingem.** Srovnat start před/po na stejném zařízení a síti. |
| **7. Kapitola porovnávání** | Názorný přechod velikost → počet → čísla a symboly → porovnávání výrazu; krátké vysvětlení při potížích. | Návrh a prototyp **hned**, instrumentace podle bodu 4. Bez znalosti symbolů nepředkládat aritmetické porovnávání. |
| **8. Zkusit s kamarády** | Průchod webem, přihlášením, hraním, uložením, návratem a reportem; ověření nového porovnávání. | Po základech. Opravy podle skutečných zkušeností, bez čekání na kompletní budoucí mapu. |

**Stav bodu 2 k 11. 9. 2026 — hotovo:** frontend a custom domény běží přes HTTPS
na Cloudflare, API a PostgreSQL jsou online na Railway a Doppler `prd` je
průběžně synchronizovaný do služby `api`. Delegace u CZ.NIC míří na Cloudflare,
`cislokraj.cz` i `www.cislokraj.cz` vracejí pilot `0.1.0` a Railway má pro
`api.cislokraj.cz` platný TLS certifikát i zdravý `/ready` endpoint.

První pracovní balík: **1 + 2**, paralelně lehký landing, návrh událostí a měření loadingu. Kapitolu porovnávání připravit jako samostatnou funkci s dohodnutým rozhraním událostí; ostatní práce nečekají na autorův budoucí model mapy. Podrobné události sbírat už od prvních testerů — chybějící původní odpovědi později nedopočítáme.

## Webový vstup

Menu má FIT škálování, fullscreen a dotykové základy. Pilotní build už vypíná vývojové zkratky a debugger; vývojový build je zachovává. Obě varianty mají samostatné adresy a výstupní složky. HTML a manifest používají Číslokraj, nefunkční Vite favicon je odstraněná. Lehký webový vstup je implementovaný jako samostatný Vite dokument bez Phaseru a tří skutečných screenshotů pilotu; před veřejným vydáním ještě zbývá nahradit obrázkové logo s původním názvem přímo ve hře.

`cislokraj.cz` bude lehký responzivní landing; hra na `/hra/`. Landing obsahuje jasné **Hrát**, krátké „Co je Číslokraj“, tři skutečné screenshoty vydávané verze, principy učení, podporovaná zařízení a označení pilotu. Principy popsat konkrétně: procvičování v dobrodružství, přizpůsobování úloh, návraty k obtížným příkladům a názorné vysvětlení. Rozlišit existující mechanismy a připravované funkce; zatím neslibovat prokázaný učební účinek.

Landing nesmí načíst Phaser ani celé herní assety. Herní zákaz scrollování, gest a omezení orientace patří pouze do hry. Google tlačítko řeší přihlášení i automatické vytvoření účtu při první návštěvě; není nutný druhý registrační formulář. Po přihlášení následuje výběr osmi savů. Stávající místní postup lze přenést bez tichého přepsání cloudu.

## Jak jednoduše vydávat a provozovat

`main → dev`; ručně vybraný otestovaný commit/tag → `prod`. Pro stabilní lokální kopii lze použít další Git worktree. Není potřeba fork, třetí stagingové prostředí ani rozsáhlá reorganizace projektu.

Dev a prod mají oddělenou DB a přístupové údaje. Nejlevnější začátek je místní dev API + dev PostgreSQL a prod na Railway. Pokud chceme sdílet rozpracovanou verzi, stejný dev nasadíme na `dev.cislokraj.cz` s vlastní DB. Dvě stále běžící cloudová prostředí spotřebovávají více RAM/CPU než jedno.

Cloudflare Workers Static Assets obslouží frontend; malé Railway API přihlášení, savy a data. Doppler dodá konfiguraci pro vývoj i produkci. R2 přidat až při konkrétní potřebě médií nebo příloh. [Cloudflare Static Assets](https://developers.cloudflare.com/workers/static-assets/), [Doppler–Railway](https://docs.doppler.com/docs/railway).

Před prvním commitem/buildem vyloučit skutečné `.env`, soukromé doklady a editorové databáze z publikovaných souborů. Vycházet z čistého checkoutu včetně LFS assetů. Automatizovat build a relevantní testy; před DB testy ověřit potřebné migrace. Každé vydání označit verzí, aby šly dohledat chyby.

## Přihlášení a savy

Doménový základ je připravený v `server/migrations/0001_accounts_and_save_slots.sql` a
`docs/SAVE_DATA_MODEL.md`: účet, externí identity a sloty 1–8 s vlastním `save_id`,
verzí formátu, optimistickou revizí a JSON stavem. Migrace prošla integračním testem
na izolované lokální PostgreSQL. `0002_google_auth.sql` a Better Auth 1.7.4 přidávají
Google přihlášení, relační cookie a automatické propojení Google subject s herním
účtem; produkční OAuth údaje, aplikace migrace a nasazení zůstávají vydávacím krokem.

Doporučuji **Google jako první možnost**, například přes Better Auth. Odpadne správa hesel a e-mailů pro jejich obnovu. Pokud bude potřeba e-mail/heslo, přidat je přes stejnou knihovnu včetně obnovy hesla. [Google přihlášení v Better Auth](https://better-auth.com/docs/authentication/google).

Jeden účet vlastní všech osm slotů. Bez rodin, přiřazování dětí, párovacích kódů a rozdílných rodičovských oprávnění. Z Google účtu využít údaje potřebné pro přihlášení; skutečné jméno a fotografii nepotřebujeme ukládat do hry.

Zachovat současné místní savy a import/export. Přidat tabulku `saves`: účet, číslo slotu, ID konkrétního savu, verze formátu, revize, JSON se stavem a čas. Nová hra ve znovu použitém slotu dostane nové ID, aby se nemíchala historie.

Síťový upload běží mimo herní save/load, aby nezdržoval hraní ani střídání A/B. Při výpadku zůstává místní kopie, po návratu připojení se odešle. Cache se odděluje podle účtu; původní místní sloty se při prvním přihlášení převedou bez tichého přepsání obsazených cloudových slotů.

Ponechat dvě malé pojistky: server kontroluje vlastníka a očekávanou revizi. Starý save nepřepíše novější; při konfliktu stačí pozastavit synchronizaci a nabídnout zachování/export místní kopie nebo načtení serverové. Automatické slučování a komplexní řešení paralelního hraní odkládáme. Rozlišovat „uloženo v zařízení“ a „uloženo na serveru“.

## Data, přehled a reporty

Podrobný sběr může zůstat v jedné tabulce `learning_events` v PostgreSQL. Odesílat v dávkách, lokálně uchovat do potvrzení; ID události brání duplicitám. Uchovávat původní pokusy, ne pouze hotová procenta. Současná mapa a denní přehled zůstávají hráčským rozhraním; interní analýza může začít SQL dotazy/exportem a jednoduchými grafy.

| Události | Potřebná data |
|---|---|
| Zobrazení úlohy, odpověď, opuštění | ID prezentace, zadání/operandy, forma, dostupné možnosti, skutečná odpověď, správnost, první pokus/oprava, pomoc, čas od viditelného a ovladatelného zadání |
| Vysvětlení a procvičení | Co vysvětlení spustilo, použitý postup, zavření/dokončení a výsledek následující nové úlohy bez pomoci |
| Postup kategorií | Stabilní ID kategorie, rozsah/obtížnost, původní a nový mastery stav, verze pravidel; počáteční umístění a import odděleně |
| Průchod hrou | Začátek sezení, vstup/výstup a dokončení scény, místnosti, boje či hádanky, neúspěch, opakování, nápověda |
| Časy a technický stav | Viditelnost karty, pauzy, krátký heartbeat, poslední aktivita, čekání na loading/síť, relevantní chyba |

Společně: save ID, session ID, pořadí událostí, čas klienta i přijetí serverem, verze hry/obsahu a základní typ zařízení/ovládání. U co-op zachytit správný save už při vzniku události. Čas počítání oddělit od animace, hlasového zadání, skryté karty a loadingu. Dlouho bez kliknutí může dítě přemýšlet; odhad neaktivity musí být rozeznatelný od skutečné pauzy. Zavření karty nemusí poslat závěrečnou událost, proto konec někdy jen odhadneme z posledního kontaktu.

**První interní přehledy:**

- **Kategorie:** průběh jednotlivého savu, samostatná přesnost prvního pokusu, medián času správných odpovědí, pomoc, počet pokusů a postup. Srovnat začátek a pozdější výkon při stejné formě a obtížnosti, ideálně i po návratu jiný den.
- **Skupina:** průměr a medián výsledků jednotlivých savů, počet hráčů a rozpětí. Primárně dát každému savu stejnou váhu; odlišit statistiku hráčů od statistiky všech pokusů. Bez identit jednotlivých osob měříme savy, nikoliv spolehlivý počet dětí.
- **Délka hraní a průchody:** rozdělení času hraní, návraty, podíl hráčů, kteří místo zahájí/dokončí, opakování, poslední navštívená místa a jejich vztah k chybám či nápovědě.
- **Místa zpomalení:** čas a úspěšnost po úsecích proti dřívějším srovnatelným úlohám stejného savu; rozlišit větší obtížnost, přemýšlení, pauzu a technické čekání.

Grafy zarovnávat podle první zkušenosti s kategorií nebo počtu pokusů, nejen kalendářního data. U času do zvládnutí ukázat i ty, kteří zatím nedokončili; průměr pouze z úspěšných by zkresloval obraz. U malého pilotu uvádět počty a jednotlivé průběhy. Delší hraní nemusí znamenat zábavu a poslední scéna nemusí být příčinou odchodu; tyto signály doplníme krátkou zpětnou vazbou kamarádů.

**Hraní dospělým/testování:** nabídnout jednoduché označení aktuálního úseku „zkouší dospělý“ a interně možnost záznamy označit. Rychlé správné odpovědi napříč obtížnostmi nebo náhlá změna tempa jsou podnět k prověření, nikoliv důkaz věku. Rychlé dítě, známý příklad, tipování nebo chyba měření mohou vypadat podobně. Automaticky označené úseky zachovat s důvodem/verzí pravidla a zobrazovat analýzu s nimi i bez nich; označené či potvrzené dospělé/testovací úseky standardně vyřadit z dětského souhrnu. Neodstraňovat syrová data ani plošně celý save. Bez věku nejde vytvářet věkové normy.

Také změny mastery způsobené dospělým oddělit od doloženého dětského pokroku. Samotné odfiltrování rychlých odpovědí nestačí, pokud mezitím dospělý posunul uloženou úroveň; herní postup kvůli analytickému filtru zpětně nepřepisovat.

**Automatické chyby:** `error`, `unhandledrejection`, explicitní `console.error`, neúspěšný asset/API/save a serverové chyby. Připojit stack, vydání, scénu, save/session, problem ID, renderer/ovládání, loading/sync stav a omezený seznam posledních akcí. Zapnout konkrétní zachytávání konzolových chyb; samotný exception handler je nezachytí všechny. Deduplikovat stejnou chybu zachycenou více cestami, omezit opakování a nikdy neposílat login tokeny, cookies nebo plný stav účtu. Sentry lze použít pro tuto technickou část, bez nahrávání obrazovky. [Sentry: console errors](https://www.sentry.help/en/articles/13965172-javascript-why-is-sentry-not-catching-console-errors).

Vedle toho formulář **Chyba / Nápad**, text a stejný herní kontext; jednoduchý chráněný výpis se stavem nové/vyřešené. Screenshoty a rozsáhlý workflow později. [FakturoKrab — vzor](/Users/datamole/fakturoKrab/packages/osvc/client/src/components/FeedbackButton.tsx:127).

Anonymizační pipeline nyní nevzniká; data jsou spojená se savem. Počet 20 hráčů není obecná hranice GDPR a údaje přiřaditelné účtu mohou být osobními údaji. Zůstává stručná informace o sběru a běžná ochrana přístupu. [Evropská komise](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/application-gdpr_en).

## Kapitola: porozumění `> < =`

Zařadit **za A2, před A3**. Před dokončením kapitoly vyřadit porovnávání z běžných úloh a zkoušek A1/A2 a nahradit je dostupnými aritmetickými formami, při zachování počtu úloh a podmínek zkoušek. Stejná podmínka platí pro opakování a vybavení. Kapitola používá společná pravidla modulové zkoušky, aktuálně 8 úloh a medaile od 5/6/7 správných odpovědí. Aktuální samostatné zadání včetně bojových změn je v [COMPARISON_COMBAT_SHOP_PLAN.md](COMPARISON_COMBAT_SHOP_PLAN.md).

| Krok | Obsah |
|---|---|
| **1. Velikost → krokodýl → symbol** | Od první úlohy vybírat znak pro velikost předmětů. Tlama krokodýla vysvětluje orientaci `<` a `>`, rovnost má vlastní vysvětlení. |
| **2. Počet → krokodýl → symbol** | Znak pro počet kusů; později obměnit velikost a rozmístění předmětů. |
| **3. Čísla → krokodýl → symbol** | Orientaci tlamy přenést na porovnávání číselných hodnot. |
| **4. Čísla → symbol** | Samostatné rozhodnutí bez automaticky zobrazovaného krokodýla. |
| **5. Výraz s nápovědou** | Výraz proti číslu; po 15 sekundách aktivního zadání ukázat výsledek výrazu, symbol zvolí dítě. |
| **6. Výraz samostatně** | Bez automatického výsledku; následuje smíšená zkouška velikosti, počtu, čísel a výrazů podle společných pravidel. |

Výraz „větší předmět“ důsledně odlišit od „více předmětů“. Rovnost znamená stejný počet/hodnotu na obou stranách, ne pokyn napsat výsledek. Přechod od konkrétních množin přes párování a počítání k číslům odpovídá doporučení IES; přesné pořadí herních scén a limity úspěšnosti jsou náš návrh k ověření. [IES — Teaching Math to Young Children](https://ies.ed.gov/ncee/wwc/Docs/practiceguide/early_math_pg_111313.pdf).

Při opakovaných chybách nabídnout krátké názorné vysvětlení, několik jednodušších úloh a potom **nové ověření bez pomoci**. Vyhodnocovat první odpovědi, jednotlivé vztahy a reprezentace; úspěch jen na `>` nestačí. Jedna chyba ani pomalé přemýšlení nemají spouštět návrat. Konkrétní velikost okna a hranice úspěšnosti nastavíme jako laditelné parametry pilotu, ne jako hotový důkaz porozumění.

U chybného `a + b ? c` krátce oddělit výpočet levé strany od porovnání výsledných čísel. Podle odpovědí pomoci se sčítáním, počtem nebo orientací symbolu. Zavření vysvětlení tlačítkem „Rozumím“ není úspěšný pokus. Procvičování probíhá bez tlaku na rychlost a bez ztráty ostatního postupu. Využít stávající vizualizér vysvětlení jako základ, dodržet herní výtvarný styl a editorové hosty.

Do dat přidat stupeň kapitoly, obě hodnoty, počty/velikostní podmínku obrázků, očekávaný a vybraný symbol a samostatný/pomáhaný pokus. Tak půjde rozlišit záměnu `<` a `>`, nepochopení rovnosti, velikost versus počet a chybu samotného výpočtu.

Tříoperandové úlohy mají všechna čísla zadaná: hledá se výsledek nebo porovnává jeho hodnota. Vyřadit hledání chybějícího operandu ze všech zdrojů včetně uložených aktivních front; historii zachovat. Výsledek i mezivýsledky zůstanou nezáporné. Zkoušky doplnit povolenými formami do původního počtu. Náročné tříoperandové výsledky i porovnávání dávají 2× poškození; celý plán zároveň řeší jedinou obrannou úlohu na štít a třetí sadu vybavení.

## Zálohy: stačí jednoduché nastavení

**Dev databáze není záloha produkce.** Doporučuji v Railway zapnout denní zálohu prod a zachovat export savů ve hře. Denní zálohy se nastavují v administraci a uchovávají šest dní; platí se pouze přírůstkové místo stejnou sazbou jako volume, aktuálně **0,15 USD/GB/měsíc**. Například 1 GB účtovaného zálohovacího místa po celý měsíc vyjde na 0,15 USD navíc za úložiště, nikoliv za celý hosting. [Zálohy](https://docs.railway.com/volumes/backups), [ceník](https://docs.railway.com/pricing/plans).

Pro malou DB je to typicky drobný náklad a nastavení bez vlastní implementace. Jednou ověřit postup obnovy na testovacích datech. Při havárii může denní záloha znamenat ztrátu změn od poslední zálohy; místní savy mohou pomoci. Smazání celého volume odstraní i jeho Railway zálohy.

Pokročilou obnovu a samostatné zálohovací servery nyní vynechat.

## Loading a krátké ověření pilotu

Oddělení obsahu snížilo katalog textur z 60,65 MiB na 37,01 MiB. Nejde o změřený přenos ani čas startu. Dále změříme start, potom oddělíme menu/první hraní a další oblasti. Přednačítat další pravděpodobnou scénu během hraní. Před spuštěním scény musí být dostupné i závislé UI šablony a animace, při chybě nabídnout opakování.

Při vydání uchovat soubory používané otevřenou starší hrou, včetně později načítaného JavaScriptu. Nemíchat během hraní assety různých vydání.

Před rozesláním doložit: web/menu/login; izolaci účtů a obnovu savu na jiném zařízení; výpadek sítě a co-op; správné časy/přiřazení/filtry událostí; příjem konzolové chyby i reportu; průchod novým porovnáváním a návrat k vysvětlení; normální hraní a loading na počítači/tabletu. Ověřit i scénář „tři malé a tři velké předměty = stejný počet“ a směr vztahu po prohození stran.

**Později:** učební model podle autorova návrhu, nová mapa, případné e-mailové insights, průzkumy, anonymizované analýzy a další příprava širšího veřejného provozu. Tyto věci neblokují výše uvedené práce.
