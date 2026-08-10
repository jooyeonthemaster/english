// ============================================================================
// 요약문 영작(SUMMARY_WRITING) md 프롬프트 — 정본(빈칸·어법) 7블록 골격의 이식본.
// 견본: prompts-antonym.ts / 계약 문서: docs/md-qgen-type-expansion-spec.md
//
// ⚠ 이 유형은 **서술형**이다. 선지가 없으므로 `정답: ①` 축도, `오답:` 블록도 없다.
//   정답의 진실원은 빈칸별 `정답(A):` 줄이고, 꼬리는 `채점기준:` + `해설:` 이다.
//
// 【형식 설계 — 규범 §1-B 철칙 대조표】 (구현 전 검산한 결과를 여기 남긴다)
//  · 철칙1(한 정보는 한 곳에서만) — 초안(§7-5)의 `모범답안:` `미끼:` `연결틀:` 3줄을
//    전부 **삭제**했다. 셋 다 다른 줄이 이미 말하고 있는 사실이다:
//      - 모범답안 = 요약문의 (A)(B) 를 정답으로 치환한 것 → 어댑터가 결정형 파생.
//        받아 두면 "모범답안 ≠ 요약문+정답" 이라는 실패 모드가 새로 생긴다(정본 fast
//        레인의 실제 약점이며, 그걸 잡는 검증기는 없다).
//      - 미끼 = 보기 칩 중 어느 정답에도 소비되지 않는 칩 → 게이트가 조립 알고리즘의
//        잔여(leftover)로 결정형 파생. 자기신고 목록은 거짓말이 가능하지만(정답에
//        쓰이는 칩을 미끼라 우기는 실측 패턴) 잔여 파생은 거짓말이 불가능하다.
//      - 연결틀(connectorFrameAfter) = 요약문에서 빈칸 뒤에 오는 텍스트 그 자체.
//        게다가 이 필드는 학생면·강사면 어디에서도 렌더되지 않는다(실측: 소비처는
//        student-safe-data.ts 의 슬롯 복사 1곳뿐).
//  · 철칙2(줄당 칸 최소화) — 모든 줄이 `라벨: 값 하나` 다. 파이프·표·O/X 칸 없음.
//  · 철칙3(조용히 버리지 않기) — 파서는 줄 단위 관대 파싱, 게이트가 자리를 지목.
//  · 철칙5(자리 지목) — 게이트 메시지는 전부 `정답(B)` 처럼 라벨을 찍는다.
//
// 설정 집행: 발문(direction)은 buildSummaryWritingDirection 이 이미 결정론으로
// 합성한 문자열이다. 모델이 발문을 지어내면 sw-direction-wordbank-mismatch 로
// 터지므로, 프롬프트는 **확정 발문을 그대로 보여 주고 "다시 쓰지 마라"** 고 못박는다.
// ============================================================================

import type { ResolvedSummaryWritingSettings } from "@/lib/question-type-generation-settings";
import type { MdDifficulty, MdExplanationMode } from "./prompts";

export const SUMMARY_WRITING_MD_BLANK_COUNT_MIN = 1;
export const SUMMARY_WRITING_MD_BLANK_COUNT_MAX = 3;

/** "(A)" ~ "(C)" — 채점 키가 곧 이 라벨이다(answer-spec.ts:210). 괄호 대문자 고정. */
export function summaryWritingMdLabels(blankCount: number): string[] {
  const n = Math.min(
    SUMMARY_WRITING_MD_BLANK_COUNT_MAX,
    Math.max(SUMMARY_WRITING_MD_BLANK_COUNT_MIN, Math.round(Number(blankCount) || 1)),
  );
  return Array.from({ length: n }, (_, i) => `(${String.fromCharCode(65 + i)})`);
}

export function clampSummaryWritingMdBlankCount(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return SUMMARY_WRITING_MD_BLANK_COUNT_MIN;
  return Math.min(
    SUMMARY_WRITING_MD_BLANK_COUNT_MAX,
    Math.max(SUMMARY_WRITING_MD_BLANK_COUNT_MIN, n),
  );
}

