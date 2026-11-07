# ElevenLabs — stav přípravy

Doplnění 7. 11. 2026: na žádost uživatele je v dávce `story` osm nových skutečných nahrávek, 152 vykázaných kreditů a 25,73 s řeči. Zyx má pět replik hlasem Will; jezerní víla tři hlasem Lily (zvolený stávající ženský hlas). Všech osm je dekódováno a zapojeno jako místní WAV; poslech nového obsazení a výslovnosti čeká na lidské schválení. Žádné automatické placené opakování; `in_flight` je prázdné. Podrobnosti a omezení v INTEGRATION.md, story-voice-checks.json a LISTEN.md.

## Historický stav 8. 9. 2026

Obsazení potvrzené uživatelem: Zyx = Will, Pythia = Lily. Hlasová ID a model jsou v elevenlabs-batch.json.

Celkem 90 souborů: 45 efektů, 5 ambientů, tři pilotní hlasy a 37 dalších replik. Celková vykázaná spotřeba 2954 kreditů, bez zakoupení tarifu nebo navýšení.

Platný klíč remoteexam/prd byl použit s výslovným souhlasem uživatele; nebyl vypsán ani uložen. Vývojový klíč byl neplatný. Dočasný rate limit nezpůsobil duplikaci již uložených generací.

Všech 90 souborů technicky dekódováno. WAV poslechové kopie mají rezervu hlasitosti. Zdroje s výraznými špičkami: combat.swing, combat.spell, combat.retreat, pet.bind. Podrobnosti: technical-checks.json. Poslech schválil uživatel. Hudební smyčky používají prolínání; technické výsledky a omezení jsou v INTEGRATION.md.

Původní MP3: public/assets/audio/incoming/elevenlabs/. Poslechové WAV: public/assets/audio/previews/. Seznam: LISTEN.md. Prompty, modely, náklady a SHA-256: elevenlabs-generated.json.

Všechny finální nahrávky jsou zapojené. Spouštěče odpovídají dialogovým stránkám, vstupu do úkolu nebo výsledku akce. Historický nahrávací plán zůstává v dávce; aktuální integraci popisuje INTEGRATION.md. Zyxova výslovnost se zapisuje pro TTS jako Ziks, viditelně nadále Zyx. Jezerní víla nově používá Lily; poslechové schválení je uvedené výše.

Hra používá místní soubory a samostatné nastavení hudby, řeči a efektů. Při hraní se nevolá API. Důležité dialogy se při odchodu zastaví a během řeči hudba zeslábne. Generátor bez --generate pouze zkontroluje dávku, nevolá API. Neopakovat nejistý požadavek bez kontroly historie.
