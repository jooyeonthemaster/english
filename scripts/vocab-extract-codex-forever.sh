#!/usr/bin/env bash
# 기출 단어 코퍼스 — Codex 자가급식 러너 (남은 전량이 0 이 될 때까지)
#
# 왜: 감독이 매번 ID 목록을 만들어 재발사하면 그만큼 진행이 멈춘다.
#     이 스크립트는 스스로 미처리분을 뽑아 배치를 돌리고, 끝나면 다시 뽑는다.
#     `--pending` 이 "산출 파일이 없는 지문"만 반환하므로 **몇 번을 죽었다 살아나도 무해**하다.
#
# 사용법:
#   bash scripts/vocab-extract-codex-forever.sh [동시실행수] [배치크기]
#
# 처리량 메모(실측 2026-07-28):
#   동시 8 → 14건/시간 (지문당 34분). 단건 실행은 6분이었다.
#   **8병렬은 경합 구간을 넘었다** — 워커를 늘릴수록 개별 지문이 느려진다.
#   그래서 기본값을 5로 둔다. 배치가 끝날 때마다 실측 처리량을 찍으니 그걸 보고 조절하라.
set -uo pipefail

ROOT="d:/Desktop/2026project/nara"
EXP="$ROOT/experiments/vocab-corpus-20260728"
JOBS="${1:-5}"
BATCH="${2:-120}"
STATE="$EXP/forever-state.tsv"

cd "$ROOT"
mkdir -p "$EXP"

# ═══ 단일 실행 락 ═══════════════════════════════════════════════════════
# 【실측 사고 2026-07-29】 러너가 두 개 동시에 돌았다. `pkill -f vocab-extract-codex` 로
#   죽인 줄 알았는데 안 죽었고(Git Bash 에서 nohup 백그라운드 프로세스는 종종 매칭되지 않는다),
#   그 위에 새로 발사했다. 두 러너가 각각 `--pending` 을 조회해 **같은 지문을 중복 배정**했다:
#   240건 배정 → 순증 169건, 즉 **30%가 코덱스 사용량 낭비**였다.
#   (데이터는 안 깨진다 — 같은 산출을 두 번 쓸 뿐이다. 낭비가 문제다.)
#
# mkdir 은 원자적이라 경쟁 없이 단일성을 보장한다. PID 를 남겨 죽은 락을 구분한다.
LOCKDIR="$EXP/.forever.lock"
if ! mkdir "$LOCKDIR" 2>/dev/null; then
  OLDPID="$(cat "$LOCKDIR/pid" 2>/dev/null || echo '?')"
  # 락은 있는데 그 PID 가 죽었으면 stale 이다(크래시·강제종료). 회수한다.
  if [ "$OLDPID" != "?" ] && kill -0 "$OLDPID" 2>/dev/null; then
    echo "[$(date +%H:%M:%S)] 거부: 러너가 이미 돌고 있다 (PID $OLDPID). 중복 실행은 사용량만 태운다." >&2
    exit 1
  fi
  echo "[$(date +%H:%M:%S)] 죽은 락 회수 (PID $OLDPID 없음)" >&2
  rm -rf "$LOCKDIR" && mkdir "$LOCKDIR" || { echo "락 회수 실패"; exit 1; }
fi
echo "$$" > "$LOCKDIR/pid"
trap 'rm -rf "$LOCKDIR"' EXIT INT TERM

echo "[$(date +%H:%M:%S)] 자가급식 시작 — 동시 ${JOBS} · 배치 ${BATCH} · PID $$"
round=0

while true; do
  round=$((round + 1))
  LIST="$EXP/forever-batch.json"
  npx tsx scripts/vocab-passage.ts --pending --stratify --limit="$BATCH" 2>/dev/null > "$LIST"

  n="$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).length)" "$LIST" 2>/dev/null || echo 0)"
  if [ "$n" -eq 0 ]; then
    echo "[$(date +%H:%M:%S)] 남은 지문 0 — 전량 완료"
    break
  fi

  before="$(ls "$EXP/raw"/*.json 2>/dev/null | wc -l)"
  t0=$(date +%s)
  echo "[$(date +%H:%M:%S)] 라운드 ${round} — ${n}건 투입 (현재 ${before}건 완료)"

  bash scripts/vocab-extract-codex-bulk.sh "$LIST" "$JOBS" > "$EXP/forever-round-${round}.log" 2>&1

  after="$(ls "$EXP/raw"/*.json 2>/dev/null | wc -l)"
  t1=$(date +%s)
  gained=$((after - before))
  mins=$(( (t1 - t0) / 60 ))
  [ "$mins" -eq 0 ] && mins=1
  rate=$(( gained * 60 / mins ))

  printf '%s\t%d\t%d\t%d\t%d\n' "$(date +%H:%M:%S)" "$round" "$gained" "$mins" "$rate" >> "$STATE"
  echo "[$(date +%H:%M:%S)] 라운드 ${round} 완료 — 순증 ${gained}건 / ${mins}분 = ${rate}건/시간 · 누적 ${after}"

  # 순증 0 이면 인프라가 죽은 것이다(코덱스 한도·바이너리 문제). 무한루프 방지.
  if [ "$gained" -eq 0 ]; then
    echo "[$(date +%H:%M:%S)] ⚠️ 순증 0 — 인프라 문제로 판단하고 중단한다. forever-round-${round}.log 를 확인하라."
    break
  fi
done

echo "[$(date +%H:%M:%S)] 종료 — raw $(ls "$EXP/raw"/*.json 2>/dev/null | wc -l)건 · 격리 $(ls "$EXP/quarantine"/*.json 2>/dev/null | wc -l)건"
