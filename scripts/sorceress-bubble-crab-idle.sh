#!/usr/bin/env zsh

set -euo pipefail

read -rs SORC_API_KEY
printf '\n'

readonly SORC_API='https://sorceress.games/api/v1'
readonly CRAB_SRC='/Users/datamole/little-math-adventure/artifacts/sorceress/silverpond-bubble-crab/02-bublinovy-rak-enemy-green-source.png'
readonly CRAB_OUT='/Users/datamole/little-math-adventure/artifacts/sorceress/silverpond-bubble-crab'
readonly RAW_VIDEO="$CRAB_OUT/idle-aggressive-imagine-1.5-raw.mp4"
readonly IDLE_PROMPT='Locked orthographic three-quarter game camera and perfectly static, perfectly uniform vivid green #00FF00 background. No green light, green reflection, green rim, color spill, color grading, shadow, or background texture on the creature. The complete corrupted Silverpond bubble crab remains centered, grounded on one fixed baseline, and at exactly the same overall scale. Two-second confused-aggressive idle only: planted legs brace with tiny articulated weight shifts, antennae make one short alert twitch, the solid claw tightens slightly, the water claw makes a subtle internal current, the tail tip flexes a few degrees, and the crab gives one hostile blink before naturally returning toward the starting pose. Preserve the exact blue, cyan, purple, silver, and gold palette; exact proportions; two claws; all legs; two antennae; face; armor; tail segments; tail crystal; every purple crystal; and the transparent water-claw design. Motion must come from articulated anatomy, never uniform stretching or whole-silhouette warping. No locomotion, jump, attack, camera movement, zoom, reframing, rotation, framing drift, anatomy drift, extra or missing limbs, duplicated objects, texture change, style change, background motion, particles, new effects, or silhouette ghosting. Keep every claw tip, leg, antenna, tail segment, crystal, glow, and water effect comfortably inside the frame for the entire clip with generous empty green margin.'

mkdir -p "$CRAB_OUT"

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

UPLOAD_REQUEST=$(jq -cn \
  --arg filename '02-bublinovy-rak-enemy-green-source.png' \
  --arg contentType 'image/png' \
  '{filename:$filename,contentType:$contentType}')
UPLOAD_JSON=$(post_tool file_upload "$UPLOAD_REQUEST")
UPLOAD_URL=$(jq -r '.data.uploadUrl // .uploadUrl // empty' <<< "$UPLOAD_JSON")
PUBLIC_URL=$(jq -r '.data.publicUrl // .publicUrl // empty' <<< "$UPLOAD_JSON")
if [[ -z "$UPLOAD_URL" || -z "$PUBLIC_URL" ]]; then
  echo 'Sorceress file_upload did not return both URLs.'
  exit 1
fi
curl -fsS -X PUT "$UPLOAD_URL" \
  -H 'Content-Type: image/png' \
  --data-binary @"$CRAB_SRC" >/dev/null
echo 'Canonical bubble crab source uploaded.'

CREATE_REQUEST=$(jq -cn \
  --arg imageUrl "$PUBLIC_URL" \
  --arg name 'Silverpond Corrupted Bubble Crab' \
  --arg prompt 'Canonical full-body corrupted Silverpond bubble crab enemy on a perfectly uniform vivid green #00FF00 matte background, centered with generous safety padding and original colors preserved.' \
  '{imageUrl:$imageUrl,name:$name,prompt:$prompt}')
CREATE_JSON=$(post_tool autosprite_create_character "$CREATE_REQUEST")
CHARACTER_ASSET_ID=$(jq -r '.data.assetId // .assetId // .data.characterAssetId // empty' <<< "$CREATE_JSON")
if [[ -z "$CHARACTER_ASSET_ID" ]]; then
  echo 'Sorceress character creation failed.'
  exit 1
fi
echo "Character asset created: $CHARACTER_ASSET_ID"

ANIMATE_REQUEST=$(jq -cn \
  --arg characterAssetId "$CHARACTER_ASSET_ID" \
  --arg label 'Aggressive Idle' \
  --arg prompt "$IDLE_PROMPT" \
  '{
    characterAssetId:$characterAssetId,
    model:"imagine-1.5",
    resolution:"720p",
    animations:[{label:$label,prompt:$prompt,duration:2}]
  }')
