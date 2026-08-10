#!/usr/bin/env bash
# 지문 1건을 헤드리스 클로드로 추출하고 게이트까지 확인한다.
#
# 왜 헤드리스인가: 무인 재개가 목적이라 대화 세션에 의존할 수 없는데, 헤드리스 `claude -p` 에는
# Workflow 도구가 없다(2026-08-03 실측). 대신 **워크플로가 에이전트에 주던 브리프 원문 그대로**를
# stdin 으로 먹인다 — 에이전트가 Write 로 산출하고 Bash 로 게이트를 도는 구조는 동일하다.
#
# 왜 레인(격리 config)인가: 2026-08-03 사고. `~/.claude/.credentials.json` 하나를 워크플로
# 에이전트 16기 + 헤드리스 워커 + clauth 선제회전이 공유했고, **리프레시 토큰은 1회용 회전**이라
# 서로의 토큰을 무효화해 300건이 `OAuth session expired` 로 전멸했다. 계정마다 자기 config
# 디렉터리를 주면 공유가 사라져 경합 자체가 없어진다.
#
#   bash scripts/vocab-claude-worker.sh <트랜치스크립트> <지문ID> <레인계정>
#
# 종료코드 0=성공(게이트 통과) · 1=실패. 한 줄 상태를 stdout 으로 낸다(루프가 집계한다).
set -uo pipefail

ROOT=d:/Desktop/2026project/nara
E="$ROOT/experiments/vocab-corpus-20260728"
TRANCHE="${1:?트랜치 스크립트 경로}"
ID="${2:?지문 ID}"
LANE_ACC="${3:?레인 계정명}"
OUT="$E/raw/$ID.json"
WORK="$E/.headless"
LANE="$HOME/.vocab-lanes/$LANE_ACC"
SNAP="$HOME/.clauth/profiles/$LANE_ACC/credentials.json"
mkdir -p "$WORK" "$E/quarantine" "$LANE"

# 멱등 — 다른 레인이 이미 만들었으면 건드리지 않는다.
if [ -s "$OUT" ]; then echo "SKIP $ID 이미있음"; exit 0; fi

# 레인 씨앗 — 없을 때만 심는다. 이미 있으면 그 레인이 스스로 갱신해 온 토큰이 최신이므로 덮지 않는다.
if [ ! -s "$LANE/.credentials.json" ]; then
  cp "$SNAP" "$LANE/.credentials.json" 2>/dev/null || { echo "FAIL $ID 레인씨앗없음:$LANE_ACC"; exit 1; }
fi

BRIEF="$WORK/$ID.brief.txt"
if ! node "$ROOT/scripts/vocab-brief-emit.mjs" "$TRANCHE" "$ID" > "$BRIEF" 2> "$WORK/$ID.emit.err"; then
  echo "FAIL $ID 브리프생성실패"; exit 1
fi
if [ ! -s "$BRIEF" ]; then echo "FAIL $ID 브리프빈값"; exit 1; fi

cd "$ROOT" || { echo "FAIL $ID cd실패"; exit 1; }

run_once() {
  CLAUDE_CONFIG_DIR="$LANE" timeout "${WORKER_TIMEOUT:-2700}" claude -p \
    --permission-mode acceptEdits \
    --allowedTools "Write Edit Read Bash" \
    < "$BRIEF" > "$WORK/$ID.out" 2>&1
}

run_once
rc=$?

# 자가치유 — 레인 토큰이 죽었으면 clauth 스냅샷으로 다시 심고 딱 한 번 재시도한다.
if [ ! -s "$OUT" ] && grep -qi "not logged in\|please run /login\|OAuth session expired" "$WORK/$ID.out" 2>/dev/null; then
  if [ -s "$SNAP" ]; then
    cp "$SNAP" "$LANE/.credentials.json"
    echo "RESEED $ID 레인 $LANE_ACC 재씨앗 후 재시도" >&2
    run_once
    rc=$?
  fi
fi

if [ ! -s "$OUT" ]; then
  reason=timeout
  if [ "$rc" -ne 124 ]; then
    if grep -qiE "usage limit|rate.?limit|한도|quota" "$WORK/$ID.out" 2>/dev/null; then reason=limit
    elif grep -qiE "not logged in|OAuth session expired" "$WORK/$ID.out" 2>/dev/null; then reason=auth
    else reason="rc$rc"; fi
  fi
  echo "FAIL $ID 산출없음:$reason"
  exit 1
fi

if npx tsx scripts/verify-vocab-corpus.ts --file="$OUT" > "$WORK/$ID.gate" 2>&1; then
  n=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).entries.length)}catch(e){console.log('?')}" "$OUT")
  echo "OK $ID 항목$n"
  rm -f "$BRIEF"
  exit 0
fi

# critical 이 남았다 — 격리한다. 다음 라운드의 잔여 계산에 자동으로 다시 포함된다.
mv -f "$OUT" "$E/quarantine/$ID.json"
echo "GATE $ID 격리"
exit 1
