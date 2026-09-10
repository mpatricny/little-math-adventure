#!/usr/bin/env zsh

set -euo pipefail

read -rs SORC_API_KEY
printf '\n'

readonly SORC_API='https://sorceress.games/api/v1'
readonly ANIMATION_ASSET_ID='ad2ecc60-6bde-4088-be72-21cc5d1ce5ad'
readonly FROG_OUT='/Users/datamole/little-math-adventure/artifacts/sorceress/silverpond-frog'
readonly KEYED_SHEET="$FROG_OUT/autosprite3-every4-tolerance40.png"
readonly KEYED_META="$FROG_OUT/autosprite3-every4-tolerance40.json"

mkdir -p "$FROG_OUT"

post_tool() {
  local tool_id="$1"
  local body="$2"
  curl -fsS -X POST "$SORC_API/tools/$tool_id" \
    -H "Authorization: Bearer $SORC_API_KEY" \
    -H 'Content-Type: application/json' \
    --data-binary "$body"
}

PING_JSON=$(post_tool ping '{}')
if ! jq -e '(.success // true) != false' <<< "$PING_JSON" >/dev/null; then
  echo 'Sorceress ping failed.'
  exit 1
fi
echo 'Sorceress key accepted.'

KEY_REQUEST=$(jq -cn \
  --arg assetId "$ANIMATION_ASSET_ID" \
  '{
    assetId:$assetId,
    sampleEvery:4,
    keyColor:"auto",
    tolerance:40,
    maxSide:512,
    force:true
  }')
KEY_JSON=$(post_tool autosprite_key "$KEY_REQUEST")
KEY_JOB_ID=$(jq -r '.data.jobs[0].jobId // .jobs[0].jobId // .data.jobId // .jobId // empty' <<< "$KEY_JSON")
if [[ -z "$KEY_JOB_ID" ]]; then
  echo 'AutoSprite V3 did not return a keying job.'
  jq '{success,error,dataKeys:(.data|keys?)}' <<< "$KEY_JSON"
  exit 1
fi
echo "AutoSprite V3 job submitted: $KEY_JOB_ID"

KEY_STATUS='queued'
KEY_JOB_JSON='{}'
for POLL_INDEX in {1..120}; do
  KEY_JOB_JSON=$(curl -fsS "$SORC_API/jobs/$KEY_JOB_ID" \
    -H "Authorization: Bearer $SORC_API_KEY")
  KEY_STATUS=$(jq -r '.data.status // .status // .job.status // empty' <<< "$KEY_JOB_JSON")
  if [[ "$KEY_STATUS" == 'succeeded' || "$KEY_STATUS" == 'completed' ]]; then
    echo 'AutoSprite V3 keying succeeded.'
    break
  fi
  if [[ "$KEY_STATUS" == 'failed' || "$KEY_STATUS" == 'cancelled' ]]; then
    echo "AutoSprite V3 ended with status: $KEY_STATUS"
    jq '{status:(.data.status // .status),error:(.data.error // .error // .message)}' <<< "$KEY_JOB_JSON"
    exit 1
  fi
  if (( POLL_INDEX % 6 == 1 )); then
    echo "AutoSprite V3 status: ${KEY_STATUS:-unknown}"
  fi
  sleep 5
done
if [[ "$KEY_STATUS" != 'succeeded' && "$KEY_STATUS" != 'completed' ]]; then
  echo 'Timed out waiting for AutoSprite V3.'
  exit 1
fi

SPRITE_SHEET_URL=$(jq -r '
  [.. | objects | .spriteSheetUrl? // empty] |
  map(select(type == "string" and length > 0)) |
  first // empty
' <<< "$KEY_JOB_JSON")
if [[ -z "$SPRITE_SHEET_URL" ]]; then
  echo 'AutoSprite V3 succeeded but returned no spriteSheetUrl.'
  exit 1
fi

SPRITE_META=$(jq -c '
  [.. | objects | select(has("frameW") and has("frameH"))] |
  first // {}
' <<< "$KEY_JOB_JSON")
curl -fsSL "$SPRITE_SHEET_URL" -o "$KEYED_SHEET"
jq -n \
  --arg animationAssetId "$ANIMATION_ASSET_ID" \
  --arg keyJobId "$KEY_JOB_ID" \
  --argjson spriteSheet "$SPRITE_META" \
  '{
    animationAssetId:$animationAssetId,
    keyJobId:$keyJobId,
    sampleEvery:4,
    tolerance:40,
    maxSide:512,
    spriteSheet:$spriteSheet
  }' > "$KEYED_META"

unset SORC_API_KEY
echo "Saved AutoSprite V3 sheet: $KEYED_SHEET"
identify -format '%f %wx%h %[channels] %b\n' "$KEYED_SHEET"
cat "$KEYED_META"