// ── [블록 2] few-shot 해부 ───────────────────────────────────────────────────
// 규칙 나열보다 실물 해부가 공예를 끌어올린다(정본 주석의 확정 결론).
const SUMMARY_WRITING_FEWSHOT = `## 모범 설계 해부 — 이 수준을 재현하라 (예시의 표현을 복사하지는 마라)
지문: 표본을 늘리지 않은 채 관측치만 늘리면 오차가 줄지 않고 편향만 확대된다는 통계 방법론 글.
- 요약문 설계: "(A), which can lead to greater bias in the result." — 빈칸 밖은 **논지의 뼈대만** 남겼고, 판단이 걸린 핵심 명제 전체가 빈칸 안에 들어갔다. 학생은 빈칸 하나를 채우려고 글 전체의 인과를 읽어야 한다.
- 정답 설계: "Collecting data without increasing the sample size" — 지문의 어느 문장도 이 어순으로 말하지 않는다. 지문은 "researchers kept adding observations while the sample frame stayed fixed" 라고 썼고, 요약문은 그것을 동명사 주어로 **압축·재구성**했다. 그래서 지문에서 베껴 쓸 수 없다.
- 보기 설계: [collecting data / without / the sample size / increasing / expanding / reducing] — expanding·reducing 은 increasing 의 의미장 이웃이라 문장에 대입해 보기 전에는 소거되지 않는다. 무관한 단어를 미끼로 넣었다면 학생이 읽지도 않고 버렸을 것이다.
- 핵심어 설계: collecting, sample, size — 정답에 **등장하는 형태 그대로** 적었다(collect 로 적으면 채점기가 학생 답의 "collecting" 을 못 찾는다). without 같은 기능어는 핵심어가 아니다.
- 이 설계가 아름다운 이유: 정답을 만들려면 ①무엇이 늘었고 ②무엇이 안 늘었는지의 대조를 정확히 잡아야 한다. 둘 중 하나만 잡으면 문장은 만들어지지만 명제가 틀린다 — 즉 "그럴듯하게 틀린 답"이 실제로 존재하고, 채점이 그것을 갈라낸다.`;

// ── [블록 3] 표적 설계 — 난이도 3분기 ────────────────────────────────────────
const SUMMARY_WRITING_TARGET_BY_DIFFICULTY: Record<MdDifficulty, string> = {
  BASIC: `## 표적 설계 (기본 난이도) — "재배열 영작"
- 학생에게 의미·재료·구조를 전부 준다. 남은 과제는 **어순 조립 하나**다.
- 요약문은 지문의 핵심 명제를 한 문장으로 **곧게** 옮긴다(추론 도약 금지). 빈칸 밖 프레임은 넉넉히 남겨 문장 구조가 눈에 보이게 하라.
- 빈칸 정답은 근거가 지문 한 문장 안에서 닫히는 명제로 잡는다. 두 문장을 이어야만 나오는 명제는 이 난이도의 표적이 아니다.
- [해석]은 직역에 가깝게(다만 정답 어구를 한국어로 1:1 나열하지는 마라 — 그건 받아쓰기다).`,
  INTERMEDIATE: `## 표적 설계 (중급 난이도) — "미끼 + 배분 판단"
- 요약문은 지문의 **인과·대조 연결**을 압축한다. 근거가 두 문장에 걸쳐 있어야 한다(원인 문장 + 결과 문장).
- 빈칸이 2개면 둘을 **서로 다른 논리 역할**로 잡아라(예: (A)=조건/원인, (B)=귀결). 같은 역할의 어구 두 개를 비우면 배분 판단이 사라져 빈칸이 하나인 것과 같아진다.
- [해석]은 자연스러운 의역이어야 한다. 직역이면 학생이 한국어를 영어로 되옮기기만 하면 끝난다.
- 미끼는 정답 단어의 **동의어·활용형**으로 둔다. 문장에 대입해 봐야 탈락하는 미끼만이 미끼다.`,
  KILLER: `## 표적 설계 — KILLER 의 생명
- 요약문을 **지문 표면 위의 한 층**에서 써라. 지문이 사례를 나열했다면 요약문은 그 사례들이 공유하는 원리를 말해야 하고, 지문이 원리를 말했다면 요약문은 그 원리가 강제하는 귀결을 말해야 한다. 지문 문장의 어휘 치환은 요약이 아니라 번안이다.
- 빈칸 밖 문장도 지문과 다른 표현으로 다시 써라(표면 매칭 암기로 뚫리는 자리를 남기지 마라).
- 빈칸 2개는 **하나의 명제를 둘로 쪼갠 것**이어야 한다 — (A)만 맞고 (B)가 틀리면 문장 전체의 명제가 무너지도록 설계하라. 그래야 부분점수가 실제 이해도를 측정한다.
- 보기는 기본형으로 주고 학생이 시제·수·태를 맞추게 하라(어형 변형). 단, **틀린 형태를 주고 고치게 하는 어법수정형은 금지**다 — 그건 다른 유형이다.
- 학생이 어느 지점에서 흔들릴지를 계산하고 학생 머리 꼭대기에서 설계하라.`,
};

