#!/usr/bin/env bash
# 기출 단어 코퍼스 — Codex 대량 추출 러너 (워커 풀)
#
# 왜: 추출이 전체 토큰의 95%+ 를 먹고, Claude 세션 한도가 진행의 병목이다.
#     Codex 는 구독 실행기라 Claude 세션 예산을 안 쓴다(과금 API 아님).
#     A/B 실측(5지문): 표제어 겹침 89~97% · 게이트 critical 0 · 밀도 0.278(클로드 0.235).
#
# 사용법:
#   bash scripts/vocab-extract-codex-bulk.sh <ID목록.json> [동시실행수]
#   bash scripts/vocab-extract-codex-bulk.sh --pending <건수> [동시실행수]
#
# 설계:
#   - **멱등**: 산출 파일이 이미 있으면 건너뛴다. 몇 번을 다시 돌려도 무해하다.
#   - **워커 풀**: 동시 N개만 띄우고 하나 끝나면 다음을 넣는다(전부 한꺼번에 띄우면 죽는다).
#   - **게이트 자동 검증**: 지문마다 끝나고 바로 --file 검증, critical 이면 산출을 격리한다.
#     통과 못 한 파일을 raw/ 에 남기면 오염이고, 지우면 --pending 이 자동으로 다시 잡는다.
#   - **진행 로그**: logs/ 에 지문별 stdout, manifest.tsv 에 한 줄 요약.
set -uo pipefail

ROOT="d:/Desktop/2026project/nara"
EXP="$ROOT/experiments/vocab-corpus-20260728"
OUT_REL="experiments/vocab-corpus-20260728/raw"
LOGS="$EXP/codex-bulk-logs"
MANIFEST="$EXP/codex-bulk-manifest.tsv"
# 사용량 한도 감지 플래그 — 라운드마다 새로 시작한다(아래에서 초기화).
LIMIT_FLAG="$EXP/.codex-usage-limit"

cd "$ROOT"
mkdir -p "$LOGS" "$EXP/raw" "$EXP/quarantine"

# ── 대상 ID 확보 ────────────────────────────────────────────────────────
if [ "${1:-}" = "--pending" ]; then
  N="${2:?usage: --pending <건수> [동시실행수]}"
  JOBS="${3:-6}"
  LIST="$EXP/codex-bulk-ids.json"
  npx tsx scripts/vocab-passage.ts --pending --stratify --limit="$N" 2>/dev/null > "$LIST"
else
  LIST="${1:?usage: <ID목록.json> [동시실행수] | --pending <건수> [동시실행수]}"
  JOBS="${2:-6}"
fi

mapfile -t IDS < <(node -e "
const fs=require('fs');
const a=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));
for(const x of a) console.log(x);
" "$LIST")

rm -f "$LIMIT_FLAG"   # 라운드 시작 시 초기화 — 지난 라운드 한도가 이번을 막으면 안 된다
# 어느 모델·사고수준으로 만든 산출인지 로그에 남긴다.
# (v2 스크립트가 `VOCAB_CODEX_MODEL`/`VOCAB_CODEX_EFFORT` 를 읽고, 환경변수는 자식에 상속된다.
#  나중에 "이 파일 누가 만들었나"를 되짚을 때 이 한 줄이 유일한 근거다.)
echo "대상 ${#IDS[@]}건 · 동시 ${JOBS} · 모델 ${VOCAB_CODEX_MODEL:-<config 기본>} · 사고 ${VOCAB_CODEX_EFFORT:-high}"
[ "${#IDS[@]}" -gt 0 ] || { echo "대상이 없다"; exit 0; }

CODEX="$(ls -d "$HOME"/.vscode/extensions/openai.chatgpt-*/bin/windows-x86_64/codex.exe 2>/dev/null | sort -V | tail -1)"
[ -x "$CODEX" ] || { echo "codex.exe 를 찾지 못했다"; exit 1; }
echo "코덱스: $CODEX"

