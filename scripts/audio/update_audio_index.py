#!/usr/bin/env python3
"""Rebuild the listening index from the generated manifest and technical checks."""
import collections
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
folder = ROOT / 'docs/audio'
report = json.loads((folder / 'elevenlabs-generated.json').read_text())
checks = json.loads((folder / 'technical-checks.json').read_text())
batch = json.loads((folder / 'elevenlabs-batch.json').read_text())
by_id = {c['id']: c for c in checks['assets']}
counts = collections.Counter(a['kind'] for a in report['assets'])
cost = sum(int(a.get('reported_credit_cost') or 0) for a in report['assets'])
voice_lines = [a for a in report['assets'] if a.get('phase') == 'voice']
flags = [c['id'] for c in checks['assets'] if c['flags']]
casting = batch.get('casting', {})
lines = ['# ElevenLabs — poslechová sada', '',
         f"{len(report['assets'])} souborů: {counts['sfx']} efektů, {counts['ambience']} ambientů a {counts['voice']} hlasových nahrávek. API vykázalo celkem {cost} kreditů.", '',
         '**Schválené obsazení: Zyx — Will, Pythia — Lily.** Model a nastavení zůstávají stejné jako ve schváleném pilotu. Jezerní víla zatím není obsazená.', '',
         'Uživatel schválil poslech a zapojení do hry. V produkci je 37 replik, 45 efektů a 5 ambientů; tři pilotní hlasy zůstávají pouze v archivu. Podrobnosti jsou v INTEGRATION.md. Technická kontrola sama nehodnotí výslovnost.', '',
         'WAV kopie mají špičky nejvýše přibližně −3 dBFS bez zesilování tichých zvuků. Krátké zvuky mají 3ms náběh/doběh, ambienty zůstávají na hranách nezměněné. Případné zkreslení zdroje tím nelze opravit.', '',
         'Zkontrolovat při poslechu zdrojové špičky: ' + ', '.join(flags) + '.', '']
groups = [
    ('Zyx — Will', lambda a: a.get('role') == 'Zyx'),
    ('Pythia — Lily', lambda a: a.get('role') == 'Pythia'),
    ('Původní hlasové ukázky', lambda a: a['kind'] == 'voice' and a.get('phase') != 'voice'),
    ('Efekty', lambda a: a['kind'] == 'sfx'),
    ('Prostředí', lambda a: a['kind'] == 'ambience'),
]
for title, include in groups:
    lines += ['## ' + title, '']
    for asset in filter(include, report['assets']):
        check = by_id.get(asset['id'])
        if not check:
            raise RuntimeError('Missing technical check: ' + asset['id'])
        audio = ROOT / check['previewFile']
        assert audio.exists()
        asset['sha256'] = hashlib.sha256((ROOT / asset['file']).read_bytes()).hexdigest()
        lines += ['### ' + asset['id'], '', asset.get('text', asset.get('trigger', '')), '',
                  f"Délka: {check['durationSeconds']:.2f} s. [Originál MP3]({ROOT / asset['file']}).", '',
                  f"![{asset['id']}]({audio})", '']
(folder / 'LISTEN.md').write_text('\n'.join(lines))
(folder / 'elevenlabs-generated.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
status = f'''# ElevenLabs — stav přípravy

Obsazení potvrzené uživatelem: Zyx = Will, Pythia = Lily. Hlasová ID a model jsou v elevenlabs-batch.json.

Celkem {len(report['assets'])} souborů: {counts['sfx']} efektů, {counts['ambience']} ambientů, tři pilotní hlasy a {len(voice_lines)} dalších replik. Celková vykázaná spotřeba {cost} kreditů, bez zakoupení tarifu nebo navýšení.

Platný klíč remoteexam/prd byl použit s výslovným souhlasem uživatele; nebyl vypsán ani uložen. Vývojový klíč byl neplatný. Dočasný rate limit nezpůsobil duplikaci již uložených generací.

Všech {len(checks['assets'])} souborů technicky dekódováno. WAV poslechové kopie mají rezervu hlasitosti. Zdroje s výraznými špičkami: {', '.join(flags)}. Podrobnosti: technical-checks.json. Poslech schválil uživatel. Hudební smyčky používají prolínání; technické výsledky a omezení jsou v INTEGRATION.md.

Původní MP3: public/assets/audio/incoming/elevenlabs/. Poslechové WAV: public/assets/audio/previews/. Seznam: LISTEN.md. Prompty, modely, náklady a SHA-256: elevenlabs-generated.json.

Všechny finální nahrávky jsou zapojené. Spouštěče odpovídají dialogovým stránkám, vstupu do úkolu nebo výsledku akce. Historický nahrávací plán zůstává v dávce; aktuální integraci popisuje INTEGRATION.md. Zyxova výslovnost se zapisuje pro TTS jako Ziks, viditelně nadále Zyx. Jezerní víla zůstává neobsazená.

Hra používá místní soubory a samostatné nastavení hudby, řeči a efektů. Při hraní se nevolá API. Důležité dialogy se při odchodu zastaví a během řeči hudba zeslábne. Generátor bez --generate pouze zkontroluje dávku, nevolá API. Neopakovat nejistý požadavek bez kontroly historie.
'''
(folder / 'ELEVENLABS_STATUS.md').write_text(status)
print(json.dumps({'assets': len(report['assets']), 'new_voice_lines': len(voice_lines), 'total_reported_credits': cost}))
