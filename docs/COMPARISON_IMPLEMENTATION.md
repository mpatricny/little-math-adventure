# Krokodýl ve společném MathBoardu

21. 9. 2026. Schválený návrh je zapojený do hry. Historický obrázkový prototyp
zůstává v `docs/design-drafts/comparison-crocodile/`; jeho staré časy nápovědy
nejsou produkční nastavení.

## Průběh kapitoly

- Jedna tabule, jeden viditelný příklad, celá původní sada pro jeden útok.
  Správná první odpověď přidává dosavadní sílu úlohy. Chyba přidá nulu;
  názorná oprava ji nepřepisuje a nepřidává další pokus. `onComplete` předává
  součet a odpovídající pole výsledků, časů a pomoci přesně jednou.
- Úvod používá tutéž tabuli a předvede oba směry i rovnost. Krokodýl se přesune
  z volby do prázdného místa a sní větší nabídku. Objekty se následně obnoví,
  aby na tabuli zůstalo pravdivé porovnání. Rovnost ukazuje páry, nic nejí.
- Čtyři základní kroky: větší předmět → více předmětů → předměty s počtem
  → samotná čísla. Další dvě stávající etapy s výrazy a zkouška zůstávají.
- U porovnávání velikosti je větší jablko dvakrát širší a vyšší než menší,
  i když interní hodnoty sousedí. Rovnost zůstává přesná. Stejné pravidlo
  používají ukázka, souboj, zkouška, oprava i mobil. Počítané kusy se nezvětšují.
- První lekce velikosti má o 30 % delší pauzy i pohyby. Další lekce a běžná
  zpětná vazba zachovávají své tempo. Nastavení je `firstIntroDurationScale`.
- „Ukázka“ přehraje vysvětlení bez ztráty již vyřešených úloh. Rozpracovaný
  pokus označí jako podpořený. Během ukázky nejsou aktivní odpovědi ani měření
  odpovědního času. První automatický úvod sám nepodporuje následující pokus.
- Před odpovědí zůstává místo pro vztah prázdné. Vložený čistý znak má šířku
  52 px a přibližně výšku sousedních číslic; volby jsou větší. Hover i stisk
  pohybují plochou a symbolem společně, klikací kořen zůstává na místě.
  Po autorské připomínce používají všechny odpovědní tlamy a čisté znaky 90 %
  původní velikosti; jejich rámečky a klikací cíle se nemění.

## Nápověda potvrzená autorem

Nastavení je jediné: `src/data/comparison-learning.json`.

**Prvních pět zodpovězených příkladů s čísly a čistými znaménky: ihned. Od
šestého příkladu: vždy po 10 sekundách.** Počítají se správné i chybné odpovědi,
napříč útoky, štítem a mazlíčkem. Každý hráč má vlastní uložený `symbolAnswers`.
Připomínky u pozdějších výrazů mají vždy čekání 10 sekund.

Tlamy se zobrazují nad všemi třemi čistými volbami současně, bez vazby na
správný výsledek. Místo pro ně je rezervované, takže obsah neposkočí. Připomínka
nenapovídá výsledek (`reminderShown`, nikoli `assisted`) a neblokuje postup ke
zkoušce ani rychlostní bonus. Skutečná pomoc — opakování ukázky nebo dopočtení
výrazu — zůstává `assisted` a nepřidává samostatné zvládnutí ani rychlostní bonus.
Zkoušky a katakomby připomínky ani početní nápovědu nezobrazují.

Čekání používá pouze aktivní čas otázky. Skrytá karta, pauza scény, úvod,
zpětná vazba a čekání na předchozí příklad se nezapočítávají. Změna sady,
hráče, skrytí tabule a odchod ze scény ruší staré animace a callbacky.

## Zapojení a kompatibilita

- Také běžné porovnávání mimo krokodýlí kapitolu používá prázdné přerušované
  políčko a stejné velké znaky. `ComparisonExpressionView` zachovává celý výraz
  na každé straně, včetně tří členů, násobení a porovnání dvou výrazů ve vyšších
  pásmech. Vložený znak přibližně odpovídá výšce číslic; volby se přizpůsobují
  vnitřku daného tlačítka. Na tmavé tabuli se vložený znak kreslí světlým inkoustem
  přímo, aby měl stejný kontrast i v Canvasu bez podpory tintování obrázků.
- Smíšená běžná sada zůstává pohromadě ve stávajících řádcích MathBoardu.
  Nová prezentace neaktivuje krokodýlí lekci ani její nápovědu. Shodné políčko
  používají obrana, cechovní zkoušky, katakomby a mobilní ovladač; mobil dostává
  obě celé strany odděleně, nikoli vypočtené výsledky nebo prozrazené znaménko.