ANIMATE_JSON=$(post_tool autosprite_animate "$ANIMATE_REQUEST")
JOB_ID=$(jq -r '.data.jobs[0].jobId // .jobs[0].jobId // .data.jobId // .jobId // empty' <<< "$ANIMATE_JSON")
ANIMATION_ASSET_ID=$(jq -r '.data.jobs[0].assetId // .jobs[0].assetId // .data.assetId // empty' <<< "$ANIMATE_JSON")
if [[ -z "$JOB_ID" ]]; then
  echo 'Sorceress animation submission failed.'
  jq '{success,error,dataKeys:(.data|keys?)}' <<< "$ANIMATE_JSON"
  exit 1
fi
echo "Idle generation submitted: $JOB_ID"

JOB_STATUS='queued'
JOB_JSON='{}'
for POLL_INDEX in {1..90}; do
  JOB_JSON=$(curl -fsS "$SORC_API/jobs/$JOB_ID" \
    -H "Authorization: Bearer $SORC_API_KEY")
  JOB_STATUS=$(jq -r '.data.status // .status // .job.status // empty' <<< "$JOB_JSON")
  if [[ "$JOB_STATUS" == 'succeeded' || "$JOB_STATUS" == 'completed' ]]; then
    echo 'Idle generation succeeded.'
    break
  fi
  if [[ "$JOB_STATUS" == 'failed' || "$JOB_STATUS" == 'cancelled' ]]; then
    echo "Idle generation ended with status: $JOB_STATUS"
    jq '{status:(.data.status // .status),error:(.data.error // .error // .message)}' <<< "$JOB_JSON"
    exit 1
  fi
  if (( POLL_INDEX % 6 == 1 )); then
    echo "Idle generation status: ${JOB_STATUS:-unknown}"
  fi
  sleep 5
done
if [[ "$JOB_STATUS" != 'succeeded' && "$JOB_STATUS" != 'completed' ]]; then
  echo 'Timed out waiting for Sorceress idle generation.'
  exit 1
fi

MEDIA_URL=$(jq -r '
  [
    .. | objects |
    (.mediaUrl? // empty),
    (.videoUrl? // empty),
    (.outputUrl? // empty)
  ] |
  map(select(type == "string" and length > 0)) |
  first // empty
' <<< "$JOB_JSON")

if [[ -z "$MEDIA_URL" ]]; then
  GET_CHARACTER_REQUEST=$(jq -cn \
    --arg characterAssetId "$CHARACTER_ASSET_ID" \
    '{characterAssetId:$characterAssetId}')
  CHARACTER_PACK_JSON=$(post_tool autosprite_get_character "$GET_CHARACTER_REQUEST")
  if [[ -n "$ANIMATION_ASSET_ID" ]]; then
    MEDIA_URL=$(jq -r --arg assetId "$ANIMATION_ASSET_ID" '
      [
        .. | objects |
        select((.assetId? // "") == $assetId) |
        .mediaUrl? // empty
      ] | first // empty
    ' <<< "$CHARACTER_PACK_JSON")
  fi
fi

if [[ -z "$MEDIA_URL" ]]; then
  echo 'Generation succeeded but no downloadable video URL was found.'
  exit 1
fi

curl -fsSL "$MEDIA_URL" -o "$RAW_VIDEO"
jq -n \
  --arg characterAssetId "$CHARACTER_ASSET_ID" \
  --arg animationAssetId "$ANIMATION_ASSET_ID" \
  --arg jobId "$JOB_ID" \
  '{
    characterAssetId:$characterAssetId,
    animationAssetId:$animationAssetId,
    jobId:$jobId,
    model:"imagine-1.5",
    resolution:"720p",
    requestedDurationSeconds:2,
    background:"#00FF00",
    status:"raw-video-ready-for-review"
  }' > "$CRAB_OUT/idle-aggressive-imagine-1.5-job.json"

unset SORC_API_KEY
echo "Saved raw video: $RAW_VIDEO"
