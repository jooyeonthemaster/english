#!/usr/bin/env bash
# 기출 단어 코퍼스 — 무인 자가급식 하네스(클로드 헤드리스 레인)
#
# 구조: 계정 1개 = 레인 1개 = **동시 프로세스 1개**.
#   리프레시 토큰은 1회용 회전이라, 같은 계정을 두 프로세스가 동시에 쓰면 서로의 토큰을
#   무효화한다(2026-08-03 사고: 300건 전멸). 그래서 레인마다 자기 CLAUDE_CONFIG_DIR 을 주고,
#   레인 안에서는 지문을 **순차** 처리한다. 병렬성은 계정 수에서 나온다.
#   대화형 세션이 ~/.claude 에서 쓰는 계정은 LANE_RESERVED 로 빼둔다.
#
# 라운드: ① 레인 조회(없으면 리셋까지 잠) → ② 잔여에서 배치 선정 → ③ 트랜치 조립
#        → ④ 레인별 순차 추출 + 게이트 → ⑤ 집계. 순증 0 이 2회 연속이면 자동 중단.
#
#   bash scripts/vocab-claude-forever.sh
#   중단: experiments/vocab-corpus-20260728/FOREVER-STOP 생성 → 라운드 경계에서 멈춘다.
set -uo pipefail

ROOT=d:/Desktop/2026project/nara
E="$ROOT/experiments/vocab-corpus-20260728"
WFD="C:/Users/jooye/.claude/projects/d--Desktop-2026project-nara/652b2631-b720-4406-af94-8b903824aaf1/workflows/scripts"

LOG="$E/claude-forever.log"
STATE="$E/claude-forever-state.tsv"
STOP="$E/FOREVER-STOP"
DEAD="$E/claude-forever-dead.txt"
ATTEMPTS="$E/claude-forever-attempts.tsv"
INFLIGHT="$E/inflight-c3.json"   # 대화형 Workflow 레인이 잡고 있는 ID 목록

PER_LANE=${PER_LANE:-15}         # 레인 1개가 한 라운드에 처리할 지문 수
MAX_ATTEMPTS=${MAX_ATTEMPTS:-3}
MAX_ROUNDS=${MAX_ROUNDS:-500}

mkdir -p "$E/.headless"
touch "$DEAD" "$ATTEMPTS"
[ -f "$STATE" ] || printf 'ts\tround\tpending\tlanes\tbatch\tok\tgate\tfail\tsecs\n' > "$STATE"

say() { echo "$(date '+%m-%d %H:%M:%S') $*" >> "$LOG"; }

say "════ 하네스 기동 (PER_LANE=$PER_LANE reserved=${LANE_RESERVED:-auto} pid=$$) ════"

round=0
dry=0

