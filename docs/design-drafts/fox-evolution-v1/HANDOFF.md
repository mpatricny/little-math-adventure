# Runová liška — návrh vývoje vzhledu

18. listopadu 2026. Výtvarný návrh k posouzení podle zadání z implementačního
chatu a `../../PRACTICE_JOURNEY_PROPOSAL.md`. Produkční postava, animace,
pravidla, odměny ani uložené hry se nemění.

## Prohlédnout

- Galerie: `http://localhost:8013/docs/design-drafts/fox-evolution-v1/index.html`
- Kombinace: `index.html?view=layers`
- Bojové měřítko: `index.html?view=battle`
- Tabule podob: `fox-evolution-overview.png`
- Tři stupně schopností: `fox-abilities-overview.png`
- Detail vrstev: `fox-layers.png`
- Skutečné malé měřítko: `fox-battle-scale.png` a `review/actual-scale-comparison.png`

## Doporučený směr

Zachovat oranžovou lišku, bílou hruď, výrazné uši, zdviženou tlapku a zahnutý
ocas. Vyšší podobu odlišit velkými barevnými plochami; drobné další čáry se na
tabletu ztratí. Základ zůstává přirozený. **Blesk** zvýrazní několik širokých
tyrkysových run a pruhy ocasu. **Jako blesk** přidá větší bílou část ocasu,
bílé ponožky a jednu výraznou tyrkysovou spirálu se zlatým okrajem.

Navrhuji, aby tělo používalo nejvyšší již získanou podobu a nebylo obarvované
podle právě vybraného modulu. Získání II/III u další schopnosti pak mění její
runu a efekt, nikoli znovu celé tělo. To je návrh zobrazení, ne implementované
pravidlo. Stávající Plynule/Mistr a jejich odměny +1 útok zůstávají zachované;
vyšší podoby neznačí další automatické +1.

## Rozdělení na vrstvy

| Vrstva | Obsah | Výroba a skládání |
| --- | --- | --- |
| Tělo | Tři základní podoby srsti a širokých run | Později tři sladěné sady skutečných animací. Ne nová sada pro každou kombinaci schopností. |
| Společný rám | Jeden zlatý medailon s navy středem | `assets/rune-frame.webp`, stále stejná silueta; pohybuje se s ikonou uvnitř pevného hit area. |
| Runa schopnosti | Štít, srdce s listy, blesk; každý ve třech stupních | Devět sdílených bitmap, nezávislých na těle a jeho animaci. Vyšší stupeň mění velký obrys a ornament, nejen barvu. |
| Krátký efekt | Průhledná ochrana na hrdinovi, srdce k hrdinovi, projektil a zásah nepřítele | Zapíná se při použití. Postava sama zde není procedurálně animovaná. |
| Stav a hodnoty | Jedno použití, dočasný zákaz, účinek útoku 1/2/3 | Runtime vrstvy. Jediné světlo znamená připravené použití, po použití ikona zhasne. Během obrany se objeví zámek bez spotřeby. |

Připravený příklad kombinuje **štít II, léčení I, útok III** na jedné lišce.
V přehledu Schopnosti jde každý stupeň změnit samostatně. Kombinace se pak
přenese do detailu vrstev i do arény. Římské stupně a vysvětlující texty jsou
součástí návrhářské galerie; v samotném bojovém náhledu nejsou odstavce.

Štít pomáhá vlastnímu hrdinovi, proto se v aréně vykresluje kolem hrdinky.
V detailu vrstev je pole u lišky jen pro rozbor kompozice, nikoli změna cíle
schopnosti. Léčení má v této galerii pouze obrazový efekt; jeho číselný účinek
ani hodnota štítu nejsou domyšlené místo dosud chybějícího balancu.
Útok ukazuje skutečně zadanou velikost 1/2/3 HP na fiktivním nepříteli s 12 HP.
Nejde o přepsaný CombatDamageSystem ani skutečnou bojovou scénu.

## Reference a výroba obrázků

Před generováním byly prohlédnuté:

- `public/assets/sprites/catacombs/rune-fox-compact.webp`, první buňka 512 × 512,
  zde beze změny v `assets/source-idle.png`;
- `public/assets/sprites/portraits/rune-fox-sheet.webp`;
- schválená odměnová ilustrace `../training-flow-v5/assets/fox-reward.webp`;
- rámový jazyk `../training-modes-v1/05-personal-fox-art.png`.

Použitý nástroj: vestavěný `image_gen`. Přesné prompty jsou
`assets/prompts.json` a `assets/frame-prompt.json`. Původní vybrané výstupy
zůstávají v `assets/sources/`. `assets/build.mjs` provádí opakovatelný export
WebP se skutečnou průhledností. Všechny tři podoby mají jeden společný výřez
a transformaci, výslednou buňku 512 × 512 a stejnou základnu. Stupně každé
rodiny ikon také používají jeden společný výřez; žádné samostatné ořezávání
podle velikosti svitu. Konkrétní rozměry jsou v `assets/normalization.json`.

První výstup podob měl příliš malou rezervu u nejvyššího ocasu; byl znovu
vygenerovaný s bezpečným okrajem. Samostatný atlas efektů neprošel vizuální
kontrolou kvůli bílým předělům a okrajům, proto se nepoužívá. Náhledové efekty
skládají vybrané ikony a průhledné kódové pole štítu. Nejde o hotové VFX.

## Měřítko, ověření a omezení

Současný BattleScene používá `petDef.scale (0,5) × PET_BASE_SCALE (0,5)`.
Buňka 512 px tak zabírá **128 herních pixelů**; postava se obrací doprava
stejně jako ve hře. Místní `scenes.json` má samostatné hosty, hloubky a safe
inset pro arénu a detail vrstev. Návrhářské okraje stránky zmenšují skutečnou
šířku: při viewportu 1024 má buňka v náhledu přibližně 96 CSS px; při 768
zhruba 73 px. Náhled proto malé měřítko nezvětšuje ve svůj prospěch.

Prohlédnuté snímky z desktopu i tabletových viewportů, bez slov a při reduced
motion, uvádí `review/visual-review.json`. Proklikané kontroly ověřily
nezávislé stupně, jediné použití, 12 → 9 pro útok III, zákaz během obrany bez
spotřeby, reset uprostřed efektu, checkboxy vrstev a stabilní stisk/pointer-out.
Nejmenší bojový ovladač na viewportu 768 má přibližně 69 × 68 CSS px.
Není zde databáze, migrace, API ani zápis do local/session storage.

**Není to výrobní schválení spritesheetů.** Návrhy dobře zachovávají charakter,
ale model mírně změnil proporce proti současnému snímku. Před výrobou je nutné
odsouhlasit jednu kanonickou anatomii, porovnat překrytí siluet a zpřesnit
všechny tři podoby. Tato galerie netvrdí, že nové snímky lze jen zaměnit
uprostřed stávající animace. Rozpoznání stupňů dítětem na fyzickém tabletu
je ještě potřeba ověřit; zde proběhla vizuální kontrola v emulovaných rozměrech.

Produkční idle/attack/hurt se poté vyrábějí skutečným image-to-video modelem
podle `docs/ASSET_CREATION.md`. Žádné natahování, morfování nebo prolínání
celých postav jako náhrada pohybu. Všechny snímky sdílejí výřez, měřítko,
baseline a origin; celé postavy i efekty mají bezpečné okraje. Nové atlasy
mají nepřekročit 2048 px na stranu. Konkrétní mapa modulů ke schopnostem,
vyvážení, ovládání v co-op a produkční integrace zůstávají dalším krokem.