// ── [블록 4] 미끼·누수 기제 분류학 ───────────────────────────────────────────
const SUMMARY_WRITING_TRAP_TAXONOMY = `## 미끼 칩 기제 분류학 — 같은 기제를 두 번 쓰지 마라
- **어형 미끼**: 정답 단어의 다른 활용형(increase 에 대해 increased/increasing). 어형 판단이 걸린 자리에서만 유효하다.
- **의미장 미끼**: 정답 단어와 같은 의미장의 이웃(increasing 에 대해 expanding/enlarging). 문장에 대입해야 정도·함축의 어긋남이 드러나야 한다.
- **역방향 미끼**: 논지의 반대 방향 단어(increasing 에 대해 reducing). 글의 방향을 거꾸로 잡은 학생만 집어 든다 — 가장 진단적인 미끼다.
- 🚫 무관 미끼 금지: 지문 주제와 무관한 단어는 학생이 읽지도 않고 버린다. 그건 함정이 아니라 장식이다.
- 🚫 정답 통째 칩 금지: 다단어 정답 어구를 칩 하나에 몰아넣으면 정답이 그대로 노출된다. 정답은 반드시 여러 칩으로 흩어라.
- 🚫 보기 나열 순서를 정답 어순으로 두지 마라. 미끼를 정답 칩 **사이사이에** 끼워 넣어 왼쪽→오른쪽으로 읽어도 정답이 재구성되지 않게 하라.`;

// ── 설정 집행 블록 ───────────────────────────────────────────────────────────

/**
 * usePartial 이 실제로 요구하는 미끼 칩 수.
 * ⚠ `boxDistractors` 는 난이도 프리셋을 타지 않는 숫자 노브라 **기본값이 0** 이다
 *   (NumericSettingSpec.defaultValue=0 — 프리셋의 1·2는 적용되지 않는다). 그 값을
 *   그대로 프롬프트에 실으면 "미끼를 정확히 0개 넣어라" 를 명령한 뒤 그 결과를
 *   게이트가 반려하는 **결정론적 생성 실패**가 된다(실측 critical). usePartial 은
 *   정의상 "쓰지 않는 칩이 있다" 는 계약이므로 최소 1개를 바닥으로 둔다.
 *   게이트(gate-summary-writing.ts)가 같은 식으로 대칭 검사한다.
 */
export function summaryWritingDistractorNeed(
  s: Pick<ResolvedSummaryWritingSettings, "boxDistractors">,
): number {
  return Math.max(1, Math.round(Number(s.boxDistractors) || 0));
}

