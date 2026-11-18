#!/bin/zsh
# one command from the analysis database to the video:
#   story/elnino-2026/render.sh                      the deliverables: $JOB/out/calcofi_elnino_2026_square.mp4, the poster
#                                                    (its last frame, lossless) and $JOB/out/frames/ (a frame per beat,
#                                                    pulled from the MP4, some also at phone width)
#   story/elnino-2026/render.sh <name> [capture.mjs args, e.g. --from 47 --to 60]
#                                                    a rough cut: $JOB/out/rough/<name>.mp4
#   UNITS=F story/elnino-2026/render.sh              the same in °F (…_square_F.mp4, …_square_F_poster.png, out/frames_F/);
#   UNITS=CF …                                       °C with °F beside the quoted numbers (…_square_CF*, out/frames_CF/)
#   CUT=short …                                      the 28 s cut (main.ts `?cut=short`): …_short.mp4, …_short_poster.png,
#                                                    out/frames_short/ (with UNITS: …_short_F*, …_short_CF*); the minute's
#                                                    files are never touched
#   CUT=35s …                                        the 35 s cut (main.ts `?cut=35s`): …_35s.mp4, …_35s_poster.png,
#                                                    out/frames_35s/ (with UNITS: …_35s_F*, …_35s_CF*)
#   ASPECT=wide CUT=35s …                            the same film at 1920 x 1080 (main.ts `?aspect=wide`): …_35s_wide.mp4,
#                                                    …_35s_wide_poster.png, out/frames_35s_wide/ (with UNITS: …_35s_wide_F*, …)
# Rebuilds page/data/*.json, type-checks and builds the page, serves the build on its own port for the length of the
# capture (capture.mjs stops if the page's own check fails), encodes, probes.
set -euo pipefail
HERE=${0:A:h}; REPO=${HERE:h:h}
JOB=${JOB:-$HOME/_big/calcofi/story_elnino_2026-11}; PORT=${PORT:-5182}
UNITS=${UNITS:-C}; [[ $UNITS == (C|F|CF) ]] || { print -u2 "UNITS must be C, F or CF"; exit 2 }
SFX=${${UNITS:#C}:+_$UNITS}                 # "" for the °C cut, _F or _CF for the others
CUT=${CUT:-long}; [[ $CUT == (long|short|35s) ]] || { print -u2 "CUT must be long, short or 35s"; exit 2 }
ASPECT=${ASPECT:-square}; [[ $ASPECT == (square|wide) ]] || { print -u2 "ASPECT must be square or wide"; exit 2 }
# the name of the cut in its files: square (the minute), short, 35s; with _wide for the 16:9 frame (wide alone for the minute)
if [[ $CUT == long ]]; then TAG=square; [[ $ASPECT == wide ]] && TAG=wide; else TAG=$CUT; [[ $ASPECT == wide ]] && TAG=${CUT}_wide; fi
STEM=calcofi_elnino_2026_$TAG; [[ $TAG != square ]] && SFX=_$TAG$SFX
cd $REPO
if (( $# )); then NAME=$1$SFX; shift; MP4=$JOB/out/rough/$NAME.mp4; EXTRA=("$@")
else NAME=final$SFX; MP4=$JOB/out/$STEM${SFX#_$TAG}.mp4; EXTRA=(--poster $JOB/out/$STEM${SFX#_$TAG}_poster.png); fi
if [[ $ASPECT == wide ]]; then EXTRA+=(--size 1920x1080 --query "units=$UNITS&cut=$CUT&aspect=wide"); else EXTRA+=(--query "units=$UNITS&cut=$CUT"); fi

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
  if [[ $CUT == 35s ]]; then
    SPECS=(b0_partners:1.0 b1_cruise:4.6 b2_baseline:6.8 b3_baseline_map:9.2 b5_change:11.5 b6a_2015:14.0 b6b_2026:25.8 b7a_tilt:28.6 b7b_section:34.9)
    PHONE=(b0_partners_t1.0 b5_change_t11.5 b6a_2015_t14.0 b6b_2026_t25.8 b7b_section_t34.9)
  elif [[ $CUT == short ]]; then
    SPECS=(b1_cruise:2.5 b2_baseline:5.2 b3_baseline_map:7.4 b5_change:9.0 b6a_2015:10.8 b6b_2026:19.0 b7a_tilt:21.5 b7b_section:27.9)
    PHONE=(b1_cruise_t2.5 b3_baseline_map_t7.4 b6a_2015_t10.8 b6b_2026_t19.0 b7b_section_t27.9)
  else
    SPECS=(b1_cruise:3.0 b2_baseline:11.6 b3_baseline_map:16.5 b4_next_year:22.5 b5_change:26.5 b6a_2018:32.5 b6b_2026:46.0 b7a_tilt:49.5 b7b_section:59.9)
    PHONE=(b1_cruise_t3.0 b3_baseline_map_t16.5 b5_change_t26.5 b6b_2026_t46.0 b7b_section_t59.9)
  fi
  for spec in $SPECS; do
    ffmpeg -y -loglevel error -ss ${spec##*:} -i $MP4 -frames:v 1 $F/${spec%%:*}_t${spec##*:}.png
  done
  [[ $ASPECT == wide ]] && PHONE=()   # the wide frame is for a screen, not a phone
  for n in $PHONE; do
    ffmpeg -y -loglevel error -i $F/$n.png -vf scale=390:-2 $F/phone390_$n.png
  done
  ls $F
fi
