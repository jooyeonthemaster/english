import {
  type ChoiceLayout,
  type FormatSpec,
  type MarkerStyle,
  CHOICE_ITEM_PATTERN_LABELS,
  CHOICE_LAYOUT_LABELS,
  MARKER_STYLE_LABELS,
  parseFormatSpec,
} from "./format-spec";

// ============================================================================
// 형식 지시 결정 해석기(format-intent) — 자연어 → FormatSpec 변형 (LLM 없음)
// ============================================================================
// 스튜디오 AI 어시스턴트의 형식 편집은 원래 Gemini 1회 호출이 (a) formatChanged=true 로
// 판단하고 (b) 형식 JSON 전체를 다시 뱉어야 반영됐다. Gemini 는 이 둘을 자주 건너뛰고
// "프롬프트만 손봄"으로 빠져 **미리보기가 전혀 안 바뀌는** 사고가 났다(사용자 신고).
//
// 이 모듈은 한국어 형식 명령(서술형 전환, 밑줄/빈칸/선지 개수, 마커 스킴, 배치, 박스 토글,
// 조건 박스, 답란, 배점, 부정형 등)을 **결정적으로** FormatSpec 에 반영한다. 매칭되면 LLM
// 없이 즉시·100% 반영되고, 매칭 안 되는 요청(내용/난이도/본질)만 LLM 편집으로 넘어간다.
// 순수 함수(server-only 아님) — 클라이언트 변경 요약/단위 테스트에서도 재사용한다.

const SHAPE_KO: Record<string, string> = {
  MULTIPLE_CHOICE: "객관식",
  SHORT_ANSWER: "서술형/단답",
  MIXED: "혼합",
};

const KO_NUM: Record<string, number> = {
  하나: 1,
  둘: 2,
  셋: 3,
  넷: 4,
  다섯: 5,
  여섯: 6,
  일곱: 7,
  여덟: 8,
  아홉: 9,
  열: 10,
  한: 1,
  두: 2,
  세: 3,
  네: 4,
};
// 멀티음절을 앞에 둬 부분매칭 방지(정규식 대안 우선순위).
const NUM_WORD = "\\d+|다섯|여섯|일곱|여덟|아홉|하나|둘|셋|넷|열|한|두|세|네";

function toNum(token: string | undefined | null): number | null {
  if (!token) return null;
  const t = token.trim();
  if (/^\d+$/.test(t)) {
    const n = Number.parseInt(t, 10);
    return Number.isFinite(n) ? n : null;
  }
  return KO_NUM[t] ?? null;
}

/** 명사(정규식 소스) 주변의 개수를 찾는다. "빈칸을 2개로"·"2개의 빈칸" 양방향. */
function countFor(text: string, nounPattern: string): number | null {
  const josa = "(?:을|를|은|는|이|가|로|으로|개수|수|만|도)?";
  const tail = "(?:개|군데|곳|줄|칸|단|열|씩)?";
  const re1 = new RegExp(`(?:${nounPattern})\\s*${josa}\\s*(${NUM_WORD})\\s*${tail}`);
  const m1 = text.match(re1);
  if (m1) {
    const n = toNum(m1[1]);
    if (n != null) return n;
  }
  const re2 = new RegExp(`(${NUM_WORD})\\s*(?:개|군데|곳|줄|칸)?\\s*(?:의|짜리)?\\s*(?:${nounPattern})`);
  const m2 = text.match(re2);
  if (m2) {
    const n = toNum(m2[1]);
    if (n != null) return n;
  }
  return null;
}