function wordBankBlock(s: ResolvedSummaryWritingSettings, blankCount: number): string {
  if (!s.wordBankEnabled) {
    return `## 보기 상자 (교사 설정: 없음)
- \`보기:\` 줄을 **쓰지 마라**. 학생은 아무 재료 없이 빈칸을 영작한다.
- 재료가 없으므로 정답 어구는 지나치게 특수한 콜로케이션을 피하고, 지문 논지를 아는 학생이면 도달할 수 있는 표현으로 잡아라.`;
  }
  const lines: string[] = ["## 보기 상자 (교사 설정, 필수)"];
  lines.push(
    `- \`보기:\` 줄에 칩을 \` / \` 로 이어 쓴다. 칩은 ${
      s.wordBankChunking === "chunk"
        ? "짧은 의미 덩어리(2~3단어)까지 허용하되, 한 칩이 빈칸 정답의 절반 이상을 담으면 안 된다"
        : s.wordBankChunking === "mixed"
          ? "단어 단위를 기본으로 하고 일부만 짧은 덩어리로 묶는다"
          : "**단어 단위**로 쪼갠다"
    }.`,
  );
  lines.push(
    "- 같은 단어가 정답에 두 번 필요하면 같은 문자열을 **두 개** 넣는다(×2 규약). 하나만 넣으면 학생이 정답을 조립할 수 없다.",
  );
  if (s.wordBankUsage === "useAll") {
    lines.push(
      `- **useAll**: 보기 칩 전체가 빈칸 ${blankCount}개의 정답을 정확히 덮어야 한다. 남는 칩도, 모자란 칩도 있으면 안 된다(미끼 0개).`,
    );
  } else if (s.wordBankUsage === "usePartial") {
    lines.push(
      `- **usePartial**: 어느 정답에도 쓰이지 않는 **미끼 칩을 ${summaryWritingDistractorNeed(s)}개 이상** 보기에 섞어라. 미끼가 0개면 보기가 사실상 useAll 이 되어 발문의 "필요한 단어만 골라" 가 거짓이 되고, 학생은 모든 칩을 그냥 다 끼워 넣으면 끝난다.`,
      "- 미끼 목록을 따로 적지 마라 — 기계가 \`보기:\` 와 \`정답(X):\` 를 대조해 스스로 골라낸다. 네가 할 일은 **실제로 안 쓰이는 칩을 그 개수만큼 넣는 것** 하나뿐이다.",
    );
  } else {
    lines.push(
      "- **freeCount**: 학생이 필요한 만큼만 골라 쓴다. 여분 칩이 있어도 되지만 정답 조립에 필요한 칩은 하나도 빠뜨리지 마라.",
    );
  }
  lines.push(
    s.wordBankFidelity === "verbatim"
      ? "- **verbatim**: 칩의 형태를 그대로 쓰면 정답이 되어야 한다. 정답 어구의 단어 형태와 칩의 형태가 한 글자도 달라선 안 된다."
      : s.wordBankFidelity === "inflected"
        ? "- **inflected**: 칩은 기본형으로 주고, 정답에서는 시제·수·태를 맞춰 변형된 형태로 쓴다. 틀린 형태를 주고 고치게 하는 것은 금지."
        : "- **mixed**: 일부 칩만 기본형으로 주고 나머지는 그대로 쓰이는 형태로 준다.",
  );
  if (s.wordBankOrder === "alphabetical") {
    lines.push("- 칩은 알파벳 순으로 나열한다.");
  } else {
    lines.push(
      "- 칩 순서는 **반드시 셔플**한다. 왼쪽에서 오른쪽으로 읽었을 때 정답 어순의 연속 조각이 나오면 안 된다.",
    );
  }
  if (blankCount >= 2) {
    lines.push(
      s.blankAssignment === "shared"
        ? `- **shared**: 보기 하나를 빈칸 ${blankCount}개가 나눠 쓴다. 어느 칩이 어느 빈칸으로 가는지가 **유일하게** 결정되도록 배분하라(두 가지 배분이 다 말이 되면 그 문항은 무효다).`
        : "- **separate**: 각 빈칸이 보기의 자기 몫에서만 칩을 가져간다.",
    );
  }
  return lines.join("\n");
}