- `MathBoard` dál vlastní výsledky a vyhodnocení. `SequentialMathView`
  vykresluje postupnou prezentaci; nemá samostatné mastery ani účet útoku.
- `ComparisonProblemView` sdílí kresbu zadání se zkouškou a její zpětnou vazbou.
  Schválené SVG tlam a jablek jsou v `public/assets/ui/comparison/` a v katalozích
  textur/assetů. Obrázky se načítají přes stávající závislosti scén.
- `MathBoardComparisonLayout`, `ComparisonFeedbackLayout` a zkouškové hosty
  jsou v `scenes.json`; pozice, rozměry a depth se čtou přes `SceneBuilder`.
  Pergamen používá autorovaný 9-slice složený z Images, včetně Canvas fallbacku.
- BattleScene ponechává normální bonusový příklad meče, rozdělení síly,
  připravené runy, obranu a závěrečnou animaci skutečného útoku. Obrana se
  nadále odečítá jednou v existující soubojové logice.
- V patičce tabule je samostatný host `bonus` pro `⚡ +1` / `⚡ +2` za rychlé
  řešení početního i kapitolového porovnávacího příkladu. Jde o přírůstek do dosavadního ukazatele pod životy;
  naplnění čtyř políček přidá dosavadní bod poškození do celkového útoku.
  Odpověď se skutečnou pomocí nic nenabíjí. Obrázková zadání v souboji bonus
  dostávají také; ukázky, diagnostika a zkoušky jej nepřidávají.
- Štít používá stejnou tabuli s titulkem „Braň se“, jedním příkladem aktuální kapitoly nebo běžného opakování,
  ikonou síly štítu a příchozího útoku. Rychlá samostatná správná odpověď
  předvede `🛡 ×2`; pomalá dává základní blok, chyba nulu. Započítá se
  nejvýše příchozí poškození. Obrana nenabíjí útočnou rychlostní energii.
  Starý horní banner zůstává skrytý, aby nepřekrýval společný pergamen.
- Postup nápovědy je při sestavení sady převzatý od aktivního hráče. Průběžná
  kopie určuje čekání dalšího příkladu; dokončení sady zapisuje skutečné pokusy
  a jejich podporu jednou do příslušného savu. Co-op hráči se neovlivňují.
- `introVersionSeen` a `symbolAnswers` jsou doplněné při hydrataci starších
  savů. Původní počet pokusů z číselné etapy zachovává hranici pěti odpovědí. Zachovávají se stabilní ID etap, historie, arithmetic
  mastery a vybavení. Nevyžaduje se serverová databázová migrace.
- Mobilní ovladač dostává obrázkové porovnání a stejné nápovědy. Během ukázky
  a opravy nejsou publikované ovladatelné volby.
- Závěr porovnávací zkoušky ukazuje osm velkých značek správně/chybně, skóre
  a odměny pomocí ikon. Neopakuje starý textový výpis příkladů ani dlouhý komentář.

## Zkouška a katakomby

Cechovní ukazatel během kapitoly měří jejích šest etap. Zkouška se odemkne
po jejich splnění a načte osm úloh: velikost, počet, čísla a výraz. Nevyžaduje
početní `masteryKey`; její pokusy a medaile jsou uložené přímo v kapitole.

Porovnávání má vlastní výzvu plynulosti a mistrovství v katakombách. Navazují
po dokončené zkoušce, se stejnými počty správných odpovědí, přesností a rychlostí
jako početní výzvy (30 / 50 správných). Počítá se také pozdější procvičování
porovnávacích výrazů ze smíšených sad. Obě výzvy používají deset vyvážených
porovnání; neplatný klíč `comparison_symbols` se nikdy neposílá do početní databáze.

Katakomby mají pro obrázky vlastní editovatelné hosty, světlý znak na tmavé
břidlici, velké volby, prázdné políčko a stručný obrázkový úvod. Chyba i vypršení
času uloží jeden neúspěšný pokus. Úspěch uchová stav výzvy a skutečně zesílí
lišku o +1. V co-opu se stejné výzvy vyhodnocují automaticky po dostatečném
počtu nových odpovědí a odděleně pro oba hráče.

## Ověření

Funkční a vizuální kontrolu této integrace popisuje
[COMPARISON_RUNTIME_REVIEW.md](COMPARISON_RUNTIME_REVIEW.md).
Povinné podmínky dětského UI zůstávají v [UI_PRE_READER_GATES.md](UI_PRE_READER_GATES.md).