/** 지시문에서 마커 스킴을 추론(예시 문자/괄호 패턴/한국어 표현). */
function detectMarkerStyle(text: string): MarkerStyle | null {
  if (/[ⓐⓑⓒⓓⓔ]/.test(text)) return "CIRCLED_ALPHA_LOWER";
  if (/[①②③④⑤]/.test(text)) return "CIRCLED_NUM";
  if (/[㉠㉡㉢]/.test(text)) return "CIRCLED_KOREAN";
  if (/\([a-e]\)/.test(text)) return "PAREN_ALPHA_LOWER";
  if (/\([A-E]\)/.test(text)) return "PAREN_ALPHA_UPPER";
  if (/\([1-9]\)/.test(text)) return "PAREN_NUM";
  if (/원형\s*소문자|동그라미\s*(?:알파벳|소문자)/.test(text)) return "CIRCLED_ALPHA_LOWER";
  if (/원형\s*숫자|동그라미\s*숫자/.test(text)) return "CIRCLED_NUM";
  if (/원형\s*한글|동그라미\s*한글/.test(text)) return "CIRCLED_KOREAN";
  if (/괄호\s*소문자|소문자\s*괄호/.test(text)) return "PAREN_ALPHA_LOWER";
  if (/괄호\s*대문자|대문자\s*괄호/.test(text)) return "PAREN_ALPHA_UPPER";
  if (/괄호\s*숫자|숫자\s*괄호/.test(text)) return "PAREN_NUM";
  if (/가나다|가\.\s*나\.\s*다/.test(text)) return "KOREAN_GANADA";
  if (/대문자\s*점|영문\s*대문자/.test(text)) return "ALPHA_UPPER_DOT";
  if (/숫자\s*점|숫자\s*마침표/.test(text)) return "PLAIN_NUM";
  if (/마커\s*(?:없|제거|빼)|기호\s*없|번호\s*없|마커\s*안/.test(text)) return "NONE";
  return null;
}

/** 선지 배치(단/열/한 줄/표) 추론. */
function detectLayout(text: string): ChoiceLayout | null {
  if (/표\s*(?:형태|형식|모양|로|으로)|테이블/.test(text)) return "TABLE";
  if (/3단|세\s*단|3\s*열|삼단/.test(text)) return "THREE_COLUMN";
  if (/2단|두\s*단|2\s*열|이단/.test(text)) return "TWO_COLUMN";
  if (/한\s*줄|가로\s*(?:로|나열)|인라인|일렬/.test(text)) return "INLINE";
  if (/세로|1열|1단|한\s*열/.test(text)) return "VERTICAL";
  return null;
}

/** 여러 키워드 중 가장 뒤(=의도에 가까움)에 나온 위치. */
function lastIdx(text: string, words: string[]): number {
  let idx = -1;
  for (const w of words) {
    const i = text.lastIndexOf(w);
    if (i > idx) idx = i;
  }
  return idx;
}

const REMOVE_VERB = /(없애|없게|없도록|지워|지우|빼|빼줘|제거|삭제|숨겨|숨김|치워)/;
const ADD_VERB = /(추가|넣어|넣줘|넣|더해|더하|만들|씌워|쳐줘|둘러|두르|매겨|매기|붙여|붙이)/;

function cloneFormat(format: FormatSpec): FormatSpec {
  return JSON.parse(JSON.stringify(format)) as FormatSpec;
}

function makeSubjective(f: FormatSpec): void {
  f.answer.shape = "SHORT_ANSWER";
  f.choices.present = false;
  // 미리보기가 비지 않도록 최소 답 작성 공간을 둔다(원본이 0인 경우만).
  if (f.answer.subjective.answerLineCount === 0 && f.answer.subjective.answerBlankCount === 0) {
    f.answer.subjective.answerLineCount = 2;
  }
}

function makeObjective(f: FormatSpec): void {
  f.answer.shape = "MULTIPLE_CHOICE";
  f.choices.present = true;
  if (f.choices.count <= 0) f.choices.count = 5;
}

export interface FormatIntentResult {
  format: FormatSpec;
  changes: string[];
}

/**
 * 자연어 형식 지시를 결정적으로 FormatSpec 에 반영한다.
 * 매칭되는 형식 명령이 없거나 실제 변화가 없으면 null(→ 내용 편집 LLM 으로 폴백).
 */
