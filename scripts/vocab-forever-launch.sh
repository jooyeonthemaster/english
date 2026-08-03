#!/usr/bin/env bash
# 무인 하네스 기동 래퍼.
#
# 왜 별도 파일인가: PowerShell 의 Start-Process 는 -ArgumentList 문자열을 공백에서 쪼개
# `bash -c "cd X && Y"` 를 `bash -c cd X && Y` 로 망가뜨린다(실측). 공백 없는 경로 하나만
# 넘기면 그 문제가 사라진다.
cd /d/Desktop/2026project/nara || exit 1
export PER_LANE=${PER_LANE:-15}
# 대화형 세션이 ~/.claude 에서 쓰는 계정. 레인이 같은 계정을 잡으면 리프레시 토큰이 충돌한다.
export LANE_RESERVED=${LANE_RESERVED:-acc3}
exec bash scripts/vocab-claude-forever.sh
