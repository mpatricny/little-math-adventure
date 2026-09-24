#!/usr/bin/env python3
"""Offline asset generation. Secrets stay in memory; no credentials enter game code."""
import argparse
import datetime
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
BASE = 'https://api.elevenlabs.io'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--generate', action='store_true', help='Without this flag, only inspect the batch locally.')
    parser.add_argument('--phase', choices=['pilot', 'P0', 'P1', 'P2', 'voice', 'playtest'], default='pilot')
    parser.add_argument('--max-credits', type=int, default=3000, help='Conservative batch estimate cap; never enables overage.')
    parser.add_argument('--doppler-config', help='Explicitly authorized RemoteExam configuration. Otherwise use ELEVENLABS_API_KEY environment variable.')
    args = parser.parse_args()
    batch = json.loads((ROOT / 'docs/audio/elevenlabs-batch.json').read_text())
    items = [i for i in batch['items'] if i['phase'] == args.phase]
    # Sound pricing is model/account dependent: conservative estimate checked against quota.
    estimate = sum(len(i['text']) * 2 if i['kind'] == 'voice' else int(i['duration_seconds'] * 40 + 1) for i in items)
    print(json.dumps({'phase': args.phase, 'items': len(items), 'estimated_credit_reserve': estimate, 'cap': args.max_credits}))
    if not args.generate:
        print('Local inspection only. No requests made and no audio generated.')
        return
    if not items or estimate > args.max_credits:
        raise RuntimeError('Empty batch or estimated usage exceeds explicit batch cap.')
    key = os.environ.get('ELEVENLABS_API_KEY', '').strip()
    if args.doppler_config:
        result = subprocess.run(['doppler', 'secrets', 'get', 'ELEVENLABS_API_KEY', '--plain', '--project', 'remoteexam', '--config', args.doppler_config], cwd='/Users/datamole/RemoteExam', capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError('Doppler could not retrieve the requested key. No credential output logged.')
        key = result.stdout.strip()
    if not key:
        raise RuntimeError('No ElevenLabs key available.')

    def request(path, body=None):
        headers = {'xi-api-key': key}
        payload = None
        if body is not None:
            payload = json.dumps(body).encode()
            headers['Content-Type'] = 'application/json'
        req = urllib.request.Request(BASE + path, data=payload, headers=headers)
        try:
            return urllib.request.urlopen(req, timeout=90)
        except urllib.error.HTTPError as exc:
            # Do not log untrusted server bodies, headers, or credentials.
            raise RuntimeError('ElevenLabs HTTP %s; stopped without automatic retry.' % exc.code) from None

    with request('/v1/user/subscription') as response:
        quota = json.load(response)
    count, limit = quota.get('character_count'), quota.get('character_limit')
    if not isinstance(count, int) or not isinstance(limit, int):
        raise RuntimeError('Cannot verify included credit balance; stopping.')
    remaining = limit - count
    print(json.dumps({'tier': quota.get('tier'), 'remaining_included_credits': remaining}))
    if remaining < estimate:
        raise RuntimeError('Insufficient included credits for conservative reserve; no generation started.')

    report_path = ROOT / 'docs/audio/elevenlabs-generated.json'
    report = json.loads(report_path.read_text()) if report_path.exists() else {'assets': [], 'in_flight': None}
    if report.get('in_flight'):
        raise RuntimeError('A previous request has an uncertain outcome. Check ElevenLabs history before retrying.')
    completed = {a['id'] for a in report['assets']}

    def save_report():
        tmp = report_path.with_suffix('.tmp')
        tmp.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
        tmp.replace(report_path)

    locally_accounted_cost = 0
    for item in items:
        if item['id'] in completed:
            print('Already generated:', item['id'])
            continue
        # Subscription counters can lag and repeated polling is rate limited.
        # Account for response costs locally against the conservative batch reserve.
        used = locally_accounted_cost
        reserve = len(item['text']) * 2 if item['kind'] == 'voice' else int(item['duration_seconds'] * 40 + 1)
        if used + reserve > args.max_credits or remaining - used < reserve:
            raise RuntimeError('Reached batch budget or included-credit reserve; stopping.')
        if item['kind'] == 'voice':
            path = '/v1/text-to-speech/' + item['voice_id'] + '?output_format=mp3_44100_128'
            body = {'text': item['text'], 'model_id': item['model_id'], 'language_code': 'cs', 'voice_settings': {'stability': 0.5, 'similarity_boost': 0.75}}
        else:
            path = '/v1/sound-generation?output_format=mp3_44100_128'
            body = {'text': item['prompt'], 'model_id': 'eleven_text_to_sound_v2', 'duration_seconds': item['duration_seconds'], 'loop': item['loop'], 'prompt_influence': 0.3}
        folder = ROOT / 'public/assets/audio/incoming/elevenlabs' / item['kind']
        folder.mkdir(parents=True, exist_ok=True)
        destination = folder / (item['id'] + '.mp3')
        if destination.exists():
            raise RuntimeError('Unregistered audio already exists: ' + item['id'])
        report['in_flight'] = {'id': item['id'], 'started_at': datetime.datetime.now(datetime.timezone.utc).isoformat()}
        save_report()
        with request(path, body) as response:
            audio = response.read()
            content_type = response.headers.get('Content-Type', '')
            cost = response.headers.get('character-cost')
        if not audio or not ('audio' in content_type or 'octet-stream' in content_type):
            raise RuntimeError('Unexpected generation response; inspect provider history before retry.')
        destination.write_bytes(audio)
        report['assets'].append({**item, 'file': str(destination.relative_to(ROOT)), 'request': body, 'created_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'reported_credit_cost': cost, 'bytes': len(audio), 'status': 'generated_not_listened', 'integrated': False})
        report['in_flight'] = None
        save_report()
        locally_accounted_cost += int(cost) if cost and cost.isdigit() else reserve
        print('Generated:', item['id'], len(audio), 'bytes', flush=True)
        time.sleep(2)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error) if isinstance(error, RuntimeError) else 'Generation stopped: ' + type(error).__name__, file=sys.stderr)
        sys.exit(1)