export function interpretFormatInstruction(
  current: FormatSpec,
  instruction: string,
): FormatIntentResult | null {
  const text = instruction.trim();
  if (!text) return null;

  const f = cloneFormat(current);
  let matched = false;

  const mentionsChoice = /(선지|선택지|답지|보기지)/.test(text);
  const stimulusScope = /(지문|자료|본문|글|문장)/.test(text);
  const remove = REMOVE_VERB.test(text);
  const add = ADD_VERB.test(text);

  // ── A. 답형(서술형 ↔ 객관식) — 상호배타, 뒤에 언급된 쪽 우선 ──
  const mcIdx = lastIdx(text, ["객관식", "선택형", "선다", "오지선다", "사지선다"]);
  const subIdx = lastIdx(text, ["서술형", "주관식", "단답", "논술", "약술", "서술"]);
  if (mcIdx >= 0 || subIdx >= 0) {
    if (mcIdx >= subIdx) makeObjective(f);
    else makeSubjective(f);
    matched = true;
  }

  // ── B. 선지 마커 스킴 / 밑줄 라벨 스킴 ──
  // 핵심: 지시문에 든 마커 문자(ⓔ 등)가 "이 스킴으로 바꿔줘"인지 "이것들을 지워줘"의 대상인지
  // 구분한다. 제거 의도(지워/없애)면 스킴 변경으로 오해하지 않는다(예: "지문에서 ⓔ 다 지워줘"가
  // 선지 마커를 ⓐⓑⓒ 로 바꾸던 버그 방지). NONE 스킴은 명시적 "마커 없애" 일 때만.
  const style = detectMarkerStyle(text);
  if (style) {
    const wantsStyleChange =
      style === "NONE"
        ? /(마커|기호|번호|라벨)\s*(?:없|제거|빼|안)/.test(text)
        : !remove &&
          (mentionsChoice ||
            /(선지|마커|스킴|라벨|기호|밑줄).*(?:로|으로|바꿔|바꾸|변경)/.test(text));
    if (wantsStyleChange) {
      const aboutUnderlineLabel = /(밑줄|라벨)/.test(text) && !mentionsChoice && stimulusScope;
      if (aboutUnderlineLabel) {
        f.stimulus.underlineMarks.labelStyle = style;
      } else {
        f.choices.markerStyle = style;
      }
      matched = true;
    }
  }

  // ── C. 선지 배치 ──
  if (mentionsChoice || /(배치|단으로|단\s|열로|나열|가로|세로|표\s*형)/.test(text)) {
    const layout = detectLayout(text);
    if (layout) {
      f.choices.layout = layout;
      matched = true;
    }
  }

  // ── D. 선지 개수 ──
  const choiceCount = countFor(text, "선지|선택지|답지");
  if (choiceCount != null && choiceCount >= 2 && choiceCount <= 12) {
    f.choices.count = choiceCount;
    if (f.answer.shape !== "SHORT_ANSWER") f.choices.present = true;
    matched = true;
  }

  // ── E. 선지 제거(= 서술형 전환) ──
  if (/(선지|선택지|답지).{0,8}(없애|지워|빼|제거|삭제|없게|없도록)/.test(text)) {
    makeSubjective(f);
    matched = true;
  }

  // ── F. 지문 밑줄/기호 마커(ⓐ~ⓔ 류) ──
  const hasMarkerWord =
    /(밑줄|어법\s*기호|기호|마커|마크|표시|동그라미)/.test(text) || /[ⓐ-ⓩ①-⑮㉠-㉣]/.test(text);
  if (!mentionsChoice && hasMarkerWord) {
    if (remove && (stimulusScope || /[ⓐ-ⓩ①-⑮]/.test(text))) {
      f.stimulus.underlineMarks.count = 0;
      matched = true;
    } else {
      const ulCount = countFor(text, "밑줄|기호|마커");
      if (ulCount != null) {
        f.stimulus.underlineMarks.count = ulCount;
        matched = true;
      }
    }
  }

  // ── G. 지문 빈칸 ──
  if (/빈칸/.test(text)) {
    if (remove && /빈칸.{0,8}(없애|지워|빼|제거|삭제|없게)/.test(text)) {
      f.stimulus.blanks.count = 0;
      matched = true;
    } else {
      const bc = countFor(text, "빈칸");
      if (bc != null) {
        f.stimulus.blanks.count = bc;
        matched = true;
      } else if (add) {
        f.stimulus.blanks.count = Math.min(10, f.stimulus.blanks.count + 1);
        matched = true;
      }
    }
  }

  // ── H. 지문 박스 테두리 ──
  const aboutAuxBox = /(조건|보기|주어진|어휘|요약)/.test(text);
  if (/(테두리|외곽선)/.test(text) || (/(박스|상자|네모|틀)/.test(text) && !aboutAuxBox)) {
    if (remove) {
      f.stimulus.boxed = false;
      matched = true;
    } else if (add || /(씌워|쳐|둘러|두르|넣)/.test(text)) {
      f.stimulus.boxed = true;
      matched = true;
    }
  }

  // ── I. 조건 박스 ──
  if (/조건/.test(text)) {
    if (remove && /조건.{0,8}(없애|지워|빼|제거|삭제)/.test(text)) {
      f.boxes = f.boxes.filter((b) => b.kind !== "CONDITIONS");
      f.answer.subjective.conditionsCount = 0;
      matched = true;
    } else if (add || countFor(text, "조건") != null) {
      const cc = countFor(text, "조건") ?? 2;
      const existing = f.boxes.find((b) => b.kind === "CONDITIONS");
      if (existing) {
        existing.itemCount = cc;
        existing.ordered = true;
      } else {
        f.boxes.push({
          kind: "CONDITIONS",
          label: "조건",
          ordered: true,
          itemCount: cc,
          columnHeaders: [],
          notes: "",
        });
      }
      if (f.answer.shape !== "MULTIPLE_CHOICE") f.answer.subjective.conditionsCount = cc;
      matched = true;
    }
  }

  // ── J. 서술형 답란(괘선) / 답 슬롯 ──
  const lineCount =
    countFor(text, "답란|괘선|답안\\s*줄|답\\s*줄") ??
    (/(답란|괘선|답안\s*줄|답\s*줄)/.test(text) ? countFor(text, "줄") : null);
  if (lineCount != null) {
    f.answer.subjective.answerLineCount = Math.min(12, lineCount);
    matched = true;
  }
  const slotCount = countFor(text, "답\\s*슬롯|답칸|답\\s*빈칸|답\\s*칸");
  if (slotCount != null) {
    f.answer.subjective.answerBlankCount = Math.min(10, slotCount);
    matched = true;
  }

  // ── K. 배점 ──
  if (/배점|점수|점\b/.test(text) || /\d+(?:\.\d+)?\s*점/.test(text)) {
    if (remove && /(배점|점수|점)/.test(text)) {
      f.stem.pointsVisible = false;
      matched = true;
    } else {
      const m = text.match(/(\d+(?:\.\d+)?)\s*점/);
      if (m) {
        f.stem.points = Number.parseFloat(m[1]);
        f.stem.pointsVisible = true;
        matched = true;
      } else if (/배점.{0,4}(표시|보이|넣)/.test(text)) {
        f.stem.pointsVisible = true;
        matched = true;
      }
    }
  }

  // ── L. 부정형 발문 ──
  if (/(부정형|틀린\s*것|않은\s*것|아닌\s*것|적절하지\s*않|옳지\s*않)/.test(text)) {
    f.stem.negativeForm = true;
    matched = true;
  } else if (/(긍정형|옳은\s*것|맞는\s*것|적절한\s*것).{0,6}(으로|로|바꿔|해)/.test(text)) {
    f.stem.negativeForm = false;
    matched = true;
  }

  // ── M. 문장 번호(①~⑤ 문장 앞 번호) ──
  if (/(문장\s*번호|문장\s*앞.{0,3}번호|번호\s*(?:매겨|매기|붙여|붙이))/.test(text)) {
    if (remove) f.stimulus.numberedSentences.present = false;
    else f.stimulus.numberedSentences.present = true;
    matched = true;
  }

  if (!matched) return null;

  const next = parseFormatSpec(f);
  const changes = describeFormatDelta(current, next);
  if (changes.length === 0) return null; // 실효 변화 없음 → 내용 편집으로
  return { format: next, changes };
}

