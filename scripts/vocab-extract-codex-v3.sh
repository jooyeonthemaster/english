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
set -uo pipefail

ROOT="d:/Desktop/2026project/nara"
ID="${1:?usage: vocab-extract-codex.sh <passageId> [outDir]}"
OUT="${2:-experiments/vocab-corpus-20260728/codex-v2}"

CODEX="$(ls -d "$HOME"/.vscode/extensions/openai.chatgpt-*/bin/windows-x86_64/codex.exe 2>/dev/null | sort -V | tail -1)"
[ -x "$CODEX" ] || { echo "codex.exe 를 찾지 못했다"; exit 1; }

mkdir -p "$ROOT/$OUT"

# ═══ 코덱스 샌드박스 상태파일 프리플라이트 — 지우지 마라 ═══════════════════
# 【무슨 장애였나 · 2026-07-29】
#   재부팅 뒤 추출이 전량 즉사했다. 실패 원문:
#       windows sandbox failed: helper_unknown_error: apply deny-read ACLs
#     └ 샌드박스 로그의 Caused by:
#       parse deny-read ACL state C:\Users\jooye\.codex\.sandbox\deny_read_acl_state.json
#       EOF while parsing a value at line 1 column 0
#   codex exec 표면에서는 이렇게 보였다:
#       ERROR codex_core::exec: exec error: windows sandbox: helper_unknown_error: apply deny-read ACLs
#       Failed to write file D:\Desktop\2026project\nara\...
#
# 【원인】 workspace-write 샌드박스가 아니다. **상태파일 손상**이다.
#   ~/.codex/.sandbox/deny_read_acl_state.json 이 22바이트 전부 NUL(\0) 로 깨져 있었다.
#   정상 내용 `{\n  "principals": {}\n}` 도 정확히 22바이트 — 크기만 커밋되고 데이터가
#   flush 되지 않은 NTFS 비정상 종료의 전형이다("어제까진 됐는데 재부팅 후 깨짐"과 일치).
#   코덱스는 이 파일을 스스로 복구하지 않는다. 그냥 두면 영구 실패다.
#
# 【인과 실측 — codex sandbox 서브커맨드는 모델을 호출하지 않으므로 전부 무과금】
#   $ codex sandbox -P probe -c 'permissions.probe={}' -c sandbox_mode="workspace-write" -- cmd /c "echo X"
#     정상 상태파일       → exit 0
#     22바이트 전부 NUL   → windows sandbox failed: helper_unknown_error: apply deny-read ACLs (exit 1)
#     잘린 JSON('{"principals":') → 동일 실패
#     파일 삭제           → exit 0 (코덱스가 `{\n  "principals": {}\n}` 로 재생성)
#   즉 상태파일 하나가 스위치다. 재현·복구 각 2회 확인.
#
# 【하면 안 되는 것】
#   ⚠️ --sandbox danger-full-access 로 바꾸지 마라. 증상만 가리고 사용자 머신 전체를
#      쓰기 가능하게 열어버린다. workspace-write 로 멀쩡히 돌아간다(아래 가드가 그 근거다).
#   ⚠️ 기각된 우회안(실측): -c sandbox_workspace_write.exclude_slash_tmp=true 및
#      exclude_tmpdir_env_var=true. 두 키는 실재하고 ACL 대상을 [workdir] 로 줄이지만,
#      손상 상태에서 원본과 완전히 동일한 에러로 실패했다. 원인이 /tmp·TMPDIR 가 아니기 때문.
#   ⚠️ config.toml 은 건드리지 않는다(사용자 설정). 필요한 건 이 파일 하나뿐이다.
CODEX_STATE_DIR="${CODEX_HOME:-$HOME/.codex}/.sandbox"
ACL_STATE="$CODEX_STATE_DIR/deny_read_acl_state.json"
ACL_REPAIRED=0

