#!/bin/zsh
# derive the story page's JSON from the analysis database. usage: build_data.sh [job_dir]
# needs: the analysis database built by analysis/01-04 *.sql (see analysis/findings.template.md, "How this was computed")
set -euo pipefail
HERE=${0:A:h}
JOB=${1:-$HOME/_big/calcofi/story_elnino_2026-11}
OUT=$HERE/page/data
mkdir -p $OUT
sed "s|__OUT__|$OUT|g" $HERE/build_data.sql | duckdb -no-agent -readonly $JOB/work/elnino.duckdb
print "{\"release\": \"$(cat $JOB/work/release/VERSION)\"}" > $OUT/release.json
ls -la $OUT
