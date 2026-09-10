#!/usr/bin/env zsh

set -euo pipefail

read -rs SORC_API_KEY
printf '\n'

readonly SORC_API='https://sorceress.games/api/v1'
readonly FISH_SRC='/Users/datamole/little-math-adventure/artifacts/sorceress/silverpond-bubble-fish/silverfin-scalefish-enemy-clean-green-source.png'
readonly FISH_OUT='/Users/datamole/little-math-adventure/artifacts/sorceress/silverpond-bubble-fish'

readonly SHARED_PROMPT='Locked orthographic side-view game camera, locked character scale, locked center point, and perfectly static, perfectly uniform vivid green #00FF00 matte background. The entire circular water bubble and the complete fish remain fully visible with generous empty green padding on every side. The top, bottom, left, and right blue crystal ornaments must never touch or cross the frame edge. Preserve the exact canonical design: one silver-blue corrupted Silverpond fish facing left, one round transparent water bubble, four gold-and-blue cardinal ornaments, five tall dark silver dorsal fins, cyan tail and side fins, forehead diamond, large angry eyes, small teeth, blue scales, purple crystal corruption, pale cyan water rim, and purple current inside the bubble. The faint gray-and-white checkerboard visible through the source bubble means transparency and is not part of the creature or water; remove it completely and render only smooth clear water over the uniform green matte. Preserve the exact blue, cyan, silver, purple, white, black, and gold palette with no green reflection, green rim, green spill, or green color grading on the fish, bubble, water, or ornaments. Articulated anatomical motion and physically coherent water motion only. No uniform stretching, squash-and-stretch of the whole bubble, whole-silhouette warping, camera movement, zoom, reframing, rotation, scale drift, center drift, anatomy drift, extra or missing fins, duplicate eyes, detached ornaments, texture or style changes, background motion, text, target, cast shadow, external particles, cropped effects, or silhouette ghosting.'

readonly IDLE_PROMPT="$SHARED_PROMPT One-second confused-aggressive idle loop facing left: the fish holds position inside the bubble, makes one small tail sweep and alternating fin paddle, takes a subtle breath through its gills, blinks once, and shifts its angry gaze as the internal purple current circulates gently. The round bubble and all four ornaments stay fixed in size and position; only a tiny physically plausible surface shimmer is allowed. Begin and end close to the same neutral pose. No attack or locomotion."
readonly ATTACK_PROMPT="$SHARED_PROMPT One-second in-place enemy attack facing left: the fish pulls its fins and tail back for a brief anticipation, snaps forward inside the bubble with an angry bite and sharp tail thrust, and drives one compact internal water pulse toward the left inner wall. The circular bubble may recoil only a few pixels while keeping its exact size, center, and all four ornaments safely inside the frame. End in a readable attack follow-through. No external projectile and no effect outside the bubble."
readonly DEFEND_PROMPT="$SHARED_PROMPT One-second in-place enemy defense facing left: the fish tucks its small fins close, fans the five tall dorsal fins into a protective silhouette, angles its armored scales toward the threat, and braces as the internal water makes one compact circular surge. The bubble surface briefly brightens without expanding, cracking, or changing shape, then holds a clear guarded pose. No attack and no external impact object."
readonly DEFEAT_PROMPT="$SHARED_PROMPT One-second non-graphic enemy defeat facing left: the fish loses its angry focus, its eyelids droop, mouth closes, fins and tail slacken, and its body settles slightly lower inside the water while the purple corruption glow fades. The intact round bubble dims and sinks only a few pixels, all four ornaments remain attached and fully in frame, and the motion ends motionless in a clearly defeated pose. Do not recover or loop. No bursting, shattering, detached parts, dissolving, smoke, or external particles."

mkdir -p "$FISH_OUT"

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
  --arg filename 'silverfin-scalefish-enemy-clean-green-source.png' \
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
  --data-binary @"$FISH_SRC" >/dev/null
echo 'Canonical Silverfin Scalefish source uploaded.'

CREATE_REQUEST=$(jq -cn \
  --arg imageUrl "$PUBLIC_URL" \
  --arg name 'Silverpond Corrupted Silverfin Scalefish' \
  --arg prompt "$SHARED_PROMPT Canonical neutral full-body enemy pose, centered with generous safety padding." \
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
  --arg attackPrompt "$ATTACK_PROMPT" \
  --arg defendPrompt "$DEFEND_PROMPT" \
  --arg defeatPrompt "$DEFEAT_PROMPT" \
  '{
    characterAssetId:$characterAssetId,
    model:"imagine-1.5",
    resolution:"720p",
    animations:[
      {label:"Aggressive Idle",prompt:$idlePrompt,duration:1},
      {label:"Attack",prompt:$attackPrompt,duration:1},
      {label:"Defend",prompt:$defendPrompt,duration:1},
      {label:"Defeat",prompt:$defeatPrompt,duration:1}
    ]
  }')