# 온전성 판정: 파일이 없으면 정상(코덱스가 만든다). 있으면 공백·NUL 을 걷어낸 뒤
# `{` 로 시작해 `}` 로 끝나야 한다. 전체 JSON 파싱이 아니라 형태 검사다 —
# 실측된 두 손상 형태(전부 NUL / 중간 절단)를 모두 잡고, 멀쩡한 파일은 절대 건드리지 않는다.
# (principals 에 실제 항목이 든 정상 파일을 지우면 정리되지 않은 ACL 이 남을 수 있다.)
acl_state_is_sane() {
  [ -f "$ACL_STATE" ] || return 0
  local compact
  compact="$(tr -d '\000 \t\r\n' < "$ACL_STATE" 2>/dev/null)"
  case "$compact" in
    '{'*'}') return 0 ;;
    *)       return 1 ;;
  esac
}

# 손상 시에만 격리한다. 대량 러너가 워커를 5~8개 동시에 띄우므로 mkdir 락으로 직렬화한다
# (mkdir 은 원자적이다. 여러 워커가 동시에 mv 하면 서로의 백업을 밟는다).
_quarantine_acl_state() {
  mv -f "$ACL_STATE" "$ACL_STATE.corrupt-$(date +%Y%m%d-%H%M%S)-$$" 2>/dev/null || rm -f "$ACL_STATE"
  ACL_REPAIRED=1
  echo "[preflight] 손상된 코덱스 ACL 상태파일을 격리했다 → 코덱스가 재생성한다: $ACL_STATE" >&2
}

ensure_acl_state() {
  acl_state_is_sane && return 0
  local lock="$CODEX_STATE_DIR/.repair.lock"
  if mkdir "$lock" 2>/dev/null; then
    acl_state_is_sane || _quarantine_acl_state
    rmdir "$lock" 2>/dev/null
  else
    # 다른 워커가 복구 중이다. 잠깐 기다렸다 다시 본다.
    # ⚠️ 락이 고착됐을 때(워커가 복구 도중 죽으면 디렉토리가 남는다) 여기서 그냥 넘어가면
    #    아무도 안 고친 채 실행만 태운다. 그래서 여전히 손상이면 락을 무시하고 직접 고친다.
    #    mv 가 겹쳐도 백업 파일이 하나 더 생길 뿐이라 해롭지 않다(파일명에 PID 를 붙였다).
    sleep 2
    acl_state_is_sane || _quarantine_acl_state
    ACL_REPAIRED=1
  fi
  return 0
}

read -r -d "" PROMPT_TEMPLATE <<'PROMPT_EOF'
너는 기출 영어 지문에서 학습용 어휘를 의미(sense) 단위로 추출하는 작업자다.
작업 디렉토리는 @@ROOT@@ 다.

## 1. 반드시 먼저 읽어라 (이 둘이 전부다)
- docs/vocab-corpus-spec.md  ← 확정 스펙 v3. 유일한 정본. 전문을 읽어라.
- experiments/vocab-corpus-20260728/exemplar/ebsi_go3_20260324-q31.json  ← v3 견본.
  항목의 문체·정밀도를 따라라. 밀도는 아래 §6, 함정 비율은 아래 규범을 따라라.

## 2. 특히 걸리는 조항
- **§7.1 함정 없음이 기본값.** 실측 정상 범위는 trap 비율 25% 안쪽이다.
  ⚠️ 다만 이건 **참고 신호(major)이지 반려 조건이 아니다. 이 숫자를 겨냥하지 마라.**
  아래 3단 시험을 통과한 함정은 비율이 얼마가 되든 남긴다. 비율을 보고 거꾸로 지우면
  §4.1 이 반드시 수록이라 못박은 다의 기능어(just·even·as)가 지워진다 — 실측 사고다.
  §7.2 배제 5종(형태소 분해·발음 근거·자기무효·저빈도어 혼동·어원 같음)은 함정이 아니다.

