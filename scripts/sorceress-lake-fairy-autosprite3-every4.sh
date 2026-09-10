#!/usr/bin/env zsh

set -euo pipefail

read -rs SORC_API_KEY
printf '\n'

readonly SORC_API='https://sorceress.games/api/v1'
readonly FAIRY_OUT='/Users/datamole/little-math-adventure/artifacts/sorceress/silverpond-lake-fairy'
readonly JOBS_FILE="$FAIRY_OUT/animations-imagine-1.5-jobs.json"

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

for ACTION in idle give; do
  ASSET_ID=$(jq -r --arg action "$ACTION" '.animations[$action].assetId // empty' "$JOBS_FILE")
  [[ -n "$ASSET_ID" ]] || { echo "Missing animation asset id for $ACTION."; exit 1; }

  REQUEST=$(jq -cn \
    --arg assetId "$ASSET_ID" \
    '{assetId:$assetId,sampleEvery:4,keyColor:"auto",tolerance:40,maxSide:512,force:true}')
  RESPONSE=$(post_tool autosprite_key "$REQUEST")
  JOB_ID=$(jq -r '.data.jobs[0].jobId // .jobs[0].jobId // .data.jobId // .jobId // empty' <<< "$RESPONSE")
  [[ -n "$JOB_ID" ]] || { echo "AutoSprite V3 returned no job for $ACTION."; exit 1; }
  echo "AutoSprite V3 $ACTION submitted: $JOB_ID"

  STATUS='queued'
  JOB_JSON='{}'
  for POLL_INDEX in {1..120}; do
    JOB_JSON=$(curl -fsS "$SORC_API/jobs/$JOB_ID" -H "Authorization: Bearer $SORC_API_KEY")
    STATUS=$(jq -r '.data.status // .status // .job.status // empty' <<< "$JOB_JSON")
    if [[ "$STATUS" == 'succeeded' || "$STATUS" == 'completed' ]]; then
      echo "AutoSprite V3 $ACTION succeeded."
      break
    fi
    if [[ "$STATUS" == 'failed' || "$STATUS" == 'cancelled' ]]; then
      echo "AutoSprite V3 $ACTION ended with status: $STATUS"
      jq '{status:(.data.status // .status),error:(.data.error // .error // .message)}' <<< "$JOB_JSON"
      exit 1
    fi
    if (( POLL_INDEX % 6 == 1 )); then
      echo "AutoSprite V3 $ACTION status: ${STATUS:-unknown}"
    fi
    sleep 5
  done
  [[ "$STATUS" == 'succeeded' || "$STATUS" == 'completed' ]] || { echo "Timed out waiting for $ACTION."; exit 1; }

  SHEET_URL=$(jq -r '[.. | objects | .spriteSheetUrl? // empty] | map(select(type == "string" and length > 0)) | first // empty' <<< "$JOB_JSON")
  [[ -n "$SHEET_URL" ]] || { echo "No spriteSheetUrl for $ACTION."; exit 1; }
  SHEET_META=$(jq -c '[.. | objects | select(has("frameW") and has("frameH"))] | first // {}' <<< "$JOB_JSON")
  curl -fsSL "$SHEET_URL" -o "$FAIRY_OUT/autosprite3-${ACTION}-every4.png"
  jq -n \
    --arg action "$ACTION" --arg animationAssetId "$ASSET_ID" --arg keyJobId "$JOB_ID" \
    --argjson spriteSheet "$SHEET_META" \
    '{action:$action,animationAssetId:$animationAssetId,keyJobId:$keyJobId,sampleEvery:4,tolerance:40,maxSide:512,spriteSheet:$spriteSheet}' \
    > "$FAIRY_OUT/autosprite3-${ACTION}-every4.json"
done

unset SORC_API_KEY
echo 'Saved Lake Fairy AutoSprite V3 sheets.'