function glossBlock(s: ResolvedSummaryWritingSettings): string {
  if (!s.glossEnabled) {
    return `## 해석 상자 (교사 설정: 없음)
- \`해석:\` 줄을 **쓰지 마라**. 학생은 한국어 도움 없이 요약문을 읽고 영작한다.`;
  }
  const looseness =
    s.glossLooseness === "literal"
      ? "직역에 가깝게 — 다만 정답 어구 구간까지 1:1로 옮기지는 마라"
      : s.glossLooseness === "gist"
        ? "요지만 — 세부 수식은 걷어내고 논지의 골자만"
        : s.glossLooseness === "partial"
          ? "빈칸 구간은 상위 개념으로 뭉개고 나머지만 자연스럽게"
          : "자연스러운 의역 — 한국어를 영어로 되옮기기만 하면 풀리는 직역 금지";
  return `## 해석 상자 (교사 설정, 필수)
- \`해석:\` 줄에 **글 전체 의미를 한국어 한 문장**으로 쓴다. 강도: ${looseness}.
- ⭐ 역번역 자기검산: 해석에서 빈칸에 해당하는 한국어 구간을 다시 영어로 직역해 보라. 정답의 단어와 어순이 그대로 복원되면 그건 해석이 아니라 **정답 받아쓰기**다 — 그 구간을 역할 서술(상위 개념)로 다시 써라.`;
}

function targetWordsBlock(s: ResolvedSummaryWritingSettings): string {
  if (s.targetWordsMode === "hidden") {
    return "- 목표 단어 수는 학생에게 알리지 않는다. 그래도 각 빈칸 정답은 대략 " +
      `${s.targetWordsPerBlank}단어 규모로 설계하라(발문에는 쓰지 않는다).`;
  }
  const strict =
    s.targetWordsMode === "exact"
      ? `발문이 "${s.targetWordsPerBlank}단어로" 라고 못박았다. 각 빈칸 정답은 **정확히 ${s.targetWordsPerBlank}단어**여야 한다 — 세어 보고 어긋나면 어구를 다시 짜라.`
      : `발문이 "약 ${s.targetWordsPerBlank}단어로" 라고 안내한다. 각 빈칸 정답은 ${Math.max(2, s.targetWordsPerBlank - 2)}~${s.targetWordsPerBlank + 2}단어 안에 들어와야 한다.`;
  return `- ${strict}`;
}

function connectorFrameBlock(s: ResolvedSummaryWritingSettings): string {
  if (s.connectorFrame === "full") {
    return "- **connectorFrame=full**: 빈칸 주변 절 구조를 온전히 남겨라. 비는 것은 빈칸 자리 하나뿐이고 문장 골격은 전부 보여야 한다.";
  }
  if (s.connectorFrame === "partial") {
    return "- **connectorFrame=partial**: 빈칸 뒤에 짧은 연결부(예: \", which can lead to ...\")만 남기고 나머지 절은 빈칸이 흡수한다. 학생이 더 많이 써야 한다.";
  }
  return "- **connectorFrame=bare**: 빈칸 주변 프레임을 최소화한다. 요약문은 뼈대만 남는다.";
}

function sourceModeBlock(s: ResolvedSummaryWritingSettings): string {
  const head =
    s.summarySourceMode === "inference"
      ? "- **summarySourceMode=inference**: 요약문은 지문에 문장으로 쓰여 있지 않은 **상위 명제**여야 한다. 지문 문장을 어휘만 바꿔 옮기면 실패다."
      : "- **summarySourceMode=paraphrase**: 요약문은 지문 핵심의 재진술이되, 어느 지문 문장과도 어순·구조가 달라야 한다.";
  return s.sourceSentenceParaphrase
    ? `${head}\n- 빈칸 **밖** 문장도 지문 표현을 그대로 쓰지 말고 다시 써라(표면 매칭 차단).`
    : head;
}

