# Runová liška: trvalý útok za katakomby

Každý úspěšně dokončený průchod katakombami přidává lišce **+1 k základnímu
útoku**. Platí pro plynulost i mistrovství, první osvobození i opakování stejné
zkoušky. Bonus se ukládá i před připoutáním lišky u Pythie. Porážka nic nepřidává
a opakované zavolání závěru stejného průchodu nesmí vyplatit další bod.

`CatacombPetProgress` spravuje jediný uložený čítač `player.catacombFoxBonus`.
Nemá původní strop +4. Staré `catacombPetUpgrades` převede při načtení na tehdejší
skutečný bonus (maximum mezi pásmy, nejvýše 4); již získaná síla tedy zůstává.
Jakmile existuje nový čítač, stará pole jej znovu nenavyšují ani neomezují.
Nejde o změnu databázového schématu. Server ukládá celý JSON profilu.

`getPetAttackPower` počítá sílu z katalogové definice a bonusu majitele. Stejný
výpočet používají Pythie, kniha postavy a obě lišky v souboji. BattleScene vytvoří
každému hráči vlastní kopii efektivní definice; společný katalog `pets.json`
zůstává beze změny. Příklad mazlíčka již nese celý útok, při zásahu se bonus
nepřičítá podruhé. Běžný bonus 2× za tři operandy se aplikuje na celý základní
útok a obrana protivníka se odečítá jednou přes `CombatDamageSystem`.

Výsledek ukazuje lišku, krátké „Útok +1“ a skutečnou změnu, například 10 → 11.
Používá existující hosty `CatacombTrialScene` v `scenes.json`; žádné nové pevně
umístěné prvky ani obrázky s textem. Počty odpovědí jsou zobrazené pomocí ✓ a ×.

## Regresní kontrola 21. 9. 2026

Výsledek: 10 jednotkových testů, 10 herních scénářů a pilotní build prošly.
Herní sada byla dokončena ve dvou částech (2 + 8); první pokus odhalil nestabilní
kliknutí testu ihned po změně viewportu. Test nyní čeká na dokončení přepočtu
plátna. Nebyla potřeba měnit produkční ovládání.

Příkazy:

```sh
npx vitest run --exclude 'artifacts/**' src/systems/__tests__/CatacombPetProgress.test.ts src/systems/__tests__/CombatDamageSystem.test.ts
npx playwright test -c e2e/catacombs/fox-progression.config.ts
npm run build:pilot
```

Nové herní scénáře projdou dvě celé zkoušky, zkontrolují přechod bonusu
4 → 5 → 6, opakovaný callback, skutečný reload uložené pozice, údaj u Pythie,
knihu postavy a běžný útok lišky. Útok 12 proti obraně 2 odebere 10 životů.
Co-op ověřuje dva různé majitele se silou 8 a 13, skutečný zásah a oddělené
uložení. Existující scénáře pokrývají první osvobození, špatnou odpověď, timeout,
porážku, opakování a načasování zranění při zásahu.

Vizuálně kontrolované snímky jsou v `artifacts/fox-progression/`: `canvas-*`
a `webgl-*` pro oba průchody, Pythii a souboj; `coop-A-*` / `coop-B-*` pro oba
majitele. Playwright MCP navíc ověřil `mcp-*-reward-hover`, `-pressed`, `-out`
a `mcp-*-character-book`. Kontrola zahrnuje desktop 1280 a tablet 1024, Canvas
i WebGL, zachování proporcí lišky, oddělené oblasti textu a tlačítek a textové
textury s rozlišením 2. Závěrečné tlačítko nemá zakázaný stav.

Známé omezení projektu: úplný TypeScript check obsahuje dřívější chyby;
tato úprava nepřidala novou diagnostiku. Kontrola se týká odměny a údajů lišky,
nikoli schválení všech starších textů a rozložení celé hry.
