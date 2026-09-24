# Meč nesmí měnit základní útoky hrdiny

Playtest odhalil, že nákup meče +3 změnil `player.attack` z 2 na 5. Karta
postavy i aréna pak správně podle této chybné hodnoty zobrazily tři základní
útoky se silami 2, 2, 1. Navíc zůstal samostatný mečový příklad se silou 3.
Příčinou bylo dvojí započítání vybavení v `ShopScene.equipItem`, nikoli
zvýšení `player.level`.

## Opravené pravidlo

- Nákup ani výměna žádného meče nemění `player.attack` nebo `player.level`.
- Meče +1, +2 a +3 přidávají jednu vlastní úlohu s příslušnou základní silou.
- Základní sílu dál zvyšují dosavadní odměny ze zkoušek. Nepřepočítává se
  z úrovně, protože umístění do pásma a různé medaile nejsou totéž co síla.
- Karta postavy a popisek v obchodě ukazují `damageMultiplier` meče.
- `ProgressionSystem.migratePlayerState` u záznamů bez `attackPowerVersion: 1`
  odečte historický `attackBonus` právě vybaveného meče a označí migraci.
  Další načtení už nic neodečítá. Příprava, vybavení, mince i výukový postup
  zůstávají zachované. Neznámému ID vybavení migrace neodhaduje bonus.
- Legacy hodnoty `attackBonus` zůstávají v katalogu pro migraci a řazení.
  Produkční pravidlo bonusové úlohy a přípravných run se nemění.

Jde o migraci klientského JSON záznamu. Změna ani její testy nevyžadují SQL
migraci; server ukládá obsah hráče bez odstraňování nového příznaku.

## Ověření

- 72 testů v šesti sadách: `WeaponAttackProgression`, `CombatAttackSystem`,
  `CombatDamageSystem`, `PreparationSystem`, `SaveTransfer`, `CoopCasualMode`.
  Nová regrese nejprve selhala na původním chování. Kryje všechny katalogové
  meče, opakované načítání, následné odměny, import a střídání hráčů v co-op.
- 8 Playwright testů: platba a upgrade v obou obchodech; nákup +1 → +2 → +3;
  staré záznamy s každým z těchto mečů; skutečná karta a aréna; opětovné načtení.
  Desktop 1280×720 WebGL a tablet 1024×768 Canvas. Testovací `/v1/me` používá
  lokální odpověď, herní data jsou pouze v izolovaných kontextech prohlížeče.
- `npm run build:pilot` prošel. Playwright MCP navíc ověřil skutečný build na
  portu 8012 v obou rendererech: starý stav 5 + vybavený meč +3 se načte jako
  síla 2; kniha ukazuje 1, 1; bitevní sada má zdroje hráč/hráč/meč a síly 1, 1, 3.
- Kontrola TypeScriptu proti HEAD nezjistila nové diagnostiky (142 původních,
  141 v pracovním stromu); celý projekt tedy nemá čistý globální typecheck.
- `git diff --check` prošel.

## Prohlédnuté snímky

Použity brány `UI_PRE_READER_GATES.md` pro dotčené stavy: dva oddělené meče
a jejich čísla, samostatné vybavení, beze změny geometrie ovládání; krátké
popisky bez odstavců. Produkční průchod měl vypnutý herní zvuk. Nejde o nové
vizuální schválení všech dřívějších obrazovek a výukových stavů.

- `artifacts/weapon-attack/production-webgl-book.png`
- `artifacts/weapon-attack/production-canvas-book.png`
- `artifacts/weapon-attack/production-canvas-arena.png`
- `artifacts/weapon-attack/production-webgl-sword_wooden-tooltip.png`
- `artifacts/weapon-attack/production-canvas-sword_iron-tooltip.png`
- `artifacts/weapon-attack/production-webgl-sword_reinforced-tooltip.png`
- `artifacts/shop/tablet-canvas-sword_iron-book.png`
- `artifacts/shop/desktop-webgl-sword_reinforced-arena.png`

Čísla a popisky se vejdou do stávajících ploch; změněné hodnoty nemají překryvy.
Další snímky všech tří mečů a obou rendererů jsou ve stejných adresářích.