ANIMATE_JSON=$(post_tool autosprite_animate "$ANIMATE_REQUEST")
JOBS_JSON=$(jq -c '.data.jobs // .jobs // []' <<< "$ANIMATE_JSON")
if [[ $(jq 'length' <<< "$JOBS_JSON") -ne 4 ]]; then
  echo 'Sorceress did not return four animation jobs.'
  jq '{success,error,dataKeys:(.data|keys?)}' <<< "$ANIMATE_JSON"
  exit 1
fi

typeset -a SLUGS=('idle' 'attack' 'defend' 'defeat')
typeset -a LABELS=('Idle' 'Attack' 'Defend' 'Defeat')
typeset -a JOB_IDS
typeset -a ASSET_IDS

for INDEX in 1 2 3 4; do
  JOB_INDEX=$((INDEX - 1))
  JOB_IDS[$INDEX]=$(jq -r --argjson index "$JOB_INDEX" '.[$index].jobId // empty' <<< "$JOBS_JSON")
  ASSET_IDS[$INDEX]=$(jq -r --argjson index "$JOB_INDEX" '.[$index].assetId // empty' <<< "$JOBS_JSON")
  if [[ -z "${JOB_IDS[$INDEX]}" ]]; then
    echo "Missing job id for ${LABELS[$INDEX]}."
    exit 1
  fi
  echo "${LABELS[$INDEX]} submitted: ${JOB_IDS[$INDEX]}"
done

for INDEX in 1 2 3 4; do
  SLUG="${SLUGS[$INDEX]}"
  LABEL="${LABELS[$INDEX]}"
  JOB_ID="${JOB_IDS[$INDEX]}"
  ASSET_ID="${ASSET_IDS[$INDEX]}"
  JOB_STATUS='queued'
  JOB_JSON='{}'

  for POLL_INDEX in {1..90}; do
    JOB_JSON=$(curl -fsS "$SORC_API/jobs/$JOB_ID" \
      -H "Authorization: Bearer $SORC_API_KEY")
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
    MEDIA_URL=$(jq -r --arg assetId "$ASSET_ID" '
      [
        .. | objects |
        select((.assetId? // "") == $assetId) |
        .mediaUrl? // empty
      ] | first // empty
    ' <<< "$CHARACTER_PACK_JSON")
  fi
  if [[ -z "$MEDIA_URL" ]]; then
    echo "$LABEL succeeded but returned no downloadable video URL."
    exit 1
  fi

  curl -fsSL "$MEDIA_URL" -o "$FISH_OUT/${SLUG}-imagine-1.5-raw.mp4"
  echo "Saved $LABEL video: $FISH_OUT/${SLUG}-imagine-1.5-raw.mp4"
done

jq -n \
  --arg characterAssetId "$CHARACTER_ASSET_ID" \
  --arg idleJobId "${JOB_IDS[1]}" \
  --arg idleAssetId "${ASSET_IDS[1]}" \
  --arg attackJobId "${JOB_IDS[2]}" \
  --arg attackAssetId "${ASSET_IDS[2]}" \
  --arg defendJobId "${JOB_IDS[3]}" \
  --arg defendAssetId "${ASSET_IDS[3]}" \
  --arg defeatJobId "${JOB_IDS[4]}" \
  --arg defeatAssetId "${ASSET_IDS[4]}" \
  '{
    characterAssetId:$characterAssetId,
    model:"imagine-1.5",
    resolution:"720p",
    requestedDurationSeconds:1,
    background:"#00FF00",
    animations:{
      idle:{jobId:$idleJobId,assetId:$idleAssetId},
      attack:{jobId:$attackJobId,assetId:$attackAssetId},
      defend:{jobId:$defendJobId,assetId:$defendAssetId},
      defeat:{jobId:$defeatJobId,assetId:$defeatAssetId}
    },
    status:"raw-videos-ready-for-review"
  }' > "$FISH_OUT/animations-imagine-1.5-jobs.json"

unset SORC_API_KEY
echo 'Saved all Silverfin Scalefish videos.'
