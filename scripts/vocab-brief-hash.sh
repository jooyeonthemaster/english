#!/usr/bin/env bash
# 현행 추출 브리프의 각인 해시를 찍는다.
#
# 왜 셸인가: 각인은 추출 스크립트가 `read -r -d "" PROMPT_TEMPLATE <<'PROMPT_EOF'` 로 읽은 값을
#   `printf '%s' | sha1sum` 한 것이다. 이걸 다른 언어에서 **재현하려 하면 틀린다** —
#   실측: Node 로 heredoc 본문을 잘라 sha1 했더니 `6c19a2073f83` 이 나왔는데
#   실제 각인은 `318140cb7b63` 이었다(read -d "" 의 종단 처리가 다르다).
#   해시가 틀리면 **전량이 "낡음"으로 잡히거나 아무것도 안 잡힌다** — 조용한 대형 오판이다.
#   그래서 기준값은 **각인과 같은 코드 경로**로만 만든다.
#
#   bash scripts/vocab-brief-hash.sh [스크립트경로]
set -uo pipefail
SRC="${1:-d:/Desktop/2026project/nara/scripts/vocab-extract-codex-v2.sh}"
[ -f "$SRC" ] || { echo "없다: $SRC" >&2; exit 2; }

# 추출 스크립트에서 heredoc 구간만 떼어내 **그 스크립트와 동일한 방식으로** 읽는다.
TMP="$(mktemp)" || exit 1
{
  echo '#!/usr/bin/env bash'
  sed -n '/^read -r -d "" PROMPT_TEMPLATE/,/^PROMPT_EOF$/p' "$SRC"
  echo 'printf "%s" "$PROMPT_TEMPLATE" | sha1sum | cut -c1-12'
} > "$TMP"
bash "$TMP"
rm -f "$TMP"