function scoringBlock(s: ResolvedSummaryWritingSettings): string {
  if (s.scoringGranularity === "rubric") {
    return `## 채점 (교사 설정: 루브릭)
- \`채점기준:\` 에 **항목별 배점**을 한국어로 적어라(최소 1줄, 권장 2~3줄). 이 유형의 루브릭 채점은 사람/AI 검토로 넘어가므로, 이 줄들이 곧 채점자의 판단 근거다.
- \`동치(X):\` 에 어순·구문이 다른 동치 정답을 1~3개 적되 **한 줄에 하나씩**(줄을 여러 번 쓴다). 분사구문↔관계절, not only A but B↔both 처럼 구문을 바꾼 것이어야 한다.
- \`핵심어(X):\` 는 이 채점 모드에서 자동채점이 읽지 않는다(검수 참고용). 적을 거면 정답 어구에 **등장하는 형태 그대로** 한 단어씩 적고, 확신이 없으면 그 줄을 생략하라 — 억지로 채우다 형태가 어긋나느니 없는 편이 낫다.`;
  }
  if (s.scoringGranularity === "exact") {
    return `## 채점 (교사 설정: 정확 일치)
- 자동채점이 정답 집합과 **정확 일치**로만 판정한다. \`동치(X):\` 에 어순·동의구문 동치 정답을 **빠짐없이**, **한 줄에 하나씩** 적어라 — 여기 없는 표현은 전부 오답 처리된다.
- ⚠ 확신 없는 변형은 넣지 마라. 집합에 든 문자열은 무조건 만점 처리되므로 오답을 흡수한다.
- \`핵심어(X):\` 는 이 채점 모드에서 자동채점이 읽지 않는다(검수 참고용). 적을 거면 정답 어구에 **등장하는 형태 그대로** 한 단어씩 적고, 확신이 없으면 그 줄을 생략하라 — 억지로 채우다 형태가 어긋나느니 없는 편이 낫다.`;
  }
  return `## 채점 (교사 설정: 키워드 부분점수)
- \`핵심어(X):\` 가 부분점수의 근거다. 그 빈칸 정답에서 **반드시 들어가야 할 핵심 단어**만 적어라 — 관사·전치사·조동사 같은 기능어는 표제어가 아니다.
- 표제어는 **한 단어씩** 적는다(구를 통째로 적으면 채점기가 매칭하지 못해 전건 보류 처리된다).
- ⭐ 표제어는 **정답 어구 안에 실제로 등장하는 형태 그대로** 적어라. 채점기는 학생 답의 단어 토큰과 정확 대조하므로, 정답이 "collecting" 인데 표제어를 "collect" 로 적으면 어떤 학생도 그 조건을 만족할 수 없다.`;
}

function clueBlock(s: ResolvedSummaryWritingSettings): string {
  if (s.clueMode === "firstLetter" || s.clueMode === "firstLetterDashes") {
    return "- 단서(앞글자)는 **기계가 정답에서 직접 파생**한다. 앞글자를 따로 적지 마라(적으면 같은 사실을 두 곳에서 받는 중복 계약이 된다).";
  }
  if (s.clueMode === "wordCount") {
    return "- 단서(단어 수)는 기계가 정답 토큰 수에서 파생한다. 따로 적지 마라.";
  }
  if (s.clueMode === "skeleton") {
    return "- 단서(골격)는 요약문의 프레임으로만 준다. 정답의 내용어를 흘리는 골격은 금지.";
  }
  return "";
}

// ── [블록 7] 출력 형식 리터럴 ────────────────────────────────────────────────

