#!/usr/bin/env bash
# 구조 함정 3갈래 시험 — **luna 를 프롬프트로 sol 수준까지 끌어올릴 수 있는가**
#
# 배경(실측 2026-08-01): 구조계열 함정이 지문당 sol 1.33 → luna 0.20 으로 떨어졌다.
#   브리프를 바꿔서가 아니다 — 계단이 **모델 교체 지점 하나**에만 있었고, 브리프를 되돌려도
#   안 돌아왔다. 그래서 이번엔 모델과 브리프를 **같은 지문 위에서 동시에** 놓고 본다.
#
# 갈래:
#   A  luna + 현행 브리프      ← 지금 상태
#   B  luna + 견본 브리프      ← 문법 용어 대신 실물 8개를 보여주는 판
#   C  sol  + 현행 브리프      ← 도달 목표(기준선)
#
# 지난 A/B 들이 왜 못 믿을 것이었나 → 이번에 막은 것:
#   ① 부하 최악(동시 74)에 돌려 대조군이 망가졌다   → 본선 러너를 **멈추고** 동시 12 로 돈다
#   ② 학년을 통제 안 했다                          → 학년 고르게 뽑는다
#   ③ 품질만 재고 시간을 안 쟀다                    → 갈래별 소요 시간도 기록한다
#   ④ 표본이 5건이었다                              → 12지문 × 3갈래 = 36회
set -uo pipefail
ROOT="d:/Desktop/2026project/nara"; cd "$ROOT"
EXP="experiments/vocab-corpus-20260728"
LIST="$EXP/struct3-ids.json"
JOBS="${1:-12}"
mkdir -p "$EXP/s3-a" "$EXP/s3-b" "$EXP/s3-c" "$EXP/s3-logs"

mapfile -t IDS < <(node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).forEach(x=>console.log(x))" "$LIST")
echo "[$(date +%H:%M:%S)] 3갈래 시험 — ${#IDS[@]}지문 × 3 = $(( ${#IDS[@]} * 3 ))회 · 동시 ${JOBS}"

run() {  # run <arm> <script> <model> <id>
  local arm="$1" script="$2" model="$3" id="$4"
  local out="$EXP/s3-$arm"
  [ -f "$out/$id.json" ] && return 0
  local t0; t0=$(date +%s)
  VOCAB_CODEX_MODEL="$model" bash "scripts/$script" "$id" "$out" > "$EXP/s3-logs/$id.$arm.log" 2>&1
  echo "$id	$arm	$(( $(date +%s) - t0 ))" >> "$EXP/s3-logs/_durations.tsv"
}

: > "$EXP/s3-logs/_durations.tsv"
n=0
for id in "${IDS[@]}"; do
  for spec in "a vocab-extract-codex-v2.sh gpt-5.6-luna" \
              "b vocab-extract-codex-ex.sh gpt-5.6-luna" \
              "c vocab-extract-codex-v2.sh gpt-5.6-sol"; do
    set -- $spec
    while [ "$(jobs -rp | wc -l)" -ge "$JOBS" ]; do wait -n 2>/dev/null || sleep 2; done
    run "$1" "$2" "$3" "$id" &
    n=$((n+1))
    [ $((n % 12)) -eq 0 ] && echo "[$(date +%H:%M:%S)] 투입 $n/$(( ${#IDS[@]} * 3 ))"
  done
done
wait
echo "[$(date +%H:%M:%S)] 산출 — A $(ls "$EXP/s3-a"/*.json 2>/dev/null | wc -l) · B $(ls "$EXP/s3-b"/*.json 2>/dev/null | wc -l) · C $(ls "$EXP/s3-c"/*.json 2>/dev/null | wc -l)"