- **§7.2 3단 반증 시험 — 함정을 쓰기 전에 반드시 통과시켜라. 하나라도 실패하면 trap: null.**
  실측 감사에서 함정의 41.4%가 가짜였다. 원인은 '학생이 X 로 읽어 Y 를 놓친다'는 **문장을
  쓰기만 하면 통과**했기 때문이다. 문형을 채우는 것은 판정이 아니다. 이제 세 가지를 자문하라:

  (i) **통사 시험** — 그 오독 X 가 그 자리에 **물리적으로 들어갈 수 있는가?**
      실패 예: even 이 to부정사 앞 부사 자리인데 형용사 '평평한'으로 읽는다(불가능) /
      a former + 명사 자리에 대명사 '전자'(불가능) / did so 뒤에 강조부사 '매우'(불가능).
      그 자리에 들어갈 수 없는 품사면 학생도 그렇게 못 읽는다. 함정이 아니다.

  (ii) **도달점 시험** — 'X 로 읽은 한국어'와 'senseKo' 를 나란히 적어 **다른 말이 되는가?**
      실패 예: pioneer 개척자/선구자 · filter 걸러내다/걸러내다 · open 식당을 열다/개업하다 ·
      way 길/길 · nearly 가까이/거의. 같은 말에 도달하면 놓치는 것이 없다. 함정이 아니다.

  (iii) **방향 시험** — X 가 **그 학년 학생의 1순위 뜻**인가?
      더 드문 뜻(office=직위, paper=논문, even=평평한)을 학생의 기본값으로 가정하지 마라.

  ⚠️ **같은 단어에 늘 같은 오독을 붙이지 마라.** 실측에서 even 22건 중 10건이 '평평한'이라는
     동일 오독을 복사했다. 게이트가 `TRAP_TEMPLATE_REPEAT` 로 이걸 잡는다.
     문맥마다 다시 판정하라. 판단이 아니라 재탕이면 걸린다.

- **§7.3 종결 분기** — ①~⑦ 어느 kind 에도 정확히 맞지 않으면 **syntax 로 보내지 말고 trap: null.**
  syntax 는 note 에 구조 오독(도치·부분부정·가주어·목적격보어·대동사·분사구문)이 실제로
  기술될 때만 쓴다. 어휘 뜻 오독을 syntax 로 담지 마라.
- §7.4 trap.note 는 2문장·100자 이내. 문항번호·정답근거·발음기호·어법용어 금칙.
- §6.1 문장이 40단어 이하면 예문은 문장 전체다. 자르지 마라. exampleKo 는 null.
  40단어 초과일 때만 자르고 그때는 exampleKo 를 반드시 채운다.
- §5.1 senseKo·senseEn·trap.note·해석이 같은 sense 를 가리켜야 한다.
- §5.2 senseEn 은 지문 독립. 지문 고유어 금지, 두 뜻 나열 금지, 순환 정의 금지.
- §5.2 **목적어 삭제 시험** — senseEn 을 쓴 뒤 지문의 목적어·한정어가 남았는지 보고 지워라.
  ❌ member "a person who belongs to a legislative body" → ✅ "…to a group or organization"
  ❌ get "to obtain thoughts or suggestions" → ✅ "to come to have something"
  senseKo 도 같다: housing→'주거'(❌주거비) · upgrade→'개선하다'(❌상위 기종으로 바꾸다).
  문맥 특수성은 trap.note 소관이지 뜻풀이 소관이 아니다.
- §3.5 분사가 형용사면 lemma=분사형 / 수동태는 lemma·senseKo·senseEn 셋 다 능동 /
  동사+전치사는 **예측 가능성 시험**을 통과해야 phrasal_verb(전치사가 뜻을 안 바꾸면 떼라 —
  arise in→arise, face with→face) / 명사+명사만 collocation 독립 항목 /
  inflection 은 §3.5.6 고정 목록(past_participle 처럼 밑줄 표기).
- **§3 형용사+명사 짝 의무** — 형용사 항목의 collocation 에 `<형용사> <명사>` 를 적었으면
  **그 명사도 같은 파일에 독립 항목으로 있어야 한다(역도 성립).** 실측 38.9%가 이걸 어겼다.
  `glittering gems` 를 적었으면 `gem` 항목을 만들어라. 게이트가 `ADJ_NOUN_PAIR_MISSING` 로 잡는다.
- §8-9 지문 밖 사실 단정 금지.
- confusable 에 자기 자신(lemma·surface)을 넣지 마라.

## 2.5 반드시 수록해야 하는 네 범주 — 빠뜨리면 결함이다

위 §2 는 거의 전부 "하지 마라"다. 그것만 지키면 **안전하지만 빈약한** 산출이 나온다.
실측: 이 절이 없을 때 다의 전치사와 관용 패턴이 통째로 빠졌다. 아래는 **수록 의무**다.