function outputFormatBlock(
  s: ResolvedSummaryWritingSettings,
  labels: string[],
  mode: MdExplanationMode,
): string {
  const lines: string[] = [];
  lines.push(
    `요약문: <${labels.join(", ")} 를 각 정확히 1회 포함하는 영어 요약문 한 줄. 빈칸 자리에는 라벨만 두고 정답 어구는 절대 넣지 마라. 밑줄(____)도 넣지 마라.>`,
  );
  if (s.glossEnabled) {
    lines.push("해석: <한국어 한 문장 — 글 전체 의미. 정답 구간 1:1 직역 금지>");
  }
  if (s.wordBankEnabled) {
    lines.push("보기: <칩1 / 칩2 / 칩3 / ...>");
  }
  lines.push("");
  for (const label of labels) {
    lines.push(
      `정답${label}: <이 빈칸에 들어갈 영어 어구(다단어). 요약문에 대입하면 문장이 완성된다>`,
    );
    lines.push(
      `동치${label}: <동치 정답 **하나**(그 빈칸에 그대로 들어가는 완전한 어구). 여러 개면 이 줄을 여러 번 써라. 쉼표로 이어 쓰지 마라 — 영어 어구 안의 쉼표와 구분되지 않는다. 없으면 이 줄 자체를 쓰지 마라>`,
    );
    lines.push(
      `핵심어${label}: <", " 로 이은 핵심 단어 — 한 단어씩, 정답 어구에 등장하는 형태 그대로>`,
    );
  }
  lines.push("");
  lines.push("채점기준:");
  // ⚠ 항목 줄머리가 섹션 키워드면 블록 경계로 읽혀 그 아래가 통째로 날아간다.
  //   경계는 공용 머리표 판정(decoration.ts)이라 **콜론이 없어도** 끊긴다
  //   (`- 정답 어구가 …` 도 경계다). 형식 리터럴에서 미리 막는다.
  lines.push(
    "- <부분점수 항목 — 한국어 한 줄. `의미: 2점` 처럼 항목명을 붙여도 되지만, 줄머리를 `정답`·`해설`·`보기`·`요약문` 같은 섹션 키워드로 시작하지는 마라(콜론이 없어도 그 줄에서 블록이 끊긴다). 항목명은 `의미`·`어순`·`정확성` 처럼 채점 축으로 써라>",
  );
  lines.push(
    mode === "answer-only"
      ? "해설: <딱 2문장 — 요약문이 지문의 어느 논지를 압축하는지, 정답 어구가 왜 그 자리인지. 합니다체>"
      : "해설: <딱 2문장 — 요약문이 지문의 어느 논지를 압축하는지, 정답 어구가 왜 그 자리인지. 합니다체>",
  );
  return lines.join("\n");
}

/**
 * 요약문 영작 md 프롬프트.
 * 출력 계약(parser-summary-writing.ts 와 1:1): `요약문:` + (`해석:`) + (`보기:`) +
 * `정답(X):` / `동치(X):` / `핵심어(X):` + `채점기준:` + `해설:`.
 *
 * ⚠ `모범답안:` `미끼:` `연결틀:` 은 **받지 않는다**(파일 상단 철칙1 검산표 참조).
 */
