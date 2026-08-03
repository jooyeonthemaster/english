#!/usr/bin/env bash
# 기출 단어 코퍼스 — 정지 탐지기 (감독용)
#
# 왜: 워크플로 완료 알림은 몇 시간에 한 번이고, 그 사이에 조용히 죽는 실패가 실제로 있었다.
#     ① 코덱스 러너 프로세스 사망(크래시·락 유실) ② 코덱스 사용량 한도 ③ 클로드 529 전멸
#     ④ 배정이 마름(클로드 트랜치 소진). 넷 다 "산출이 안 늘어난다"로 관측된다.
#
# 설계 — **침묵은 성공이 아니다**:
#   - 15분마다 순증을 재고, 0 이면 즉시 경보한다(진짜 정지).
#   - 한도 플래그·러너 PID 사망은 순증을 기다리지 않고 바로 경보한다.
#   - 정상일 때도 60분마다 하트비트를 낸다 — 그래야 "조용함"이 건강인지 탐지기 사망인지 구분된다.
set -uo pipefail

ROOT="d:/Desktop/2026project/nara"
EXP="$ROOT/experiments/vocab-corpus-20260728"
INTERVAL="${1:-900}"      # 15분
HEARTBEAT="${2:-3600}"    # 60분

count() { ls "$EXP/raw"/*.json 2>/dev/null | wc -l; }

# 진척은 raw/ 만으로 재면 **부수 작업이 도는 동안 오판한다.**
# 【실측 2026-08-01】 240건 재추출이 병행되던 중 raw/ 순증만 보고 "243→52건/시간 급락"으로 읽었다.
#   실제로는 재추출이 스테이징 디렉터리에 쌓고 있었고 합산 처리량은 188건/시간이었다.
#   정지 판정은 **일하고 있는 모든 곳**의 순증을 합쳐야 한다.
work_count() {
  local n; n=$(count)
  for d in "$EXP/reextract-stage" "$EXP/blind-new"; do
    [ -d "$d" ] && n=$((n + $(ls "$d"/*.json 2>/dev/null | wc -l)))
  done
  echo "$n"
}

prev="$(work_count)"
last_hb=0
elapsed=0
# 상태 지문 — 같은 상태를 반복 통보하지 않는다.
# 【실측 2026-07-30】 코덱스가 주간 한도(8/6 복관)로 멈춘 동안 같은 경보 3종이 15분마다
#   그대로 재전송돼 알림이 도배됐다. 경보는 **상태가 바뀔 때** 값이 있고, 안 바뀌면 소음이다.
prev_state=""
prev_stalled=0

while true; do
  sleep "$INTERVAL"
  elapsed=$((elapsed + INTERVAL))
  # ⚠️ 두 수를 **분리해서** 쓴다.
  #   `cur`  = 일하고 있는 모든 곳의 합 → **정지 판정(순증)** 전용.
  #   `done_n` = raw/ 실적 → **진척 보고·완주 판정** 전용.
  #   합계를 완주 판정에 쓰면 스테이지 파일이 더해져 `>= 4537` 이 일찍 참이 되고
  #   "전량 추출 완료"가 거짓으로 울린다(수정 직후 자기점검에서 잡음).
  cur="$(work_count)"
  done_n="$(count)"
  gain=$((cur - prev))
  state=""

  # ① 코덱스 사용량 한도 — 계정 리셋까지 코덱스는 0 이다.
  #
  # 【2026-07-30】 코덱스는 주간 크레딧 소진으로 **8/6 까지 확정 정지**다. 이 조건은 앞으로
  #   일주일간 계속 참이므로 알릴 값이 없다. 그런데 탐지기를 재시작할 때마다(수정·세션 재시작)
  #   "상태 최초 관측"으로 잡혀 매번 같은 경보가 나갔다 — 실측 4회. 그래서 기본은 침묵이고,
  #   코덱스를 다시 쓰기 시작할 때 `--codex` 로 켠다.
  if [ "${WATCH_CODEX:-0}" = "1" ] && [ -f "$EXP/.codex-usage-limit" ]; then
    until_s="$(grep -ho 'try again at [^.]*' "$EXP"/codex-bulk-logs/*.log 2>/dev/null | tail -1)"
    state="${state}codex-limit;"
    codex_msg="⚠️ 코덱스 사용량 한도 — ${until_s:-시각미상} (클로드 단독 운용)"
  else
    codex_msg=""
  fi

  # ② 러너 프로세스 사망 — 락은 남았는데 PID 가 없으면 크래시다.
  #    코덱스 정지 기간에는 락이 없는 게 정상이라 이 검사도 같은 플래그로 묶는다.
  pid=""
  [ "${WATCH_CODEX:-0}" = "1" ] && pid="$(cat "$EXP/.forever.lock/pid" 2>/dev/null || echo '')"
  runner_msg=""
  if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
    state="${state}runner-dead;"
    runner_msg="🔴 코덱스 러너 사망 (PID $pid 없음, 락 잔존) — 재발사 필요"
  elif [ -z "$pid" ]; then
    state="${state}runner-absent;"
    runner_msg=""   # 코덱스가 한도로 멈춘 동안은 락이 없는 게 정상이다. 상태로만 기록한다.
  fi

  # ③ 진짜 정지 — 산출이 아예 없다. 이것만은 상태가 유지돼도 1시간마다 다시 알린다
  #    (진행이 멈춘 채 방치되는 게 이 탐지기가 막으려는 유일한 사건이다).
  # ⚠️ 정지는 `state` 에 넣지 않는다. 넣으면 정지가 풀릴 때마다 지문이 바뀌어
  #    코덱스 한도·러너 메시지가 **같이 딸려 재발송된다**(실전에서 확인).
  stall_msg=""
  if [ "$gain" -eq 0 ]; then
    stall_msg="🔴 정지: 최근 $((INTERVAL/60))분 순증 0건 · 누적 ${done_n}/4537 — 엔진 확인 필요"
  fi

  # 통보 규칙 — **정지 여부는 다른 조건과 분리해서** 판정한다.
  #
  # 【음성테스트에서 발견 2026-07-30】 처음엔 모든 조건을 한 상태 지문에 합쳐 "지문이 비면 정상 복귀"로
  #   판정했다. 그런데 코덱스가 주간 한도로 멈춘 지금은 락이 없는 게 정상이라 `runner-absent` 가
  #   **영구히 참**이고, 따라서 지문이 절대 비지 않아 **"정상 복귀"가 영원히 울리지 않았다.**
  #   복귀 신호를 못 받으면 감독은 정지가 풀렸는지 알 수 없다 — 그래서 정지 플래그를 따로 뺐다.
  if [ -n "$stall_msg" ]; then
    if [ "$prev_stalled" != "1" ]; then
      echo "$stall_msg"
      last_hb=$elapsed
    elif [ $((elapsed - last_hb)) -ge "$HEARTBEAT" ]; then
      echo "$stall_msg (계속 정지 중)"
      last_hb=$elapsed
    fi
    prev_stalled=1
  else
    if [ "$prev_stalled" = "1" ]; then
      rate=$(( gain * 3600 / INTERVAL ))
      echo "💚 정지 해소 — ${done_n}/4537 · ${rate}건/시간"
      last_hb=$elapsed
    fi
    prev_stalled=0
  fi

  # 그 외 조건(코덱스 한도·러너 사망)은 자기 상태가 바뀔 때만 통보한다.
  if [ "$state" != "$prev_state" ]; then
    [ -n "$codex_msg" ] && echo "$codex_msg · 누적 ${done_n}건"
    [ -n "$runner_msg" ] && echo "$runner_msg · 누적 ${done_n}건"
    prev_state="$state"
  fi

  # ④ 하트비트 — 정상일 때도 살아있음을 알린다.
  if [ $((elapsed - last_hb)) -ge "$HEARTBEAT" ] && [ "$gain" -gt 0 ]; then
    rate=$(( gain * 3600 / INTERVAL ))
    rem=$((4537 - done_n))
    eta=$(( rate > 0 ? rem / rate : 0 ))
    echo "💚 ${done_n}/4537 ($((done_n * 100 / 4537))%) · ${rate}건/시간 · 잔여 ${rem} · ETA ${eta}시간"
    last_hb=$elapsed
  fi

  # ⑤ 완주
  if [ "$done_n" -ge 4537 ]; then
    echo "🎉 전량 추출 완료 — ${done_n}/4537"
    break
  fi

  prev="$cur"
done
