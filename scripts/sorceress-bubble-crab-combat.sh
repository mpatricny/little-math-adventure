#!/usr/bin/env zsh

set -euo pipefail

read -rs SORC_API_KEY
printf '\n'

readonly SORC_API='https://sorceress.games/api/v1'
readonly CHARACTER_ASSET_ID='8e1187a4-4a55-476a-82eb-4140a6ea0de9'
readonly CRAB_OUT='/Users/datamole/little-math-adventure/artifacts/sorceress/silverpond-bubble-crab'

readonly ATTACK_PROMPT='Locked orthographic three-quarter game camera and perfectly static, perfectly uniform vivid green #00FF00 background. No green light, reflection, rim, color spill, grading, shadow, or texture on the creature. One-second in-place enemy attack facing left: the corrupted Silverpond bubble crab braces every planted leg, pulls the transparent water claw back for a very short anticipation, then snaps that claw sharply toward the left with a compact internal water surge while the solid claw tightens and the tail counterbalances. Finish in a readable attack follow-through, not a new idle loop. Preserve the exact blue, cyan, purple, silver, and gold palette; exact body, face, armor, two claws, all legs, two antennae, tail segments, crystals, and water-claw design. Articulated anatomy only, no whole-silhouette warping. No locomotion across the frame, camera motion, zoom, reframing, rotation, anatomy drift, duplicate or missing limbs, detached parts, texture or style changes, background motion, external particles, impact target, text, or silhouette ghosting. Keep every claw tip, leg, antenna, tail crystal, and water effect comfortably inside the frame with generous empty green margin.'
readonly DEFEND_PROMPT='Locked orthographic three-quarter game camera and perfectly static, perfectly uniform vivid green #00FF00 background. No green light, reflection, rim, color spill, grading, shadow, or texture on the creature. One-second in-place enemy defense facing left: the corrupted Silverpond bubble crab crouches slightly on planted legs, rotates the large transparent water claw up across its face and chest like a shield, tightens its solid claw, compresses the tail defensively, absorbs one subtle imaginary impact through articulated joints, and holds a clear guarded pose at the end. Preserve the exact blue, cyan, purple, silver, and gold palette; exact body, face, armor, two claws, all legs, two antennae, tail segments, crystals, and water-claw design. No attack, locomotion, camera motion, zoom, reframing, rotation, anatomy drift, duplicate or missing limbs, detached parts, texture or style changes, background motion, external particles, impact object, text, or silhouette ghosting. Keep every claw tip, leg, antenna, tail crystal, and water effect comfortably inside the frame with generous empty green margin.'
readonly DEFEAT_PROMPT='Locked orthographic three-quarter game camera and perfectly static, perfectly uniform vivid green #00FF00 background. No green light, reflection, rim, color spill, grading, shadow, or texture on the creature. One-second non-graphic enemy defeat facing left: the corrupted Silverpond bubble crab loses strength, its planted legs buckle inward, both claws lower, antennae droop, the segmented tail curls down beside the body, the purple crystal glow dims, and the creature settles into a compact clearly defeated pose on the same ground baseline. End motionless in the defeated pose; do not recover or loop. Preserve the exact blue, cyan, purple, silver, and gold palette; exact body, face, armor, two claws, all legs, two antennae, tail segments, crystals, and water-claw design. No explosive shattering, detached parts, dissolving, external particles, smoke, locomotion, camera motion, zoom, reframing, rotation, anatomy drift, duplicate or missing limbs, texture or style changes, background motion, text, or silhouette ghosting. Keep the complete collapsed creature, every leg, claw, antenna, tail crystal, and water effect comfortably inside the frame with generous empty green margin.'

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

ANIMATE_REQUEST=$(jq -cn \
  --arg characterAssetId "$CHARACTER_ASSET_ID" \
  --arg attackPrompt "$ATTACK_PROMPT" \
  --arg defendPrompt "$DEFEND_PROMPT" \
  --arg defeatPrompt "$DEFEAT_PROMPT" \
  '{
    characterAssetId:$characterAssetId,
    model:"imagine-1.5",
    resolution:"720p",
    animations:[
      {label:"Attack",prompt:$attackPrompt,duration:1},
      {label:"Defend",prompt:$defendPrompt,duration:1},
      {label:"Defeat",prompt:$defeatPrompt,duration:1}
    ]
  }')
ANIMATE_JSON=$(post_tool autosprite_animate "$ANIMATE_REQUEST")
JOBS_JSON=$(jq -c '.data.jobs // .jobs // []' <<< "$ANIMATE_JSON")
if [[ $(jq 'length' <<< "$JOBS_JSON") -ne 3 ]]; then
  echo 'Sorceress did not return three animation jobs.'
  jq '{success,error,dataKeys:(.data|keys?)}' <<< "$ANIMATE_JSON"
  exit 1
fi

typeset -a SLUGS=('attack' 'defend' 'defeat')
typeset -a LABELS=('Attack' 'Defend' 'Defeat')
typeset -a JOB_IDS
typeset -a ASSET_IDS

for INDEX in 1 2 3; do
  JOB_INDEX=$((INDEX - 1))
  JOB_IDS[$INDEX]=$(jq -r --argjson index "$JOB_INDEX" '.[$index].jobId // empty' <<< "$JOBS_JSON")
  ASSET_IDS[$INDEX]=$(jq -r --argjson index "$JOB_INDEX" '.[$index].assetId // empty' <<< "$JOBS_JSON")
  if [[ -z "${JOB_IDS[$INDEX]}" ]]; then
    echo "Missing job id for ${LABELS[$INDEX]}."
    exit 1
  fi
  echo "${LABELS[$INDEX]} submitted: ${JOB_IDS[$INDEX]}"
done

for INDEX in 1 2 3; do
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

  curl -fsSL "$MEDIA_URL" -o "$CRAB_OUT/${SLUG}-imagine-1.5-raw.mp4"
  echo "Saved $LABEL video: $CRAB_OUT/${SLUG}-imagine-1.5-raw.mp4"
done

jq -n \
  --arg characterAssetId "$CHARACTER_ASSET_ID" \
  --arg attackJobId "${JOB_IDS[1]}" \
  --arg attackAssetId "${ASSET_IDS[1]}" \
  --arg defendJobId "${JOB_IDS[2]}" \
  --arg defendAssetId "${ASSET_IDS[2]}" \
  --arg defeatJobId "${JOB_IDS[3]}" \
  --arg defeatAssetId "${ASSET_IDS[3]}" \
  '{
    characterAssetId:$characterAssetId,
    model:"imagine-1.5",
    resolution:"720p",
    requestedDurationSeconds:1,
    background:"#00FF00",
    animations:{
      attack:{jobId:$attackJobId,assetId:$attackAssetId},
      defend:{jobId:$defendJobId,assetId:$defendAssetId},
      defeat:{jobId:$defeatJobId,assetId:$defeatAssetId}
    },
    status:"raw-videos-ready-for-review"
  }' > "$CRAB_OUT/combat-imagine-1.5-jobs.json"

unset SORC_API_KEY
echo 'Saved all combat videos.'
