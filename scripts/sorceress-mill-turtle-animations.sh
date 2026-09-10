#!/usr/bin/env zsh

set -euo pipefail

read -rs SORC_API_KEY
printf '\n'

readonly SORC_API='https://sorceress.games/api/v1'
readonly TURTLE_SRC='/Users/datamole/little-math-adventure/artifacts/sorceress/silverpond-mill-turtle/mill-turtle-enemy-clean-green-source.png'
readonly TURTLE_OUT='/Users/datamole/little-math-adventure/artifacts/sorceress/silverpond-mill-turtle'

readonly SHARED_PROMPT='Locked orthographic three-quarter side-view game camera, locked character scale, locked center point, locked ground baseline, and perfectly static, perfectly uniform vivid green #00FF00 matte background. One complete corrupted Silverpond mill turtle faces screen-left in a low braced stance. Preserve the exact canonical design: squat turquoise freshwater turtle, angry blue eye, gray stone plates on the head and shell, four planted legs with gold claws, antique-brass water wheel integrated into the shell with the same hub, spokes, paddles and rivets, blue diamond ornaments, bright cyan circulating water streams, restrained violet crystal splinters and purple corruption cracks. Preserve the exact turquoise, cyan, blue, gray, purple, black, white, and gold palette with no green reflection, green rim, green spill, or green color grading. The complete head, shell, wheel, every foot and claw, every water stream, crystal and compact effect remain fully visible with generous empty green padding on every side for the entire take. Articulated anatomical and physically coherent water-wheel motion only. No uniform stretching, squash-and-stretch of the whole turtle, whole-silhouette warping, camera movement, zoom, reframing, rotation, scale drift, center drift, baseline drift, anatomy drift, extra or missing limbs or claws, wheel deformation, duplicate eyes, detached stones, texture or style changes, background motion, text, target, cast shadow, external scenery, cropped effects, or silhouette ghosting.'

readonly IDLE_PROMPT="$SHARED_PROMPT One-second confused-aggressive idle loop: keep all four feet planted while the turtle takes one subtle breath, shifts its weight through articulated knees, tilts its head a few pixels, blinks once, and tightens its angry gaze. The brass shell wheel advances slowly by a small physically coherent amount while the cyan water circulates through its paddles and the purple corruption flickers gently close to the shell. Begin and end close to the same neutral braced pose. No attack, locomotion, shell expansion, or whole-body bobbing."
readonly ATTACK_PROMPT="$SHARED_PROMPT One-second in-place enemy attack: the turtle draws its head and front shoulder back for a brief anticipation, spins the brass shell wheel sharply, stamps one front foot, then thrusts its armored forehead toward screen-left in a short powerful headbutt while a compact cyan water surge follows the wheel and stays close to the shell. The body may recoil only a few pixels and all feet return to the same baseline. End in a readable attack follow-through. No travel across the frame, external target, distant projectile, or effect outside the safety padding."
readonly DEFEND_PROMPT="$SHARED_PROMPT One-second in-place enemy defense: the turtle lowers its body on planted legs, retracts its head and front feet partway beneath the stone-plated shell, locks the brass wheel like a shield, and drives one compact circular cyan water current around the wheel rim. The gray plates and wheel briefly catch a restrained blue-purple defensive glow, then the turtle holds a clear guarded pose. No attack, locomotion, shell enlargement, detached shield, or external impact object."
readonly DEFEAT_PROMPT="$SHARED_PROMPT One-second non-graphic enemy defeat: the turtle loses its angry focus, eyelid droops, head lowers toward the ground, legs bend and settle without changing anatomy, the brass wheel decelerates to a stop, cyan water weakens, and the violet corruption glow fades. The intact turtle finishes slightly lower on the same ground baseline in a clearly defeated motionless pose. Do not recover or loop. No flipping over, bursting, shattering, detached parts, dissolving, smoke, or external particles."

mkdir -p "$TURTLE_OUT"

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
  --arg filename 'mill-turtle-enemy-clean-green-source.png' \
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
  --data-binary @"$TURTLE_SRC" >/dev/null
echo 'Canonical Mill Turtle source uploaded.'

CREATE_REQUEST=$(jq -cn \
  --arg imageUrl "$PUBLIC_URL" \
  --arg name 'Silverpond Corrupted Mill Turtle' \
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

  curl -fsSL "$MEDIA_URL" -o "$TURTLE_OUT/${SLUG}-imagine-1.5-raw.mp4"
  echo "Saved $LABEL video: $TURTLE_OUT/${SLUG}-imagine-1.5-raw.mp4"
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
  }' > "$TURTLE_OUT/animations-imagine-1.5-jobs.json"

unset SORC_API_KEY
echo 'Saved all Mill Turtle videos.'
