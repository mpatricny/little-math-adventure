# Katakomby — souvislá pozadí pravého detailu

Playtest odhalil vrstvení dvou místností: původní celý sál zůstával za menší
malbou rychlostního oblouku a za obdélníkovou ilustrací štítu. Oprava mění
pouze kompozici pozadí v produkčním `CatacombProgressOverlay`.

## Provedení

Každý z těchto stavů nyní používá jediný obraz `catacombBackdrop`:

- `catacomb-painted-speed-panel-open-v3`
- `catacomb-painted-speed-panel-closed-v3`
- `catacomb-painted-shield-panel-v3`

Celé panely mají stejné rozměry 1584×993 a čtou polohu i hloubku ze stávajícího
editorového hostu `panel`. Rám, hlavička a levý podklad pocházejí z původní
malby. Pouze scénická oblast x517/y159/1053×821 má nový souvislý obsah.
Stupnice, její údaje, zámky, titulky a ovládání zůstávají oddělené runtime prvky.
Původní malé bitmapy `axis-hall` a `shield-demo` se už přes sál nevykreslují.

Vestavěný ImageGen doplnil chybějící zdivo a podlahu kolem dvou existujících
maleb. Export obnovuje původní střed rychlostního panelu, u štítu původní jádro
postav a efektu. Měkké okraje spojují outpainting s původní malbou; oba boční
pilíře přebírá souvislý outpainting, aby se nezdvojovaly držáky loučí.
Při exportu se poměry stran zachovávají. Nevznikl žádný generovaný text.

- Produkční exporty: `public/assets/ui/catacomb-background-v3/` (celkem přibližně
  594 KiB; největší rozměr 1584 px).
- Zdroje, přesné prompty a SHA-256:
  `docs/design-drafts/shared/catacomb-background-v3/`.
- Opakovatelný export: `node scripts/build-catacomb-background-assets.mjs`.
- Registry: `assets.json` a `textures.json`.
- Stávající `gateArt` očekávání v `e2e/catacombs/speed-levels.spec.ts` nyní
  identifikují skutečné celé panely otevřené/zavřené brány.

Navigaci, zjednodušení lekce a štítek lišky souběžně řešil implementační chat;
nejsou součástí této opravy pozadí. Uložený postup se nemění.

## Ověření

Před ověřením byla zkontrolována závislost na databázových migracích: změna
pozadí žádnou nevyžaduje. Testy používají syntetické profily, izolovaný server
8199 a zachycené dev-save/API požadavky. Rodinné savy ani server 8001 se
nerestartovaly nebo nepřepisovaly.

`playwright test --config artifacts/catacomb-background-review/review.config.ts`
prošel dvakrát: Canvas a WebGL, tablet 1024×600. Každý průchod ověřil ilustraci
štítu, Sčítání přes 10 s otevřenou branou a následně zamčený vyšší stupeň.
Ověřena je jedna kulisa správného stavu, absence starých překryvných bitmap,
zachovaný poměr stran a izolace zápisů. Prošlo také 12 testů manifestu assetů.

Všech šest skutečných snímků bylo vizuálně prohlédnuto:

`artifacts/catacomb-background-review/screenshots/`

- `canvas-speed-open.png`, `webgl-speed-open.png`
- `canvas-speed-closed.png`, `webgl-speed-closed.png`
- `canvas-shield.png`, `webgl-shield.png`

V celém rozsahu stupnice zůstávají dobře čitelné časy, uzly i portrét. Za ní
není druhý oblouk ani původní louče; štít navazuje na jedinou podlahu a jedny
boční pilíře bez obdélníkové hrany. Při kontrole nebyly nalezeny chybějící
textury, kolize textů ani přesahy safeRegion. Přejímka uplatňuje
`UI_PRE_READER_GATES.md`; změna nepřidává popisky ani nové ovládání.

Playwright MCP v tomto chatu odmítá další připojení kvůli používanému sdílenému
profilu. Profil nebyl ukončen; snímky a běžící produkční kompozice byly předány
implementačnímu chatu k jeho samostatnému MCP review.