**① 다의 기능어** — 전치사·접속사·부사 중, **그 문맥의 뜻이 학생의 1순위 뜻과 다른** 것.
   판정법: 그 단어를 학생이 가장 먼저 떠올릴 뜻으로 바꿔 읽어보라. 문장이 달라지면 수록한다.
   쉬운 단어라고 건너뛰지 마라 — 쉬운데 다의인 기능어가 이 코퍼스의 핵심이다(tier 로 노출을 조절한다).

**② 상관·비교·정도 구문** — 둘 이상의 자리가 **함께** 하나의 뜻을 이루는 패턴.
   낱말로 쪼개면 뜻이 사라지므로 **통째로 한 항목**(idiom)으로 잡고, 빈자리는 A·B·C 로 표기한다.
   문장에서 상관어(짝을 이루는 말)가 보이면 그 구문 전체가 항목 후보다.

**③ 구동사** — 동사+불변화사가 **예측 불가능한** 뜻을 만들 때(§3.5 예측 가능성 시험 통과분).
   전치사가 뜻을 안 바꾸면 떼고 동사만 쓴다 — 그건 이미 §2 에 있다. 여기서는 **반대 방향**이다:
   뜻이 바뀌는데도 동사만 뽑고 넘어가지 마라.

**④ 파생·굴절로 뜻이 이동한 형태** — 원형과 다른 뜻이면 그 형태를 표제어로 세운다.

⚠️ 그렇다고 §2 를 뒤집지 마라. 여기서 늘리라는 것은 **범주 누락**이지 함정도 군살도 아니다.
   기초어를 채워 밀도를 만드는 것은 여전히 결함이고, 가짜 함정은 여전히 결함이다.

(자기점검은 §2.7 에 하나로 모아 두었다. 거기서 한 번에 확인한다.)

## 2.6 함정 종류(kind) 규율 — 실측 결함 2종

**① `collocation` 은 표제어가 연어 그 자체일 때만 쓴다.**
   실측 결함: collocation 함정의 **21%** 가 이 모양이었다 — 표제어는 단어 하나인데
   note 는 `<그 단어> + <다른 말>` 결합형의 뜻을 설명한다(동사+전치사, 동사+명사, 전치사+명사 등).
   note 에서 **결합형을 설명하고 있다면 그 결합형이 표제어여야 한다.** 둘 중 하나를 골라라:
     (a) 그 연어를 표제어로 세운다(§2.5-②·③ 의 수록 의무와 같은 판단이다), 또는
     (b) 표제어를 단어 하나로 유지하고 kind 를 그 단어의 **어휘 다의**(polysemy)로 바꾼다.
   결합형을 note 로만 언급하고 표제어는 단어 하나로 두는 절충은 **하지 마라** — 학습자가
   그 연어를 항목으로 만나지 못한다.

**② 어휘 다의만 함정이 아니다 — 있는데 안 잡는 것도 결함이다.**
   실측: 한 산출군에서 함정의 **80%가 polysemy** 였고 구조 오독 2% · 유사철자 혼동 0.2% 였다.
   같은 규범으로 만든 다른 산출군은 64% / 12% / 5% 였다. 즉 **문장에 있는데 못 본 것**이다.
   문장을 훑을 때 아래도 함께 보라(§7.3 의 kind 정의를 그대로 따른다):
     - **구조 오독** — 도치·부분부정·가주어/가목적어·목적격보어·대동사·분사구문 때문에
       학생이 주어·부정 범위·수식 대상을 잘못 잡는 자리.
     - **유사철자 혼동** — 그 문맥의 단어가 학생이 아는 **비슷한 철자의 다른 단어**로 읽히는 자리.
   ⚠️ **없는데 만들지 마라.** 이 조항은 "syntax 를 늘려라"가 아니다 — §7.3 은 어느 kind 에도
   맞지 않는 잔여물을 syntax 로 보내는 것을 금지하고 있고, 그 금지는 그대로 유효하다.
   3단 반증 시험(§7.2)을 통과하지 못하면 종류가 무엇이든 `trap: null` 이다.

## 2.7 산출 직전 자기점검 — 문장을 한 번 훑으며 **아래 넷을 동시에** 본다

