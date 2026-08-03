#!/usr/bin/env bash
# 기출 단어 코퍼스 — 구 프롬프트 산출 재추출 (스테이징 후 교체)
#
# 왜: 프롬프트를 고치면 그 이전 산출은 결함을 안고 남는다. 미루면 부채가 되고,
#     4단계 병합·5단계 정량화가 그 위에 쌓이면 되돌리기가 훨씬 비싸진다.
#
# 안전 설계 — **raw/ 를 직접 덮어쓰지 않는다**:
#   ① 스테이징 디렉터리에 새로 뽑는다.
#   ② 게이트를 통과한 것만,
#   ③ **항목 수가 구본의 80% 이상**인 것만 교체한다.
#      (재추출이 어떤 이유로 빈약하게 나오면 멀쩡한 구본을 잃는 게 더 나쁘다.)
#   ④ 교체 전 구본을 backup/ 으로 옮긴다. 되돌릴 수 있어야 한다.
#
#   bash scripts/vocab-reextract.sh <ids.json> [동시실행수]
set -uo pipefail

ROOT="d:/Desktop/2026project/nara"; cd "$ROOT"
# 실험 디렉터리를 주입 가능하게 둔다 — **교체·삭제를 하는 스크립트는 픽스처로 음성테스트할 수 있어야 한다.**
# (VOCAB_SKIP_EXTRACT=1 이면 추출을 건너뛰고 스테이지에 이미 있는 것만 검증·교체한다 = 교체 로직만 시험)
EXP="${VOCAB_EXP:-experiments/vocab-corpus-20260728}"
LIST="${1:?usage: vocab-reextract.sh <ids.json> [동시실행수]}"
JOBS="${2:-24}"
STAGE="$EXP/reextract-stage"
BACKUP="$EXP/reextract-backup"
LOGS="$EXP/reextract-logs"
mkdir -p "$STAGE" "$BACKUP" "$LOGS"

mapfile -t IDS < <(node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).forEach(x=>console.log(x))" "$LIST")
echo "[$(date +%H:%M:%S)] 재추출 ${#IDS[@]}건 · 동시 ${JOBS} · 모델 ${VOCAB_CODEX_MODEL:-<기본>} · 사고 ${VOCAB_CODEX_EFFORT:-high}"

entries_of() { node -e "try{console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).entries.length)}catch(e){console.log(0)}" "$1"; }
traps_of()   { node -e "try{console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).entries.filter(e=>e.trap).length)}catch(e){console.log(0)}" "$1"; }

# 멱등 검사 — **파일 존재만 보면 껍데기가 영구 결손이 된다**(SPEC §12.7).
# 【실측 2026-08-01】 실행이 중간에 죽어 `{}` 나 따옴표 없는 73바이트 껍데기가 남았는데,
#   `[ -f ]` 검사가 그걸 "완료"로 쳐서 그 지문은 다시 시도되지 않고 총계에는 완료로 잡혔다.
#   → 파싱되고 entries 가 1개 이상일 때만 완료로 인정한다.
usable() {
  node -e 'try{const d=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.exit(Array.isArray(d.entries)&&d.entries.length>0?0:1)}catch(e){process.exit(1)}' "$1" 2>/dev/null
}

one() {
  local id="$1"
  if [ -f "$STAGE/$id.json" ]; then
    usable "$STAGE/$id.json" && return 0                    # 멱등 — 쓸 만한 산출이 있으면 건너뛴다
    rm -f "$STAGE/$id.json"                                 # 껍데기면 지우고 다시 뽑는다
  fi
  [ "${VOCAB_SKIP_EXTRACT:-0}" = "1" ] && return 0          # 픽스처 시험용
  bash scripts/vocab-extract-codex-v2.sh "$id" "$STAGE" > "$LOGS/$id.log" 2>&1
}

started=0
for id in "${IDS[@]}"; do
  while [ "$(jobs -rp | wc -l)" -ge "$JOBS" ]; do wait -n 2>/dev/null || sleep 2; done
  one "$id" &
  started=$((started+1))
  [ $((started % 40)) -eq 0 ] && echo "[$(date +%H:%M:%S)] 투입 $started/${#IDS[@]} · 스테이지 $(ls "$STAGE" | wc -l)건"
done
wait

echo "[$(date +%H:%M:%S)] 추출 완료 — 스테이지 $(ls "$STAGE"/*.json 2>/dev/null | wc -l)건 · 검증·교체 시작"
swapped=0; kept=0; failed=0
for id in "${IDS[@]}"; do
  new="$STAGE/$id.json"; cur="$EXP/raw/$id.json"
  if [ ! -f "$new" ]; then failed=$((failed+1)); continue; fi
  if npx tsx scripts/verify-vocab-corpus.ts --file="$new" 2>&1 | grep -q '^❌'; then
    kept=$((kept+1)); echo "  게이트 미통과 → 구본 유지: $id" >> "$LOGS/_decisions.log"; continue
  fi
  # 빈약 판정 — **항목 수만 보면 안 된다.**
  #
  # 【실측 2026-08-01】 원래는 "항목 수가 구본의 80% 미만이면 구본 유지"였다. 93건 교체 후
  #   거부된 4건을 실물로 재판정하니 **2건이 오판**이었다:
  #     2025_SN_5089362-q41-42  항목 81→62 인데 **함정 4→11**(3배)
  #     2005_YB_5006647-q38     항목 34→24 인데 **함정 2→3**
  #   잃은 항목은 `page`·`엄지손가락→엄지` 같은 기초어와 표기 변형이었다.
  #   스펙(§5·§13)은 기초어 채우기를 **결함**으로 본다 — 항목 수는 품질의 대리지표일 뿐인데
  #   그걸 차단 조건으로 써서 더 나은 산출을 버렸다(이 프로젝트의 대리지표 실패 5번째).
  #
  # 가드의 진짜 목적은 **망가진/잘린 산출**을 막는 것이다. 그런 산출은 항목도 함정도 같이 준다.
  # → 항목이 80% 미만이고 **동시에** 함정도 늘지 않았을 때만 구본을 지킨다.
  local_new=$(entries_of "$new"); local_cur=$(entries_of "$cur")
  trap_new=$(traps_of "$new");    trap_cur=$(traps_of "$cur")
  if [ "$local_cur" -gt 0 ] && [ $((local_new * 100)) -lt $((local_cur * 80)) ] && [ "$trap_new" -le "$trap_cur" ]; then
    kept=$((kept+1))
    echo "  빈약(항목 ${local_cur}→${local_new} · 함정 ${trap_cur}→${trap_new}) → 구본 유지: $id" >> "$LOGS/_decisions.log"
    continue
  fi
  mv "$cur" "$BACKUP/$id.json" && mv "$new" "$cur" && swapped=$((swapped+1))
done

echo "[$(date +%H:%M:%S)] 교체 ${swapped}건 · 구본 유지 ${kept}건 · 산출실패 ${failed}건"
echo "  구본 백업: $BACKUP  (문제 시 되돌릴 수 있다)"
echo "  판정 기록: $LOGS/_decisions.log"
