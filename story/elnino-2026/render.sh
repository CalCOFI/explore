#!/bin/zsh
# one command from the analysis database to the video:
#   story/elnino-2026/render.sh                      the deliverables: $JOB/out/calcofi_elnino_2026_square.mp4, the poster
#                                                    (its last frame, lossless) and $JOB/out/frames/ (a frame per beat,
#                                                    pulled from the MP4, some also at phone width)
#   story/elnino-2026/render.sh <name> [capture.mjs args, e.g. --from 47 --to 60]
#                                                    a rough cut: $JOB/out/rough/<name>.mp4
#   UNITS=F story/elnino-2026/render.sh              the same in °F (…_square_F.mp4, …_square_F_poster.png, out/frames_F/);
#   UNITS=CF …                                       °C with °F beside the quoted numbers (…_square_CF*, out/frames_CF/)
# Rebuilds page/data/*.json, type-checks and builds the page, serves the build on its own port for the length of the
# capture (capture.mjs stops if the page's own check fails), encodes, probes.
set -euo pipefail
HERE=${0:A:h}; REPO=${HERE:h:h}
JOB=${JOB:-$HOME/_big/calcofi/story_elnino_2026-11}; PORT=${PORT:-5182}
UNITS=${UNITS:-C}; [[ $UNITS == (C|F|CF) ]] || { print -u2 "UNITS must be C, F or CF"; exit 2 }
SFX=${${UNITS:#C}:+_$UNITS}                 # "" for the °C cut, _F or _CF for the others
cd $REPO
if (( $# )); then NAME=$1$SFX; shift; MP4=$JOB/out/rough/$NAME.mp4; EXTRA=("$@")
else NAME=final$SFX; MP4=$JOB/out/calcofi_elnino_2026_square$SFX.mp4; EXTRA=(--poster $JOB/out/calcofi_elnino_2026_square${SFX}_poster.png); fi
EXTRA+=(--query units=$UNITS)

$HERE/build_data.sh $JOB > /dev/null
npx tsc -p story/elnino-2026/tsconfig.json
npx vite build --config story/elnino-2026/vite.config.ts | tail -1
npx vite preview --config story/elnino-2026/vite.config.ts --port $PORT --strictPort > $JOB/logs/preview_$NAME.log 2>&1 &
PREVIEW=$!; trap "kill $PREVIEW 2>/dev/null" EXIT
until curl -s -o /dev/null http://localhost:$PORT/; do sleep 0.3; done
rm -rf $JOB/work/frames/$NAME
node story/elnino-2026/capture.mjs --url http://localhost:$PORT/ --out $JOB/work/frames/$NAME --mp4 $MP4 "${EXTRA[@]}"
ffprobe -v error -show_entries stream=codec_name,profile,pix_fmt,width,height,r_frame_rate,nb_frames:format=duration,size -of default=nw=1 $MP4

if [[ $NAME == final$SFX ]]; then   # a frame per beat (two for beats 6 and 7), from the MP4 itself; five of them at phone width
  F=$JOB/out/frames$SFX;rm -rf $F; mkdir -p $F
  for spec in b1_cruise:3.0 b2_baseline:11.6 b3_baseline_map:16.5 b4_next_year:22.5 b5_change:26.5 b6a_2018:32.5 b6b_2026:46.0 b7a_tilt:49.5 b7b_section:59.9; do
    ffmpeg -y -loglevel error -ss ${spec##*:} -i $MP4 -frames:v 1 $F/${spec%%:*}_t${spec##*:}.png
  done
  for n in b1_cruise_t3.0 b3_baseline_map_t16.5 b5_change_t26.5 b6b_2026_t46.0 b7b_section_t59.9; do
    ffmpeg -y -loglevel error -i $F/$n.png -vf scale=390:-2 $F/phone390_$n.png
  done
  ls $F
fi