**점검을 나눠 하지 마라.** 실측: 수록 의무(§2.5)와 함정 규율(§2.6)의 점검을 따로 두었더니
함정 종류를 챙기는 동안 다의 기능어 수록이 도로 빠지는 맞바꿈이 일어났다.
문장 하나를 볼 때 아래 넷을 **한 번에** 확인하면 그 맞바꿈이 생기지 않는다.

문장 i 를 읽으며 자문하라 —

1. **이 문장의 기능어 중, 학생의 1순위 뜻으로 바꿔 읽으면 문장이 달라지는 것이 있는가?**
   (전치사·접속사·부사. 있는데 항목에 없으면 지금 추가한다. 쉬운 단어라고 건너뛰지 마라.)
2. **둘 이상의 자리가 함께 한 뜻을 이루는 구문이 있는가?** (있으면 통째로 한 항목, 빈자리는 A·B·C)
3. **여기 단 함정의 kind 가 note 의 내용과 맞는가?**
   (note 가 결합형을 설명하면 그 결합형이 표제어여야 한다. 아니면 kind 는 그 단어의 polysemy 다.)
4. **문장의 뼈대를 짚어라 — 아래 넷을 순서대로 "지목"한다. 판단이 아니라 지목이다.**
   (i) **주어와 본동사**를 짚는다 → 둘이 떨어져 있으면(도치·삽입·긴 수식·주어 지연) 거기가 자리다.
   (ii) `not·no·never·nor·few·only` 가 있으면 **그 부정·한정이 미치는 끝**을 짚는다
        → 문장 전체가 아니면 거기가 자리다(부분부정).
   (iii) **분사·to부정사·동명사**가 있으면 **그 의미상 주어**를 짚는다
        → 문장 주어와 다르면 거기가 자리다.
   (iv) `it·that·what·as` 가 있으면 **그것이 대신하는 것**을 짚는다
        → 가주어·가목적어·관계사 생략·대동사면 거기가 자리다.
   그리고 그 문맥의 단어가 **비슷한 철자의 다른 단어**로 읽히는 자리도 함께 본다.

   ⚠️ 지목했다고 전부 함정이 아니다. 지목한 자리마다 **학생이 구체적으로 어디를 잘못 짚는지**를
   한 문장으로 쓸 수 있어야 함정이다. **못 쓰면 함정이 아니다 — 쓸 수 없으면 만들지 마라.**
   (쓴 뒤에도 §7.2 3단 반증 시험을 통과해야 한다. 통과 못 하면 `trap: null` 이다.)

   지목한 자리에 함정을 붙일 항목이 아직 없으면, **그 자리의 핵심 단어**(도치된 부사구의 전치사,
   부정의 범위를 정하는 말, 분사, 관계사가 걸린 명사)를 항목으로 세우고 거기에 붙여라.

이 점검은 "충분히 뽑았다"는 느낌으로 대체할 수 없다. 문장 수만큼 반복한다.

## 3. 네 작업 단위
지문 ID: @@ID@@
원문은 이 명령으로 받는다(passages.json 을 직접 읽지 마라 — 5.3MB다):
  npx tsx scripts/vocab-passage.ts @@ID@@
반환된 sentences[].en 을 그대로 쓰면 불변식 1이 자동 충족된다. ko 만 채워라.

## 4. 산출
@@OUT@@/@@ID@@.json 에 스펙 §2 스키마대로 JSON 을 **전면 교체**로 써라.

## 5. 자체 검증 — critical 0 이 될 때까지 고쳐라(최대 5회)
  npx tsx scripts/verify-vocab-corpus.ts --file=@@OUT@@/@@ID@@.json

등급별로 해야 할 일이 다르다. 섞지 마라.
- **critical** — 반드시 0. 스키마·불변식 위반이라 협상 대상이 아니다.
- **major 중 고쳐야 하는 것**: ADJ_NOUN_PAIR_MISSING(형용사 짝 명사를 독립 항목으로),
  DUP_SENSE(같은 lemma·pos·senseKo 중복), DENSITY_BELOW_REFERENCE(놓친 범주 재점검),
  EXAMPLE_KO_UNNEEDED(자르지 않았으면 exampleKo 는 null).
- **major 중 겨냥하면 안 되는 것**: TRAP_RATIO. 함정 비율은 참고 신호다.
  **이 숫자를 낮추려고 함정을 지우면 그게 결함이다.**
