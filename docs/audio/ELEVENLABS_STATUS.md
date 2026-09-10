# ElevenLabs — stav přípravy

Obsazení potvrzené uživatelem: Zyx = Will, Pythia = Lily. Hlasová ID a model jsou v elevenlabs-batch.json.

Celkem 90 souborů: 45 efektů, 5 ambientů, tři pilotní hlasy a 37 dalších replik. Celková vykázaná spotřeba 2954 kreditů, bez zakoupení tarifu nebo navýšení.

Platný klíč remoteexam/prd byl použit s výslovným souhlasem uživatele; nebyl vypsán ani uložen. Vývojový klíč byl neplatný. Dočasný rate limit nezpůsobil duplikaci již uložených generací.

Všech 90 souborů technicky dekódováno. WAV poslechové kopie mají rezervu hlasitosti. Zdroje s výraznými špičkami: combat.swing, combat.spell, combat.retreat, pet.bind. Podrobnosti: technical-checks.json. Poslech schválil uživatel. Hudební smyčky používají prolínání; technické výsledky a omezení jsou v INTEGRATION.md.

Původní MP3: public/assets/audio/incoming/elevenlabs/. Poslechové WAV: public/assets/audio/previews/. Seznam: LISTEN.md. Prompty, modely, náklady a SHA-256: elevenlabs-generated.json.

Všechny finální nahrávky jsou zapojené. Spouštěče odpovídají dialogovým stránkám, vstupu do úkolu nebo výsledku akce. Historický nahrávací plán zůstává v dávce; aktuální integraci popisuje INTEGRATION.md. Zyxova výslovnost se zapisuje pro TTS jako Ziks, viditelně nadále Zyx. Jezerní víla zůstává neobsazená.

Hra používá místní soubory a samostatné nastavení hudby, řeči a efektů. Při hraní se nevolá API. Důležité dialogy se při odchodu zastaví a během řeči hudba zeslábne. Generátor bez --generate pouze zkontroluje dávku, nevolá API. Neopakovat nejistý požadavek bez kontroly historie.
