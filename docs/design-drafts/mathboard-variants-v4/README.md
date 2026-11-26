# MathBoard v4 — varianty a dopad útoku

Spuštěná ukázka: <http://localhost:8013/docs/design-drafts/mathboard-variants-v4/index.html>

Navazuje na autorem přijatý vzhled `mathboard-reference-v3`. Zachovává pergamen,
dřevěné odpovědi, tmavou kůži, zlaté rámy a modré kameny. Všechny číslice,
symboly, stavy tlačítek a animace jsou živé. V obrázcích není vygenerovaný text.

## Nový průběh tahu

1. Horní štítek ukazuje už nasbíranou sílu a přírůstek za aktuální příklad.
2. Správná odpověď přesune základní přírůstek do součtu.
3. Rychlostní bonus se přičte samostatně s bleskem. Renderer pouze zobrazí
   hodnotu, kterou vrátil skutečný řadič MathBoardu.
4. Další příklad začíná s novým součtem. Chyba ukáže nulu a názornou opravu.
5. Po celé sadě následuje útok. Štít se odečítá jednou od součtu celé sady.

Samostatný spodní štítek „Celkem“ je odstraněný. Pod postavami jsou životy;
u protivníka je kapacita jeho obrany.

Tlačítko **Dopad útoku** přehraje čtyři případy:

| Případ | Výpočet | Životy |
|---|---|---|
| Běžný zásah | 13 − 3 = 10 | 20 → 10 |
| Úplný blok | 2 − 2 = 0, kapacita štítu 8 | 20 → 20 |
| Nulový útok | 0 − 0 = 0 | 20 → 20 |
| Poslední životy | 13 − 3 = 10 | 6 → 0; skutečný úbytek 6 |

Animace postupně rozsvítí celkovou sílu, blok a zbývající zásah. U štítu se
objeví skutečně zachycená hodnota. U zasažené postavy vyletí úbytek životů a
změní se její číslo i ukazatel. Výpočet používá produkční
`resolveDamageAfterDefense`; kapacita štítu se nezaměňuje za skutečný blok.

## Proklikatelné formáty

| Skupina | Funkční vzorky |
|---|---|
| Počítání | Sčítání, odčítání, násobení, tři členy |
| Doplňování | Chybějící číslo, chybějící člen ve třech číslech |
| Porovnávání | Výraz a číslo, dva výrazy, tříčlenný výraz a číslo |
| Obrázkové kroky | Velikost 2:1, počet, počet s čísly, samotná čísla |
| Pozdější lekce | Výraz s pomocí, samostatný výraz |

Každý formát má normální stav, správnou odpověď, chybu s opravou a pokračování.
Porovnávání používá sdílené podklady a ukázky obou směrů i rovnosti. Prázdné
políčko neprozrazuje vztah. Pomoc nad odpověďmi má vyhrazenou řádku.

## Herní kontexty

### Dokončení prostředí — 18. 11.

Běžný útok, procvičování a běžný tah v co-op používají pěst. Samostatný útok
zbraní používá meč. Ikona pokračuje do tlačítka dokončení i rozkladu zásahu.
`ContextView.ts` přepíná skutečné prostředí hry, tematický rám a spodní ukazatel:
obchod s runami vybavení, cech s pečetěmi zkoušky, katakomby s osobní liškou.
V těchto kontextech nejsou bojové životy ani ovládání dopadu útoku.

Nové podklady: `assets/{shop,catacomb,exam}-frame.webp`, `assets/fist-{normal,active}.webp`.
Původ a přesné prompty: `context-prompts.json`; společný ořez dvojice:
`assets/context-normalization.json`. Všechny nové pozice jsou v `scenes.json`.

**Integrační hranice:** renderer je připraven k převzetí. Paměťová ukázka
nenahrazuje produkční řadiče přípravy, cechovní zkoušky ani katakomb. Jejich
počet pokusů, nové otázky po chybě, podmínky odměny a timer musí zůstat řízené
stávajícím systémem. Dolní symboly vizualizují výsledek; neudělují odměny.
Aréna se nebude měnit; volba režimu bude samostatný modal před soubojem.

- Útok, meč, mazlíček a procvičování: nasbíraná síla a osobní rychlostní bonus.
- Obrana: jeden známý příklad, příchozí útok 8 a štít 3; skutečný výsledek
  běžného/rychlého bloku z MathBoardu. Následný zásah míří na hrdinku.
- Příprava meče a štítu: ikona vybavení, získané runy a správné první odpovědi.
- Zkouška a katakomby: správné odpovědi; automatická pomoc vypnutá.
  Katakombový vzorek má aktivní limit 15 sekund.
- Dva hráči: oba portréty, zvýrazněný vlastník a předání po celé sadě.

Sady mají 1, 3 nebo 6 příkladů. Obrana zachovává jeden příklad. Vzorky jsou
odpovědní UI pro dané kontexty, nikoli kompletní mise či obchod s odměnami.

## Zdroje a hranice

- `VariantsView.ts`: volitelný renderer skutečného `MathBoard`.
- `ImpactView.ts`: přehrání výsledku celé sady přes sdílený výpočet obrany.
- `main.ts`: pouze paměťové scénáře. Pro osobní bonus používá skutečný
  `PersonalBattleBonuses` a ukázkovou historii deseti odpovědí po 8 sekundách.
  Není zde lokální kopie pravidla rychlosti ani starý systém čtyř nábojů.
- `scenes.json`: všechny statické hosty a bezpečné oblasti přes SceneBuilder.
- `prompts.json`, `assets/normalization.json`: generované vrstvy a jejich původ.
- `review/functional-review.json`: výsledky průchodu prohlížečem.

Vstup nemá inicializaci účtu, uložených her, analytiky ani databázový middleware.
Před testy byla zkontrolovaná závislost na migracích: tento náhled žádnou nemá.
Kontrola požadavků a úložiště potvrdila nula API zápisů a prázdné localStorage.
Produkční nasazení rendereru je další samostatný krok po vizuální revizi.

## Spuštění a ověření

```sh
npx vite --config docs/design-drafts/mathboard-variants-v4/vite.config.ts
node docs/design-drafts/mathboard-variants-v4/review/verify.mjs
npx vite build --config docs/design-drafts/mathboard-variants-v4/vite.config.ts
```

Playwright MCP byl obsazen jiným procesem. Ověření proto probíhá v samostatném
izolovaném Chromium přes Playwright, včetně skutečných kliknutí a dotyků.
Kontrola zahrnuje WebGL i Canvas, změnu velikosti, první odpověď, zrušení
animací při restartu, všechny typy příkladů a všechny kontexty.

Samostatný build prošel. Typecheck souborů náhledu nemá vlastní chyby; běh
závislostí hlásí tři existující chyby v `AssetFactory.ts` a `JourneySystem.ts`.
Nejsou upravované v tomto vizuálním náhledu.