- **minor 전부**(SENSE_KO_ABSENT_IN_KO · TRAP_TEMPLATE_REPEAT · SENSE_EN_CONTEXT_LEAK) — 참고 신호다.
  뜻이 맞으면 그대로 둔다. 실측 사고: 이걸 맞추려다 `lose 잃다→잃어버리다` 처럼 정답을 비틀고
  `feel` 항목을 아예 삭제한 산출이 나왔다. **검사를 맞추려고 뜻을 바꾸지 마라.**

## 6. 밀도 — 하한이 아니라 목표다
§4.2 의 max(12, 단어수×0.15) 는 최저선이지 목표가 아니다.
정상 산출 334건 실측 분포는 최저 0.180 · 중앙 0.243 · p75 0.269 다.
**단어수 × 0.25 를 목표로 삼아라.** 0.18 미만이면 게이트가 DENSITY_BELOW_REFERENCE 를 띄운다.
단, **밀도를 기초어로 채우지 마라** — 실측 대조에서 네가 추가한 항목의 63%가 basic tier 였다
(tree, bone, math, science, begin, usually). 그건 밀도가 아니라 군살이다.

## 7. 빠뜨리기 쉬운 것 — 뽑기 전에 이 체크리스트를 훑어라
한국 고교생이 실제로 틀리는 것은 어려운 단어가 아니라 아는 줄 알았던 단어다.
(1) 기능어 다의 — since(이래로/때문에), as(로서/함에 따라/때문에), while(동안/반면),
    for(위해/왜냐하면), just(단지/막/정확히). 스펙 §4.1 이 반드시 수록이라 못박은 것들이다.
(2) 숙어·구동사 — make faces, for example, out of reach 처럼 통째로 한 항목인 것.
(3) 쉬운데 다의인 내용어 — make, take, tell, show, object, wind, touch, edge, leap, gentle, leave.
    이런 것을 basic tier 로 반드시 뽑아라. 쉽다고 건너뛰면 안 된다.
(4) 파생어 — 접두·접미로 품사나 극성이 바뀐 것.

## 7.5 표제어를 쪼개지 마라 — 실측된 네 최대 결함
§3.5.3 은 '동사+전치사는 phrasal_verb' 다. 그런데 실측 대조에서 너는 **뒤따르는 전치사를
무조건 표제어에 붙였다**: arise on / arise in / face with / advise on / distinguish from.
이건 구동사가 아니라 **동사 + 그냥 전치사구**다. 표제어가 이렇게 쪼개지면 4,537지문을
합칠 때 arise 와 arise in 이 다른 단어가 되어 병합이 무너진다. 이게 네 산출의 최대 결함이다.

**판정 기준 — 이 시험을 통과해야만 phrasal_verb 다:**
  동사+조사 전체의 뜻이 **동사 단독의 뜻에서 예측되지 않는가?**
  - `give up`(포기하다) ← give(주다) 에서 예측 불가 → ✅ phrasal_verb
  - `bring about`(야기하다) ← bring(가져오다) 에서 예측 불가 → ✅ phrasal_verb
  - `arise in the forest` ← arise(생기다) 그대로. in 은 장소를 표시할 뿐 → ❌ 표제어는 `arise`
  - `advise on safety` ← advise(조언하다) 그대로 → ❌ 표제어는 `advise`
  - `face with a problem` ← face(직면하다) 그대로 → ❌ 표제어는 `face`
전치사가 뜻을 안 바꾸면 **전치사를 떼고 동사만** 표제어로 써라. 구 전체는 `collocation` 필드에 적어라.

## 7.6 tier 를 낮추지 마라
실측 대조에서 너는 tier 를 낮추는 쪽으로 2:1 로 치우쳤다
(advanced→core: hence, modification, stir, descend from / core→basic: way, share, key, remain).
`basic` 은 **중학 수준 초고빈도어**만이다(the, make, good). 수능 필수면 `core`,
고교생이 사전 없이 못 읽으면 `advanced` 다. 애매하면 **낮추지 말고 높여라.**

## 8. 마지막 자문 (반드시 수행)
초안을 다 쓴 뒤 문장을 처음부터 하나씩 다시 훑으면서 자문하라:
이 문장에서 고교생이 틀릴 만한데 내가 안 뽑은 단어가 있는가?
한 문장당 최소 2~4항목이 나오는지 확인하고, 모자라면 보강한 뒤 파일을 다시 써라.
PROMPT_EOF

