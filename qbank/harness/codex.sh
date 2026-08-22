#!/usr/bin/env bash
# Codex CLI shim — 버전이 박힌 확장 경로를 글롭으로 매번 다시 찾는다.
#
# 왜 shim 인가(메모리 codex-integration): 동작하는 바이너리가
#   ~/.vscode/extensions/openai.chatgpt-<버전>-win32-x64/bin/windows-x86_64/codex.exe
# 에 있는데 **확장 업데이트마다 경로가 바뀐다**(몇 주 주기로 실제로 깨졌다).
# 구버전은 config 의 `model_reasoning_effort = "ultra"` 를 몰라 파싱 단계에서 죽으므로
# 항상 **최신 버전**을 골라야 한다.
#
# 사용:
#   qbank/harness/codex.sh exec "프롬프트"                 # 1회 실행
#   qbank/harness/codex.sh --which                         # 선택된 바이너리 경로만 출력
#   CODEX_EFFORT=low qbank/harness/codex.sh exec "..."     # 추론 강도 조절
set -uo pipefail

pick_codex() {
  local found
  found=$(ls -d /c/Users/jooye/.vscode/extensions/openai.chatgpt-*/bin/windows-x86_64/codex.exe 2>/dev/null | sort -V | tail -1)
  if [ -z "$found" ]; then
    found=$(ls -d "$LOCALAPPDATA"/OpenAI/Codex/bin/codex.exe 2>/dev/null | tail -1)
  fi
  echo "$found"
}

CODEX_BIN="${CODEX_BIN:-$(pick_codex)}"
if [ -z "$CODEX_BIN" ] || [ ! -f "$CODEX_BIN" ]; then
  echo "[codex.sh] 바이너리를 찾지 못했다. VS Code 의 openai.chatgpt 확장이 설치돼 있는지 확인하라." >&2
  exit 127
fi

if [ "${1:-}" = "--which" ]; then
  echo "$CODEX_BIN"
  "$CODEX_BIN" --version 2>&1 | head -1
  exit 0
fi

# ⚠ 플래그는 **하위 명령 뒤**에 온다. `codex --skip-git-repo-check exec ...` 는
#   "unexpected argument" 로 죽는다(실측). 올바른 형태는 `codex exec --skip-git-repo-check ...`.
#
# --skip-git-repo-check     : 비신뢰 디렉토리 거부 회피
# --sandbox workspace-write : 파일 쓰기 허용(저작 산출물)
# < /dev/null               : stdin 대기 방지(없으면 영원히 멈춘다)
SUB="${1:-exec}"
shift || true

# ★ 추론 강도는 **기본적으로 건드리지 않는다.**
#    `~/.codex/config.toml` 이 `model_reasoning_effort = "ultra"` 로 설정돼 있는데,
#    초판 shim 이 `-c model_reasoning_effort="high"` 를 무조건 넘겨 **사용자 설정을 덮어쓰고 있었다**
#    (세션 기록에서 `reasoning_effort=high` 로 실측 확인 — 의도치 않은 하향이었다).
#    CODEX_EFFORT 를 명시했을 때만 덮어쓴다.
EFFORT_ARGS=()
if [ -n "${CODEX_EFFORT:-}" ]; then
  EFFORT_ARGS=(-c "model_reasoning_effort=$CODEX_EFFORT")
fi

exec "$CODEX_BIN" "$SUB" \
  --skip-git-repo-check \
  --sandbox workspace-write \
  "${EFFORT_ARGS[@]}" \
  "$@" < /dev/null
