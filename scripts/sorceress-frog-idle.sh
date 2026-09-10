#!/usr/bin/env zsh

set -euo pipefail

read -rs SORC_API_KEY
printf '\n'

readonly SORC_API='https://sorceress.games/api/v1'
readonly FROG_SRC='/Users/datamole/little-math-adventure/public/assets/images/concepts/silverpond-creatures/animation-sources/01-lekninovy-zabak-enemy-orange-source.png'
readonly FROG_OUT='/Users/datamole/little-math-adventure/artifacts/sorceress/silverpond-frog'
readonly RAW_VIDEO="$FROG_OUT/idle-aggressive-confused-imagine-1.5-raw.mp4"
readonly IDLE_PROMPT='Locked side-view camera and perfectly static uniform vivid orange #FF5A00 background. The complete corrupted Silverpond frog remains centered, grounded on one fixed baseline, and at exactly the same overall scale. Confused aggressive idle only: tense low crouch, subtle anatomical throat pulse, tiny uneven weight shifts carried through the planted legs, one brief hostile head twitch and blink, then a natural return to the starting pose. Preserve the exact frog design, proportions, four limbs, toes, facial features, lily-pad crown, flower, arm band, blue cheek orbs, purple crystal cracks, and every floating crystal. Motion comes from articulated anatomy, never uniform vertical or horizontal stretching. No locomotion, jumping, attack, camera movement, zoom, reframing, rotation, framing drift, anatomy drift, extra or missing limbs, duplicated objects, texture change, style change, background motion, shadow, particles, new effects, or silhouette ghosting. Keep every body part, leaf, flower, orb, floating crystal and glow comfortably inside the frame for the entire clip with generous empty orange margin. Seamlessly loop back to the exact starting pose.'

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

UPLOAD_REQUEST=$(jq -cn \
  --arg filename '01-lekninovy-zabak-enemy-orange-source.png' \
  --arg contentType 'image/png' \
  '{filename:$filename,contentType:$contentType}')
UPLOAD_JSON=$(post_tool file_upload "$UPLOAD_REQUEST")
UPLOAD_URL=$(jq -r '.data.uploadUrl // .uploadUrl // empty' <<< "$UPLOAD_JSON")
PUBLIC_URL=$(jq -r '.data.publicUrl // .publicUrl // empty' <<< "$UPLOAD_JSON")
if [[ -z "$UPLOAD_URL" || -z "$PUBLIC_URL" ]]; then
  echo 'Sorceress file_upload did not return both URLs.'
  jq '{success,error,dataKeys:(.data|keys?)}' <<< "$UPLOAD_JSON"
  exit 1
fi
curl -fsS -X PUT "$UPLOAD_URL" \
  -H 'Content-Type: image/png' \
  --data-binary @"$FROG_SRC" >/dev/null
echo 'Canonical frog source uploaded.'

CREATE_REQUEST=$(jq -cn \
  --arg imageUrl "$PUBLIC_URL" \
  --arg name 'Silverpond Corrupted Lily Frog' \
  --arg prompt 'Canonical full-body corrupted Silverpond lily frog enemy on a perfectly uniform vivid orange #FF5A00 matte background, centered with generous safety padding.' \
  '{imageUrl:$imageUrl,name:$name,prompt:$prompt}')
CREATE_JSON=$(post_tool autosprite_create_character "$CREATE_REQUEST")
CHARACTER_ASSET_ID=$(jq -r '.data.assetId // .assetId // .data.characterAssetId // empty' <<< "$CREATE_JSON")
if [[ -z "$CHARACTER_ASSET_ID" ]]; then
  echo 'Sorceress character creation failed.'
  jq '{success,error,dataKeys:(.data|keys?)}' <<< "$CREATE_JSON"
  exit 1
fi
echo "Character asset created: $CHARACTER_ASSET_ID"

ANIMATE_REQUEST=$(jq -cn \
  --arg characterAssetId "$CHARACTER_ASSET_ID" \
  --arg label 'Idle Aggressive Confused' \
  --arg prompt "$IDLE_PROMPT" \
  '{
    characterAssetId:$characterAssetId,
    model:"imagine-1.5",
    resolution:"720p",
    animations:[{label:$label,prompt:$prompt,duration:4}]
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
  if [[ -z "$MEDIA_URL" ]]; then
    MEDIA_URL=$(jq -r '
      [.. | objects | .mediaUrl? // empty] |
      map(select(type == "string" and test("\\.mp4|video"; "i"))) |
      first // empty
    ' <<< "$CHARACTER_PACK_JSON")
  fi
fi

if [[ -z "$MEDIA_URL" ]]; then
  echo 'Generation succeeded but no downloadable video URL was found.'
  exit 1
fi

curl -fsSL "$MEDIA_URL" -o "$RAW_VIDEO"
if command -v ffprobe >/dev/null 2>&1; then
  ffprobe -v error \
    -show_entries format=duration:stream=width,height,r_frame_rate,codec_name \
    -of json "$RAW_VIDEO" \
    > "$FROG_OUT/idle-aggressive-confused-imagine-1.5-raw.ffprobe.json"
fi

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
    requestedDurationSeconds:4,
    background:"#FF5A00",
    status:"raw-video-ready-for-review"
  }' > "$FROG_OUT/idle-aggressive-confused-imagine-1.5-job.json"

unset SORC_API_KEY
echo "Saved raw video: $RAW_VIDEO"
if [[ -f "$FROG_OUT/idle-aggressive-confused-imagine-1.5-raw.ffprobe.json" ]]; then
  cat "$FROG_OUT/idle-aggressive-confused-imagine-1.5-raw.ffprobe.json"
fi
