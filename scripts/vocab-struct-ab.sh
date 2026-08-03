#!/usr/bin/env bash
# 구조 함정 지시 A/B — v2(대조군) 대 v3(구조 지목 절차)
#
# 왜: 블라인드 채점(§13.8)에서 `missedStructural` 만 거의 안 움직였다(21→18).
#     §2.6-②·§2.7-4 가 이미 구조 오독을 지시하는데도 안 잡힌다 → 지시의 **형태**를 의심한다(§13.9).
#
# ⚠️ 대조군은 **같은 v2 브리프의 새 실행**이다. 기존 raw 파일을 대조군으로 쓰면
#    판본 간 차이와 실행 간 편차가 섞인다(§13.4 에서 두 번 오판할 뻔했다).
set -uo pipefail
ROOT="d:/Desktop/2026project/nara"; cd "$ROOT"
EXP="experiments/vocab-corpus-20260728"
LIST="$EXP/struct-ab-ids.json"
A="$EXP/struct-v2"; B="$EXP/struct-v3"; LOGS="$EXP/struct-ab-logs"
mkdir -p "$A" "$B" "$LOGS"

mapfile -t IDS < <(node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).forEach(x=>console.log(x))" "$LIST")
echo "[$(date +%H:%M:%S)] 구조 A/B — ${#IDS[@]}지문 × 2판본 = $(( ${#IDS[@]} * 2 ))회 · 모델 ${VOCAB_CODEX_MODEL:-<기본>}"

for id in "${IDS[@]}"; do
  [ -f "$A/$id.json" ] || bash scripts/vocab-extract-codex-v2.sh "$id" "$A" > "$LOGS/$id.v2.log" 2>&1 &
  [ -f "$B/$id.json" ] || bash scripts/vocab-extract-codex-v3.sh "$id" "$B" > "$LOGS/$id.v3.log" 2>&1 &
done
wait

echo "[$(date +%H:%M:%S)] 산출 — v2 $(ls "$A"/*.json 2>/dev/null | wc -l) · v3 $(ls "$B"/*.json 2>/dev/null | wc -l)"
for id in "${IDS[@]}"; do
  for v in v2 v3; do
    d=$([ "$v" = v2 ] && echo "$A" || echo "$B")
    [ -f "$d/$id.json" ] && echo "  $v $id: $(npx tsx scripts/verify-vocab-corpus.ts --file="$d/$id.json" 2>&1 | tail -1)"
  done
done