# ⚠️ 프롬프트는 **인용 heredoc** 으로 받는다. 큰따옴표 문자열로 두면 본문의 백틱이
#    명령 치환으로 실행된다(실측 사고: `give up` → "give: command not found" 로 3건 전멸).
#    치환은 확장이 일어나지 않는 파라미터 치환으로만 한다.
PROMPT="${PROMPT_TEMPLATE//@@ROOT@@/$ROOT}"
PROMPT="${PROMPT//@@ID@@/$ID}"
PROMPT="${PROMPT//@@OUT@@/$OUT}"


cd "$ROOT"

# 샌드박스는 workspace-write 를 **유지한다**. 위 프리플라이트가 실패 원인을 걷어내므로
# 보안 태세를 낮출 이유가 없다.
# 모델·사고수준은 **밖에서 지정 가능**하게 둔다.
#
# 【2026-08-01】 원래 `model_reasoning_effort="high"` 가 하드코딩돼 있었다. 그런데
#   `~/.codex/config.toml` 은 `ultra` 로 설정돼 있어서, **CLI 인자가 설정을 덮고 있었다** —
#   즉 지금까지의 sol 산출은 전부 `high` 로 나온 것이고 `ultra` 는 한 번도 쓰인 적이 없다.
#   모델 비교 실험(sol vs luna)을 하려면 이 두 축을 분리해야 해서 환경변수로 뺀다.
#   기본값은 기존과 동일하게 둬 회귀가 없다.
CODEX_MODEL="${VOCAB_CODEX_MODEL:-}"
CODEX_EFFORT="${VOCAB_CODEX_EFFORT:-high}"

run_codex() {
  local args=(exec --skip-git-repo-check --sandbox workspace-write
              -c model_reasoning_effort="$CODEX_EFFORT")
  [ -n "$CODEX_MODEL" ] && args+=(-m "$CODEX_MODEL")
  "$CODEX" "${args[@]}" "$PROMPT" < /dev/null 2>&1
}

ensure_acl_state

# 출력을 임시 파일로 받는다. 원래대로 마지막 5줄만 찍되(호출자 로그 형식 유지),
# ACL 실패 문구를 판정하려면 전문이 필요하다.
LOG="$(mktemp 2>/dev/null)" || LOG="$ROOT/$OUT/.$ID.codex.log"
run_codex > "$LOG"
RC=$?

# 백스톱: 프리플라이트를 통과한 뒤(=실행 도중) 상태파일이 깨진 경우.
# ACL 에러가 찍혔고 · 산출도 없고 · 실제로 손상을 격리했을 때만 1회 재시도한다.
# 어차피 버려질 실행 하나를 건지는 것이므로 추가 소모는 순증이 아니다. 무한 재시도는 안 한다.
# (상태파일이 멀쩡한데 같은 에러가 나면 원인이 다른 것이다 — 재시도로 사용량을 태우지 않는다.)
if grep -q 'apply deny-read ACLs' "$LOG" 2>/dev/null && [ ! -f "$ROOT/$OUT/$ID.json" ]; then
  ACL_REPAIRED=0
  ensure_acl_state
  if [ "$ACL_REPAIRED" = "1" ]; then
    echo "[retry] 샌드박스 ACL 상태파일 손상을 복구했다 — 1회 재시도한다" >&2
    run_codex > "$LOG"
    RC=$?
  else
    echo "[warn] ACL 에러가 났는데 상태파일은 멀쩡하다. 원인이 다르다 — 재시도하지 않는다." >&2
  fi
fi

tail -5 "$LOG"
rm -f "$LOG"

# 출처 각인 — v2 와 같은 규약(SPEC §12.4·§12.5). 라벨만 다르다.
BRIEF_HASH="$(printf '%s' "$PROMPT_TEMPLATE" | sha1sum | cut -c1-12)"
node "$ROOT/scripts/vocab-stamp-brief.mjs" "$ROOT/$OUT/$ID.json" \
     "$BRIEF_HASH" "codex-v3-struct" "$(date -Iseconds)" 2>/dev/null

exit $RC
