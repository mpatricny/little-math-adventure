#!/usr/bin/env zsh

set -euo pipefail

read -rs SORC_API_KEY
printf '\n'

readonly SORC_API='https://sorceress.games/api/v1'
readonly FAIRY_SRC='/Users/datamole/little-math-adventure/artifacts/sorceress/silverpond-lake-fairy/lake-fairy-source-green.png'
readonly FAIRY_OUT='/Users/datamole/little-math-adventure/artifacts/sorceress/silverpond-lake-fairy'

readonly SHARED_PROMPT='Locked orthographic three-quarter game camera, locked character scale, locked center point, and perfectly static perfectly uniform vivid green #00FF00 matte background. Exactly one complete freed Lake Fairy of Silverpond hovers upright facing screen-left. Preserve the exact canonical design: kind adult face, pale aqua hair, pointed ears, large translucent cyan water-fin wings, pearl-and-antique-gold crown with its central teardrop scale still attached, layered deep-blue and lavender water-silk dress, two complete arms and hands, two complete legs and bare feet, slim gold-and-crystal jewelry. Preserve the exact cyan, ice-blue, cobalt, lavender, pearl, skin, black, white, and gold palette with no green reflection, green rim, green spill, or green color grading. The complete crown, hair, every wing tip and droplet, both hands, dress ribbons, feet, jewelry, glow and compact effect remain fully visible with very generous empty green padding on every side for the entire take. Articulated anatomical motion only. No whole-body stretching, uniform squash, whole-silhouette warping, camera movement, zoom, reframing, rotation, scale drift, center drift, anatomy drift, duplicate or missing fingers, limbs, wings or facial features, detached crown ornament, texture or style change, background motion, text, external scenery, cast shadow, cropped effects, or silhouette ghosting.'

readonly IDLE_PROMPT="$SHARED_PROMPT One-second calm grateful idle loop: she takes one subtle natural breath, blinks once, tilts her head slightly toward the child at screen-left, and lets both hands settle softly. Her hair tips, dress ribbons and water-fin wings make one small independent floating ripple while the crown scale pulses once. The whole body stays centered; feet and wing tips never approach the frame edge. Begin and end close to the same neutral hovering pose. No locomotion, bow, attack, large wing flap, inflation, or whole-body bobbing."
readonly GIVE_PROMPT="$SHARED_PROMPT One-second in-place gift gesture: she turns her gaze warmly toward screen-left, brings her right hand briefly toward the crown without touching or removing the crown scale, then extends that same open palm toward screen-left in a clear offering pose. The central crown scale emits one compact cyan-lavender pulse that stays close to her head. Her other hand, feet, wings and body remain stable and fully visible. End holding the open-palm offering pose. No detached object, no projectile, no external recipient, no locomotion, no large wing flap, and no effect outside the safety padding."

mkdir -p "$FAIRY_OUT"

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
  --arg filename 'lake-fairy-source-green.png' \
  --arg contentType 'image/png' \
  '{filename:$filename,contentType:$contentType}')
UPLOAD_JSON=$(post_tool file_upload "$UPLOAD_REQUEST")
UPLOAD_URL=$(jq -r '.data.uploadUrl // .uploadUrl // empty' <<< "$UPLOAD_JSON")
PUBLIC_URL=$(jq -r '.data.publicUrl // .publicUrl // empty' <<< "$UPLOAD_JSON")
if [[ -z "$UPLOAD_URL" || -z "$PUBLIC_URL" ]]; then
  echo 'Sorceress file_upload did not return both URLs.'
  exit 1
fi
curl -fsS -X PUT "$UPLOAD_URL" -H 'Content-Type: image/png' \
  --data-binary @"$FAIRY_SRC" >/dev/null
echo 'Canonical Lake Fairy source uploaded.'

CREATE_REQUEST=$(jq -cn \
  --arg imageUrl "$PUBLIC_URL" \
  --arg name 'Silverpond Lake Fairy' \
  --arg prompt "$SHARED_PROMPT Canonical neutral full-body hovering pose, centered with generous safety padding." \
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
  --arg idlePrompt "$IDLE_PROMPT" \
  --arg givePrompt "$GIVE_PROMPT" \
  '{
    characterAssetId:$characterAssetId,
    model:"imagine-1.5",
    resolution:"720p",
    animations:[
      {label:"Grateful Idle",prompt:$idlePrompt,duration:1},
      {label:"Give Water Scale",prompt:$givePrompt,duration:1}
    ]
  }')
ANIMATE_JSON=$(post_tool autosprite_animate "$ANIMATE_REQUEST")
JOBS_JSON=$(jq -c '.data.jobs // .jobs // []' <<< "$ANIMATE_JSON")
if [[ $(jq 'length' <<< "$JOBS_JSON") -ne 2 ]]; then
  echo 'Sorceress did not return two animation jobs.'
  jq '{success,error,dataKeys:(.data|keys?)}' <<< "$ANIMATE_JSON"
  exit 1