export function buildMdSummaryWritingPrompt(
  passage: string,
  settings: ResolvedSummaryWritingSettings,
  direction: string,
  mode: MdExplanationMode = "full",
  difficulty: MdDifficulty = "KILLER",
): string {
  const blankCount = clampSummaryWritingMdBlankCount(settings.blankCount);
  const labels = summaryWritingMdLabels(blankCount);

  const headline =
    difficulty === "KILLER"
      ? `아래 지문을 한 문장으로 요약하고, 그 요약문의 핵심 어구 ${blankCount}곳을 비워 학생이 **직접 영작**하게 하는 KILLER 문항 1개를 설계하라. 빈칸 하나하나에 명확한 출제 의도가 박힌 아름다운 킬러 문항이어야 한다.`
      : `아래 지문을 한 문장으로 요약하고, 그 요약문의 핵심 어구 ${blankCount}곳을 비워 학생이 **직접 영작**하게 하는 문항 1개(난이도: ${
          difficulty === "BASIC"
            ? "기본 — 교과서 수준 확인형"
            : "중급 — 모의고사 중위권, 추론 필요"
        })를 설계하라. 빈칸 하나하나에 명확한 출제 의도가 있어야 한다.`;

  const fewshotBlock = difficulty === "BASIC" ? "" : `${SUMMARY_WRITING_FEWSHOT}\n\n`;
  const clueLine = clueBlock(settings);

  return `너는 대한민국 수능·내신 영어 서술형을 20년 출제해 온 최정상 출제위원이다. ${headline}

⚠ 이 문항은 **선지가 없는 서술형**이다. 선지(①②③④⑤)를 만들지 마라. 학생은 빈칸에 영어 어구를 직접 써 넣는다.

${fewshotBlock}## 발문 (이미 확정됨 — 다시 쓰지 마라)
${direction}
- 위 발문은 교사 설정에서 기계가 합성한 문장이다. 네가 만든 요약문·해석·보기는 **이 발문이 약속한 것과 정확히 일치**해야 한다. 발문이 [보기]를 말하는데 보기가 없거나, [해석]을 말하는데 해석이 없으면 학생이 존재하지 않는 상자를 찾는 무효 문항이 된다.

## 요약문 설계 — 여기서 문항의 격이 갈린다
- 요약문은 **글 전체를 한 문장으로 압축**한 것이다. 한 단락·한 사례만 요약하면 실패다.
- 빈칸에는 **판단이 걸린 다단어 어구**가 들어간다. 관사 하나·명사 하나를 비우는 자리는 이 유형의 표적이 아니다.
- 빈칸 밖 텍스트는 학생에게 그대로 보인다. 거기에 정답의 연속 두 단어 이상이 미리 적혀 있으면 문항이 무효다.
- 요약문은 지문 문장의 복사가 아니어야 한다. **정답 어구가 지문에 그대로 있으면** 학생은 영작 대신 지문에서 베껴 쓴다(지문이 문항과 함께 보인다) — 그건 영작 과제의 소멸이다.
${sourceModeBlock(settings)}
${connectorFrameBlock(settings)}
${targetWordsBlock(settings)}${clueLine ? `\n${clueLine}` : ""}

${SUMMARY_WRITING_TARGET_BY_DIFFICULTY[difficulty]}

${glossBlock(settings)}

${wordBankBlock(settings, blankCount)}

${SUMMARY_WRITING_TRAP_TAXONOMY}

${scoringBlock(settings)}

## 마감 — 위반하면 시험 요령으로 뚫린다
- 빈칸은 정확히 ${blankCount}개다. 라벨 ${labels.join(", ")} 를 요약문에 각 **1회씩만** 쓴다.
- 정답 어구는 각 **2단어 이상**이어야 한다. 한 단어 정답은 이 유형이 아니라 어휘 받아쓰기다.
- 두 빈칸의 정답이 같은 어구면 안 된다.
- 정답 어구를 요약문·해석·보기 어디에도 통째로 적지 마라.
- 해설·채점기준은 한국어로만 쓴다(지문·정답 표현 인용만 영어 허용).

## 출력 전 자기검산 (사고 안에서 수행)
- 요약문의 ${labels.join(", ")} 를 각 정답으로 바꿔 넣어 문장을 완성해 보라. 문법이 맞고, 관사·전치사가 중복되지 않고, 문장이 논지를 정확히 말하는가? 어긋나면 정답 어구를 다시 짜라.
- 각 정답의 **내용어를 지문에서 찾아보라**. 연속 6단어 이상이 지문에 그대로 있으면 베껴쓰기 과제다 — 요약문을 상위 층위로 다시 설계하라.
- 정답의 연속 두 단어가 요약문(빈칸 밖)에 이미 적혀 있지 않은지 확인하라.
${
  settings.wordBankEnabled
    ? `- 보기 칩만으로 각 빈칸 정답을 **실제로 조립해 보라**. 필요한 단어가 하나라도 없으면(전치사·관사 포함, 같은 단어 2회 필요 시 칩도 2개) 학생은 정답을 만들 수 없다.
- ${
        settings.wordBankUsage === "useAll"
          ? "조립 후 남는 칩이 하나도 없는지 확인하라(useAll)."
          : settings.wordBankUsage === "usePartial"
            ? `조립 후 남는 칩이 ${summaryWritingDistractorNeed(settings)}개 이상인지 확인하라(미끼). 0개면 반려된다.`
            : "조립에 필요한 칩이 전부 있는지 확인하라."
      }
- 보기를 왼쪽에서 오른쪽으로 읽었을 때 정답 어순이 나오지 않는지 확인하라.`
    : "- 보기 없이도 지문 논지를 잡은 학생이면 도달할 수 있는 어구인지 확인하라."
}
- 각 빈칸의 핵심어가 **한 단어씩**이고 **정답 어구에 그 형태 그대로 들어 있는지** 확인하라.
- 해설이 정확히 2문장인지, 한국어인지 확인하라.

## 출력 형식 (마크다운 — 이 형식 그대로, 다른 말 붙이지 마라)
${outputFormatBlock(settings, labels, mode)}

## 지문
${passage}`;
}
