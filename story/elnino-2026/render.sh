#!/bin/zsh
# one command from the analysis database to the video:
#   story/elnino-2026/render.sh                      the deliverables: $JOB/out/calcofi_elnino_2026_30s.mp4, the poster
#                                                    (its last frame, lossless) and $JOB/out/frames/ (a frame per beat,
#                                                    pulled from the MP4, some also at phone width)
#   story/elnino-2026/render.sh <name> [capture.mjs args, e.g. --from 24 --to 30]
#                                                    a rough cut: $JOB/out/rough/<name>.mp4
# Rebuilds page/data/*.json, type-checks and builds the page, serves the build on its own port for the length of the
# capture (capture.mjs stops if the page's own check fails), encodes, probes.
set -euo pipefail
HERE=${0:A:h}; REPO=${HERE:h:h}
JOB=${JOB:-$HOME/_big/calcofi/story_elnino_2026-11}; PORT=${PORT:-5182}
cd $REPO
if (( $# )); then NAME=$1; shift; MP4=$JOB/out/rough/$NAME.mp4; EXTRA=("$@")
else NAME=final; MP4=$JOB/out/calcofi_elnino_2026_30s.mp4; EXTRA=(--poster $JOB/out/calcofi_elnino_2026_poster.png); fi

$HERE/build_data.sh $JOB > /dev/null
npx tsc -p story/elnino-2026/tsconfig.json
npx vite build --config story/elnino-2026/vite.config.ts | tail -1
npx vite preview --config story/elnino-2026/vite.config.ts --port $PORT --strictPort > $JOB/logs/preview_$NAME.log 2>&1 &
PREVIEW=$!; trap "kill $PREVIEW 2>/dev/null" EXIT
until curl -s -o /dev/null http://localhost:$PORT/; do sleep 0.3; done
rm -rf $JOB/work/frames/$NAME
node story/elnino-2026/capture.mjs --url http://localhost:$PORT/ --out $JOB/work/frames/$NAME --mp4 $MP4 "${EXTRA[@]}"
ffprobe -v error -show_entries stream=codec_name,profile,pix_fmt,width,height,r_frame_rate,nb_frames:format=duration,size -of default=nw=1 $MP4

if [[ $NAME == final ]]; then   # a frame per beat (two for beats 6 and 7), from the MP4 itself; four of them at phone width
  F=$JOB/out/frames; rm -rf $F; mkdir -p $F
  for spec in b1_cruises:0.5 b2_normal:7.9 b3_map:10.6 b4_next_year:14.7 b5_difference:16.6 b6a_2021:19.4 b6b_2026:23.5 b7a_tilt:26.2 b7b_section:29.9; do
    ffmpeg -y -loglevel error -ss ${spec##*:} -i $MP4 -frames:v 1 $F/${spec%%:*}_t${spec##*:}.png
  done
  for n in b1_cruises_t0.5 b3_map_t10.6 b5_difference_t16.6 b6b_2026_t23.5 b7b_section_t29.9; do
    ffmpeg -y -loglevel error -i $F/$n.png -vf scale=390:-2 $F/phone390_$n.png
  done
  ls $F
fi