while :; do
  round=$((round + 1))
  [ "$round" -gt "$MAX_ROUNDS" ] && { say "라운드 상한 도달 — 종료"; break; }
  [ -f "$STOP" ] && { say "STOP 파일 감지 — 종료"; break; }

  # ── ① 레인 조회 ─────────────────────────────────────────────────────────
  LANES=""
  while :; do
    [ -f "$STOP" ] && break
    LANES=$(node "$ROOT/scripts/vocab-quota-gate.mjs" --lanes 2>"$E/.headless/gate.err")
    if [ -n "$LANES" ]; then break; fi
    secs=$(awk '/^WAIT/{print $2}' "$E/.headless/gate.err" | tail -1)
    secs=${secs:-900}
    say "가용 레인 0 — ${secs}초 대기"
    sleep "$secs"
  done
  [ -f "$STOP" ] && { say "STOP 파일 감지 — 종료"; break; }

  nlanes=$(echo "$LANES" | grep -c .)
  N=$((nlanes * PER_LANE))
  say "라운드 $round — 레인 $nlanes개 [$(echo "$LANES" | tr '\n' ' ')] · 배치 목표 $N"

  # ── ② 배치 선정 ─────────────────────────────────────────────────────────
  IDS_JSON="$E/.headless/batch-r$round.json"
  sel=$(node "$ROOT/scripts/vocab-next-batch.mjs" "$N" "$IDS_JSON" "$INFLIGHT" "$DEAD" 2>&1 | tail -1)
  pending=$(echo "$sel" | awk '{print $2}')
  batch=$(echo "$sel" | awk '{print $4}')
  say "  $sel"

  if [ "${batch:-0}" -eq 0 ]; then
    [ "${pending:-0}" -eq 0 ] && { say "잔여 0 — 완주"; break; }
    say "뽑을 게 없다(인플라이트/사망 제외 후) — 900초 후 재시도"; sleep 900; continue
  fi

  # ── ③ 트랜치 조립 ───────────────────────────────────────────────────────
  if ! npx tsx "$ROOT/scripts/vocab-pdata.ts" "$IDS_JSON" > "$E/.headless/pdata-r$round.json" 2>"$E/.headless/pdata-r$round.err"; then
    say "pdata 실패 — 600초 후 재시도"; sleep 600; continue
  fi
  if ! node "$ROOT/scripts/vocab-tranche-build.mjs" "h$round" "$E/.headless/pdata-r$round.json" >> "$LOG" 2>&1; then
    say "트랜치 조립 실패 — 600초 후 재시도"; sleep 600; continue
  fi
  TRANCHE="$WFD/vocab-extract-lean-h$round.js"

  # ── ④ 레인별 순차 추출 (레인끼리만 병렬) ────────────────────────────────
  RLOG="$E/.headless/round-r$round.log"
  : > "$RLOG"
  t0=$SECONDS

  # 지문을 레인에 라운드로빈 배분한다.
  node -e "
    const fs=require('fs');
    const ids=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));
    const lanes=process.argv[2].split(/\s+/).filter(Boolean);
    const buckets=lanes.map(()=>[]);
    ids.forEach((id,i)=>buckets[i%lanes.length].push(id));
    lanes.forEach((l,i)=>fs.writeFileSync(process.argv[3]+'/lane-'+l+'.txt', buckets[i].join('\n')+'\n'));
  " "$IDS_JSON" "$(echo "$LANES" | tr '\n' ' ')" "$E/.headless"

  pids=""
  for lane in $LANES; do
    (
      while read -r id; do
        [ -z "$id" ] && continue
        [ -f "$STOP" ] && break
        bash "$ROOT/scripts/vocab-claude-worker.sh" "$TRANCHE" "$id" "$lane" >> "$RLOG" 2>>"$E/.headless/worker.err"
      done < "$E/.headless/lane-$lane.txt"
    ) &
    pids="$pids $!"
  done
  for p in $pids; do wait "$p"; done

  # ── ⑤ 집계 ──────────────────────────────────────────────────────────────
  # grep -c 는 무매치 시 0 을 찍고 종료코드 1 을 낸다. `|| echo 0` 을 붙이면 "0\n0" 이
  # 되어 산술 비교가 깨진다(2026-08-03 실측: 자동중단이 안 먹어 13라운드 헛돌았다).
  ok=$(grep -c '^OK '    "$RLOG" 2>/dev/null || true); ok=${ok:-0}
  gatefail=$(grep -c '^GATE ' "$RLOG" 2>/dev/null || true); gatefail=${gatefail:-0}
  fail=$(grep -c '^FAIL ' "$RLOG" 2>/dev/null || true); fail=${fail:-0}
  limit=$(grep -c ':limit' "$RLOG" 2>/dev/null || true); limit=${limit:-0}
  authf=$(grep -c ':auth'  "$RLOG" 2>/dev/null || true); authf=${authf:-0}

  grep -E '^(GATE|FAIL) ' "$RLOG" 2>/dev/null | awk '{print $2}' | while read -r bad; do
    [ -z "$bad" ] && continue
    cur=$(awk -F'\t' -v k="$bad" '$1==k{n=$2} END{print n+0}' "$ATTEMPTS")
    next=$((cur + 1))
    printf '%s\t%s\n' "$bad" "$next" >> "$ATTEMPTS"
    if [ "$next" -ge "$MAX_ATTEMPTS" ] && ! grep -qx "$bad" "$DEAD"; then
      echo "$bad" >> "$DEAD"
      say "  ↳ $bad 시도 ${next}회 — 사망 목록으로 제외"
    fi
  done

  secs=$((SECONDS - t0))
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$(date '+%F %T')" "$round" "$pending" "$nlanes" "$batch" "$ok" "$gatefail" "$fail" "$secs" >> "$STATE"
  say "라운드 $round 완료 — 성공 $ok · 게이트탈락 $gatefail · 실패 $fail (한도 $limit · 인증 $authf) · ${secs}초"

  if [ "$ok" -eq 0 ] && { [ "$limit" -gt 0 ] || [ "$authf" -gt 0 ]; }; then
    say "한도/인증으로 전멸 — 게이트에서 대기한다(고갈로 오판하지 않는다)"
    sleep 300
    continue
  fi

  if [ "$ok" -eq 0 ]; then
    dry=$((dry + 1))
    say "순증 0 라운드 ${dry}회째"
    [ "$dry" -ge 2 ] && { say "순증 0 이 2회 연속 — 자동 중단(사람 확인 필요)"; break; }
  else
    dry=0
  fi
done

say "════ 하네스 종료 (라운드 $round) ════"