# ── 지문 1건 처리 ───────────────────────────────────────────────────────
run_one() {
  local id="$1"
  local outfile="$EXP/raw/$id.json"

  # 멱등 — 이미 있으면 건너뛴다. 세션이 죽어도 재발사가 무해한 근거다.
  #
  # ⚠️ **파일 존재만 보면 껍데기가 영구 결손이 된다**(SPEC §12.7).
  # 【실측 2026-08-01】 실행이 중간에 죽어 `{}` 나 따옴표 없는 73바이트 껍데기가 남았는데,
  #   이 검사가 그걸 "완료"로 쳐서 그 지문은 **다시는 시도되지 않고** 총계에는 완료로 잡혔다.
  #   raw 총계 3,535 가 실제로는 3,533 이었다 — 진척 보고가 조용히 거짓이 된다.
  #   → 파싱되고 entries 가 1개 이상일 때만 완료로 인정하고, 껍데기는 지우고 다시 뽑는다.
  if [ -f "$outfile" ]; then
    if node -e 'try{const d=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.exit(Array.isArray(d.entries)&&d.entries.length>0?0:1)}catch(e){process.exit(1)}' "$outfile" 2>/dev/null; then
      printf '%s\tSKIP\t이미 있음\n' "$id" >> "$MANIFEST"
      return 0
    fi
    rm -f "$outfile"
    printf '%s\tREDO\t껍데기 산출 — 지우고 재추출\n' "$id" >> "$MANIFEST"
  fi

  # 사용량 한도 조기 중단 — 누가 먼저 한도를 만나면 나머지는 시도할 이유가 없다.
  # 【실측 낭비 2026-07-29】 라운드 200건 중 90건이 전부 같은 한도 에러였다.
  #   한도는 지문마다 다시 판정되는 게 아니라 계정 단위라, 한 번 걸리면 그 라운드는 끝이다.
  #   그런데도 워커들이 남은 190건을 계속 태웠다(각각 코덱스 기동 비용).
  #   그래서 첫 감지 시 플래그를 세우고 이후 배정분은 실행 없이 즉시 SKIP 한다.
  if [ -f "$LIMIT_FLAG" ]; then
    printf '%s\tSKIP\t사용량 한도(라운드 중단)\n' "$id" >> "$MANIFEST"
    return 1
  fi

  bash scripts/vocab-extract-codex-v2.sh "$id" "$OUT_REL" > "$LOGS/$id.log" 2>&1

  if [ ! -f "$outfile" ]; then
    # 한도 에러면 그 사실을 남겨 라운드 전체를 접는다(재개는 --pending 이 알아서 한다).
    if grep -qi "hit your usage limit\|usage limit" "$LOGS/$id.log" 2>/dev/null; then
      local until
      until="$(grep -ho 'try again at [^.]*' "$LOGS/$id.log" 2>/dev/null | head -1)"
      : > "$LIMIT_FLAG"
      printf '%s\tFAIL\t사용량 한도 — %s\n' "$id" "${until:-시각미상}" >> "$MANIFEST"
      echo "[$(date +%H:%M:%S)] ⚠️ 코덱스 사용량 한도 감지 — 이 라운드를 접는다. ${until:-}" >&2
      return 1
    fi
    printf '%s\tFAIL\t산출 없음\n' "$id" >> "$MANIFEST"
    return 1
  fi

  # 게이트 — critical 이 남은 산출은 raw/ 에 두지 않는다.
  # 격리하면 --pending 이 다시 잡으므로 재실행으로 자동 복구된다.
  local v
  v="$(npx tsx scripts/verify-vocab-corpus.ts --file="$outfile" 2>&1)"
  if printf '%s' "$v" | grep -q '^❌'; then
    mv "$outfile" "$EXP/quarantine/$id.json"
    printf '%s\tQUARANTINE\t%s\n' "$id" "$(printf '%s' "$v" | grep -c 'CRITICAL') critical" >> "$MANIFEST"
    return 1
  fi

  local n
  n="$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).entries.length)" "$outfile" 2>/dev/null || echo '?')"
  printf '%s\tOK\t%s항목\n' "$id" "$n" >> "$MANIFEST"
  return 0
}

# ── 워커 풀 ─────────────────────────────────────────────────────────────
started=0
for id in "${IDS[@]}"; do
  # 동시 실행 수 상한을 넘으면 하나 끝날 때까지 기다린다.
  while [ "$(jobs -rp | wc -l)" -ge "$JOBS" ]; do wait -n 2>/dev/null || sleep 2; done
  run_one "$id" &
  started=$((started + 1))
  if [ $((started % 25)) -eq 0 ]; then
    echo "[$(date +%H:%M:%S)] 투입 $started/${#IDS[@]} · 완료 $(ls "$EXP/raw" | wc -l)건"
  fi
done
wait

echo "=== 완료 ==="
echo "  raw 총계: $(ls "$EXP/raw"/*.json 2>/dev/null | wc -l)건"
echo "  격리:     $(ls "$EXP/quarantine"/*.json 2>/dev/null | wc -l)건"
echo "  manifest: $MANIFEST"
