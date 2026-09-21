# Krokodýl: zapojení do běžného souboje

21. 9. 2026. Původní plán byl proveden podle schváleného návrhu.
Aktuální chování, napojovací body, kompatibilita savů a podklady ke kontrole
jsou v [COMPARISON_IMPLEMENTATION.md](COMPARISON_IMPLEMENTATION.md).

Autor při zahájení implementace změnil čekání na **4 / 8 / 16 / 24 sekund /
vypnuto** a obnovování podpory na **jeden stupeň po každé chybě**. Starší
HTML prototyp s 0 / 3 / 6 / 10 sekundami není zdroj produkčního nastavení.

Zůstávají závazné tyto podmínky:

1. Společný MathBoard a původní pergamen. Jedna viditelná úloha ze sady pro
   celý útok; součet, první odpovědi a jeden dokončovací callback.
2. Čtyři kroky: velikost předmětu, počet předmětů, předměty s číslem, čísla.
   Krátká obrázková ukázka obou směrů a rovnosti na stejné tabuli.
3. Prázdný vztah před odpovědí. Vložený čistý znak přibližně vysoký jako
   číslice. Velké volby; plocha a symbol se při hoveru pohybují spolu.
4. Nápověda nad všemi třemi volbami, časovaná aktivním časem. Zobrazená
   pomoc je evidovaná; pouhé naplánování není pomoc. Stav patří hráči.
5. Žádné další poškození nebo mastery za demo a opravu. Zachovat meč,
   mazlíčka, runy, obranu, co-op a oddělení zkoušky od nápovědy.
6. Statické části v `scenes.json`, skutečná vizuální kontrola desktop/tablet,
   Canvas/WebGL a všech odpovědních stavů podle
   [UI_PRE_READER_GATES.md](UI_PRE_READER_GATES.md).