/** 이전/이후 FormatSpec 의 모든 시각 필드 차이를 한국어 요약 불릿으로. */
export function describeFormatDelta(prev: FormatSpec, next: FormatSpec): string[] {
  const out: string[] = [];
  const ms = (s: MarkerStyle) => MARKER_STYLE_LABELS[s];

  if (prev.answer.shape !== next.answer.shape) {
    out.push(`답형 ${SHAPE_KO[prev.answer.shape] ?? prev.answer.shape}→${SHAPE_KO[next.answer.shape] ?? next.answer.shape}`);
  }
  if (prev.choices.present !== next.choices.present) {
    out.push(next.choices.present ? "선지 추가" : "선지 제거");
  }
  if (prev.choices.count !== next.choices.count) {
    out.push(`선지 수 ${prev.choices.count}→${next.choices.count}개`);
  }
  if (prev.choices.markerStyle !== next.choices.markerStyle) {
    out.push(`선지 마커 ${ms(prev.choices.markerStyle)}→${ms(next.choices.markerStyle)}`);
  }
  if (prev.choices.layout !== next.choices.layout) {
    out.push(`선지 배치 ${CHOICE_LAYOUT_LABELS[prev.choices.layout]}→${CHOICE_LAYOUT_LABELS[next.choices.layout]}`);
  }
  if (prev.choices.itemPattern !== next.choices.itemPattern) {
    out.push(
      `선지 구조 ${CHOICE_ITEM_PATTERN_LABELS[prev.choices.itemPattern]}→${CHOICE_ITEM_PATTERN_LABELS[next.choices.itemPattern]}`,
    );
  }
  if (prev.stimulus.boxed !== next.stimulus.boxed) {
    out.push(next.stimulus.boxed ? "지문 박스 테두리 추가" : "지문 박스 테두리 제거");
  }
  if (prev.stimulus.titleLine !== next.stimulus.titleLine) {
    out.push(next.stimulus.titleLine ? "자료 제목 줄 추가" : "자료 제목 줄 제거");
  }
  if (prev.stimulus.underlineMarks.count !== next.stimulus.underlineMarks.count) {
    out.push(`지문 밑줄/기호 ${prev.stimulus.underlineMarks.count}→${next.stimulus.underlineMarks.count}개`);
  }
  if (prev.stimulus.underlineMarks.labelStyle !== next.stimulus.underlineMarks.labelStyle) {
    out.push(`밑줄 라벨 ${ms(prev.stimulus.underlineMarks.labelStyle)}→${ms(next.stimulus.underlineMarks.labelStyle)}`);
  }
  if (prev.stimulus.blanks.count !== next.stimulus.blanks.count) {
    out.push(`지문 빈칸 ${prev.stimulus.blanks.count}→${next.stimulus.blanks.count}개`);
  }
  if (prev.stimulus.blanks.renderStyle !== next.stimulus.blanks.renderStyle) {
    out.push("빈칸 표기 변경");
  }
  if (prev.stimulus.numberedSentences.present !== next.stimulus.numberedSentences.present) {
    out.push(next.stimulus.numberedSentences.present ? "문장 번호 추가" : "문장 번호 제거");
  }
  if (prev.stimulus.paragraphLabels.count !== next.stimulus.paragraphLabels.count) {
    out.push(`분할 단락 ${prev.stimulus.paragraphLabels.count}→${next.stimulus.paragraphLabels.count}개`);
  }
  if (prev.boxes.length !== next.boxes.length) {
    out.push(`박스 ${prev.boxes.length}→${next.boxes.length}개`);
  } else {
    const pk = prev.boxes.map((b) => b.kind).join(",");
    const nk = next.boxes.map((b) => b.kind).join(",");
    if (pk !== nk) out.push("박스 구성 변경");
  }
  if (prev.answer.correctCount !== next.answer.correctCount) {
    out.push(`정답 수 ${prev.answer.correctCount}→${next.answer.correctCount}개`);
  }
  if (prev.answer.subjective.answerLineCount !== next.answer.subjective.answerLineCount) {
    out.push(`답란 ${prev.answer.subjective.answerLineCount}→${next.answer.subjective.answerLineCount}줄`);
  }
  if (prev.answer.subjective.answerBlankCount !== next.answer.subjective.answerBlankCount) {
    out.push(`답 슬롯 ${prev.answer.subjective.answerBlankCount}→${next.answer.subjective.answerBlankCount}개`);
  }
  if (prev.answer.subjective.conditionsCount !== next.answer.subjective.conditionsCount) {
    out.push(`조건 ${prev.answer.subjective.conditionsCount}→${next.answer.subjective.conditionsCount}개`);
  }
  if (prev.stem.negativeForm !== next.stem.negativeForm) {
    out.push(next.stem.negativeForm ? "부정형 발문" : "긍정형 발문");
  }
  if (prev.stem.pointsVisible !== next.stem.pointsVisible || prev.stem.points !== next.stem.points) {
    out.push(
      next.stem.pointsVisible && next.stem.points != null ? `배점 ${next.stem.points}점 표시` : "배점 숨김",
    );
  }
  return out;
}