fi

typeset -a SLUGS=('idle' 'give')
typeset -a LABELS=('Idle' 'Give')
typeset -a JOB_IDS
typeset -a ASSET_IDS

for INDEX in 1 2; do
  JOB_INDEX=$((INDEX - 1))
  JOB_IDS[$INDEX]=$(jq -r --argjson index "$JOB_INDEX" '.[$index].jobId // empty' <<< "$JOBS_JSON")
  ASSET_IDS[$INDEX]=$(jq -r --argjson index "$JOB_INDEX" '.[$index].assetId // empty' <<< "$JOBS_JSON")
  [[ -n "${JOB_IDS[$INDEX]}" ]] || { echo "Missing job id for ${LABELS[$INDEX]}."; exit 1; }
  echo "${LABELS[$INDEX]} submitted: ${JOB_IDS[$INDEX]}"
done

for INDEX in 1 2; do
  SLUG="${SLUGS[$INDEX]}"
  LABEL="${LABELS[$INDEX]}"
  JOB_ID="${JOB_IDS[$INDEX]}"
  ASSET_ID="${ASSET_IDS[$INDEX]}"
  JOB_STATUS='queued'
  JOB_JSON='{}'

  for POLL_INDEX in {1..90}; do
    JOB_JSON=$(curl -fsS "$SORC_API/jobs/$JOB_ID" -H "Authorization: Bearer $SORC_API_KEY")
    JOB_STATUS=$(jq -r '.data.status // .status // .job.status // empty' <<< "$JOB_JSON")
    if [[ "$JOB_STATUS" == 'succeeded' || "$JOB_STATUS" == 'completed' ]]; then
      echo "$LABEL generation succeeded."
      break
    fi
    if [[ "$JOB_STATUS" == 'failed' || "$JOB_STATUS" == 'cancelled' ]]; then
      echo "$LABEL generation ended with status: $JOB_STATUS"
      jq '{status:(.data.status // .status),error:(.data.error // .error // .message)}' <<< "$JOB_JSON"
      exit 1
    fi
    if (( POLL_INDEX % 6 == 1 )); then
      echo "$LABEL generation status: ${JOB_STATUS:-unknown}"
    fi
    sleep 5
  done
  if [[ "$JOB_STATUS" != 'succeeded' && "$JOB_STATUS" != 'completed' ]]; then
    echo "Timed out waiting for $LABEL generation."
    exit 1
  fi

  MEDIA_URL=$(jq -r '
    [.. | objects | (.mediaUrl? // empty), (.videoUrl? // empty), (.outputUrl? // empty)] |
    map(select(type == "string" and length > 0)) | first // empty
  ' <<< "$JOB_JSON")
  if [[ -z "$MEDIA_URL" ]]; then
    GET_CHARACTER_REQUEST=$(jq -cn --arg characterAssetId "$CHARACTER_ASSET_ID" '{characterAssetId:$characterAssetId}')
    CHARACTER_PACK_JSON=$(post_tool autosprite_get_character "$GET_CHARACTER_REQUEST")
    MEDIA_URL=$(jq -r --arg assetId "$ASSET_ID" '[.. | objects | select((.assetId? // "") == $assetId) | .mediaUrl? // empty] | first // empty' <<< "$CHARACTER_PACK_JSON")
  fi
  [[ -n "$MEDIA_URL" ]] || { echo "$LABEL succeeded but returned no video URL."; exit 1; }
  curl -fsSL "$MEDIA_URL" -o "$FAIRY_OUT/${SLUG}-imagine-1.5-raw.mp4"
  echo "Saved $LABEL video: $FAIRY_OUT/${SLUG}-imagine-1.5-raw.mp4"
done

jq -n \
  --arg characterAssetId "$CHARACTER_ASSET_ID" \
  --arg idleJobId "${JOB_IDS[1]}" --arg idleAssetId "${ASSET_IDS[1]}" \
  --arg giveJobId "${JOB_IDS[2]}" --arg giveAssetId "${ASSET_IDS[2]}" \
  '{characterAssetId:$characterAssetId,model:"imagine-1.5",resolution:"720p",requestedDurationSeconds:1,background:"#00FF00",animations:{idle:{jobId:$idleJobId,assetId:$idleAssetId},give:{jobId:$giveJobId,assetId:$giveAssetId}},status:"raw-videos-ready-for-review"}' \
  > "$FAIRY_OUT/animations-imagine-1.5-jobs.json"

unset SORC_API_KEY
echo 'Saved Lake Fairy videos.'
