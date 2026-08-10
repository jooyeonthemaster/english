#!/usr/bin/env bash
# 기출 단어 코퍼스 추출 — Codex CLI(gpt-5.6-sol) 경로
#
# 왜: 추출 단계가 전체 토큰의 95%+ 를 먹는다(지문당 ~104k). Claude Code 에이전트 대신
#     구독에 포함된 Codex 로 돌리면 Claude 세션 한도를 검수·병합·UI 구축에 쓸 수 있다.
#     ※ 과금 API 가 아니라 구독 실행기이므로 "외부 과금 API 0건" 규칙과 무관하다.
#
# 사용법:
#   bash scripts/vocab-extract-codex.sh <passageId> [outDir]
#
# 주의(메모리 codex-integration 참조):
#   - 바이너리 경로에 버전이 박혀 있어 확장 업데이트 시 깨진다. 글롭으로 최신을 찾는다.
#   - --skip-git-repo-check 없으면 비신뢰 디렉토리에서 거부된다.
#   - < /dev/null 없으면 stdin 을 계속 기다린다.
set -euo pipefail

ROOT="d:/Desktop/2026project/nara"
ID="${1:?usage: vocab-extract-codex.sh <passageId> [outDir]}"
OUT="${2:-experiments/vocab-corpus-20260728/codex}"

CODEX="$(ls -d "$HOME"/.vscode/extensions/openai.chatgpt-*/bin/windows-x86_64/codex.exe 2>/dev/null | sort -V | tail -1)"
[ -x "$CODEX" ] || { echo "codex.exe 를 찾지 못했다"; exit 1; }

mkdir -p "$ROOT/$OUT"

PROMPT="너는 기출 영어 지문에서 학습용 어휘를 의미(sense) 단위로 추출하는 작업자다.
작업 디렉토리는 ${ROOT} 다.

## 1. 반드시 먼저 읽어라 (이 둘이 전부다)
- docs/vocab-corpus-spec.md  ← 확정 스펙 v3. 유일한 정본. 전문을 읽어라.
- experiments/vocab-corpus-20260728/exemplar/ebsi_go3_20260324-q31.json  ← v3 견본.
  193단어 지문에서 33항목, trap 은 그중 16개(48.5%)만. 이 밀도와 절제를 그대로 따라라.

## 2. 특히 걸리는 조항
- §7.1 함정 없음이 기본값. trap 비율 50% 초과 시 게이트가 자동 반려한다.
  §7.2 배제 5종(형태소 분해·발음 근거·자기무효·저빈도어 혼동·어원 같음)은 함정이 아니다.
  note 첫 문장에 '학생이 X 로 읽어 Y 를 놓친다'를 못 쓰면 trap: null.
- §7.4 trap.note 는 2문장·100자 이내. 문항번호·정답근거·발음기호·어법용어 금칙.
- §6.1 문장이 40단어 이하면 예문은 문장 전체다. 자르지 마라. exampleKo 는 null.
  40단어 초과일 때만 자르고 그때는 exampleKo 를 반드시 채운다.
- §5.1 senseKo·senseEn·trap.note·해석이 같은 sense 를 가리켜야 한다.
- §5.2 senseEn 은 지문 독립. 지문 고유어 금지, 두 뜻 나열 금지, 순환 정의 금지.
- §3.5 분사가 형용사면 lemma=분사형 / 수동태는 lemma·senseKo·senseEn 셋 다 능동 /
  동사+전치사는 전부 phrasal_verb / 명사+명사만 collocation 독립 항목 /
  inflection 은 §3.5.6 고정 목록(past_participle 처럼 밑줄 표기).
- §8-9 지문 밖 사실 단정 금지.
- confusable 에 자기 자신(lemma·surface)을 넣지 마라.

## 3. 네 작업 단위
지문 ID: ${ID}
원문은 이 명령으로 받는다(passages.json 을 직접 읽지 마라 — 5.3MB다):
  npx tsx scripts/vocab-passage.ts ${ID}
반환된 sentences[].en 을 그대로 쓰면 불변식 1이 자동 충족된다. ko 만 채워라.

## 4. 산출
${OUT}/${ID}.json 에 스펙 §2 스키마대로 JSON 을 **전면 교체**로 써라.

## 5. 자체 검증 — critical 0 이 될 때까지 고쳐라(최대 5회)
  npx tsx scripts/verify-vocab-corpus.ts --file=${OUT}/${ID}.json
minor 는 무시해도 된다.

## 6. 밀도
§4.2 하한 = max(12, round(단어수 × 0.15)). 상한 없음."

cd "$ROOT"
"$CODEX" exec \
  --skip-git-repo-check \
  --sandbox workspace-write \
  -c model_reasoning_effort="high" \
  "$PROMPT" < /dev/null 2>&1 | tail -5
