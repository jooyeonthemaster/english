import * as React from "react";
import { getCircledNumber } from "@/lib/question-postprocess/types";
import { splitSentenceInsertGivenBlock } from "./option-display";
import { collapseBodyParagraphsForDisplay } from "./text-normalization";

// 문항 생성·판정·그룹화의 순수 로직은 JSX 없는 모듈로 옮겼다(26-09-30 CORE-MODEL — 서버 HWPX·DOCX 도
// 같은 함수를 쓴다). 기존 import 경로를 깨지 않도록 여기서 그대로 다시 내보낸다. 이 파일에는 JSX 렌더
// 헬퍼(renderFormattedInline 등)만 남는다.
export {
  clampNumber,
  clonePaperItem,
  countWords,
  formatDateInput,
  isSetMemberItem,
  isSourcePassageForcedForItem,
  makeCustomPaperBlock,
  makeLocalId,
  makePaperItem,
  parseJSON,
  parseOptions,
  parseTags,
  questionPreview,
  reindexItems,
  resolvePaperItemPassageTitle,
  shouldRenderSourcePassageForItem,
} from "./paper-item-model";
export { buildGroups } from "./paper-item-groups";

type FormattedInlineOptions = {
  alphabetMarkerClassName?: string;
};

function alphabetMarkerClassNameForSubtype(
  subType: string | null | undefined,
  options?: FormattedInlineOptions,
) {
  if (options?.alphabetMarkerClassName) return options.alphabetMarkerClassName;
  return subType === "SENTENCE_ORDER" ? "font-bold text-black" : "font-bold text-blue-700";
}

function letterMarkerIndex(letter: string) {
  const index = letter.toUpperCase().charCodeAt(0) - 65;
  return index >= 0 && index < 26 ? index : null;
}

function circledLetterMarkerIndex(marker: string) {
  const codePoint = marker.codePointAt(0);
  if (codePoint === undefined || codePoint < 0x24D0 || codePoint > 0x24E9) {
    return null;
  }
  return codePoint - 0x24D0;
}

function inlineMarkerDisplay(
  marker: string,
  subType: string | null | undefined,
) {
  if (subType !== "IRRELEVANT") return marker;
  const markerIndex = circledLetterMarkerIndex(marker);
  return markerIndex === null ? marker : getCircledNumber(markerIndex);
}

function parenthesizedMarkerDisplay(
  letter: string,
  subType: string | null | undefined,
) {
  const markerIndex = letterMarkerIndex(letter);
  if (
    (subType === "IRRELEVANT" || subType === "SENTENCE_INSERT" || subType === "VOCAB_CHOICE") &&
    markerIndex !== null
  ) {
    return getCircledNumber(markerIndex);
  }
  // 원문 대소문자 보존 — 강제 대문자화는 **장문 세트(§12)의 (a)~(e) 를 (A)~(E) 로 바꿔** 인쇄본과
  // 어긋나게 한다(26-09-08 감독 육안: 2026 수능 41-42 공유 지문이 「(A) inevitable」로 렌더). 기존
  // 대문자 데이터((A)~(J) 어법·보기 참조)는 그대로 대문자로 나오므로 무회귀 — 소문자 라벨은
  // VOCAB_CHOICE(원문자 분기) 와 세트 멤버뿐이고, 후자는 소문자가 정본이다.
  return `(${letter})`;
}

/**
 * 원문자 마커(①·`__② word__`·`__(a) word__`)와 바로 뒤 단어 사이의 공백. 일반 공백이면 줄 끝에서
 * 「② / helps」 처럼 마커와 단어가 갈라진다(기출 문항 은행 조판 실측, 어법·어휘·무관·삽입 전 문항 확률 재발).
 * nbsp 로 묶어 한 줄에 두되 단어 자체는 그대로 개행 가능하게 둔다(래퍼 nowrap 금지 — 문장 길이 밑줄이
 * 칸을 넘친다). 텍스트 길이는 그대로라 페이지네이션 줄 수 추정(pagination-metrics wrapParagraph 의
 * 마커+다음 단어 묶음 판정)과 동기. 편집 직렬화(editable-text serializeEditableDom → normalizeEditableText)가
 * \u00A0 를 공백으로 되돌리므로 저장 텍스트엔 새지 않는다.
 */
const MARKER_WORD_JOINER = "\u00A0";

export function renderFormattedInline(
  text: string,
  subType?: string | null,
  options?: FormattedInlineOptions,
) {
  const parts: React.ReactNode[] = [];
  // standalone \uAD04\uD638\uBB38\uC790 \uB9C8\uCEE4: (A)~(J) (\uAC10\uC2FC __(A)..__ \uACBD\uB85C\uC758 [a-jA-J] \uC640 \uB3D9\uC77C \uBC94\uC704\uB85C
  // \uB9DE\uCDA4 \u2014 6~10\uC9C0\uC120\uB2E4 \uBCF4\uAE30 \uCC38\uC870 (F)(G).. \uAC00 A~E\uB9CC \uD30C\uB791\uC774\uACE0 \uB098\uBA38\uC9C4 \uAC80\uC815\uC774\uB358 \uBB38\uC81C \uC218\uC815).
  // \u3260-\u326D: \uD55C\uAE00 \uC6D0\uBB38\uC790 \u3260~\u326D(KO \uB9C8\uD0B9\uC9C0\uBB38 \uB77C\uBCA8) \u2014 \uCE74\uB4DC \uB80C\uB354\uB7EC(KO_INLINE_RE)\uC640
  // \uB3D9\uC77C\uD558\uAC8C \uD30C\uB780 \uBCFC\uB4DC \uAC15\uC870. [EN-REG-5] \uB2E8, KO \uAC8C\uC774\uD2B8\uB85C 2\uBC8C \uBD84\uAE30: \uC601\uC5B4 \uC720\uD615
  // (subType \uBA85\uC2DC)\uC758 \uD55C\uAD6D\uC5B4 \uD14D\uC2A4\uD2B8([\uC870\uAC74] '\u3260 \u2026' \uC5F4\uAC70 \uB4F1)\uC5D0\uC11C \u3260 \uC774 \uD30C\uB780 \uB9C8\uCEE4\uB85C
  // \uBC14\uB00C\uC9C0 \uC54A\uAC8C KO_* \uC720\uD615\uC5D0\uC11C\uB9CC \uD655\uC7A5 \uD328\uD134\uC744 \uC4F4\uB2E4. subType \uC774 \uC5C6\uB294 \uD638\uCD9C(KO \uC138\uD2B8
  // \uACF5\uC720\uC9C0\uBB38 \uBC15\uC2A4 \uB4F1 \uADF8\uB8F9 \uC9C0\uBB38 fragment)\uC740 \uD655\uC7A5 \uD328\uD134 \uC720\uC9C0 \u2014 KO \uBCD1\uD569\uB9C8\uCEE4\uAC00 \uAE68\uC9C0\uC9C0
  // \uC54A\uACE0, \uC601\uC5B4 \uC9C0\uBB38 \uBCF8\uBB38\uC5D0\uB294 \u3260 \uC774 \uB4F1\uC7A5\uD558\uC9C0 \uC54A\uC544 \uBB34\uD68C\uADC0.
  const koMarkerEligible = subType == null || subType.startsWith("KO_");
  const pattern = koMarkerEligible
    ? /__([^_]+)__|_{3,}|([\u2460-\u2473\u3251-\u325F\u32B1-\u32BF\u24D0-\u24E9\u3260-\u326D])|\(([a-jA-J])\)|(\[[^\]]+\])/g
    : /__([^_]+)__|_{3,}|([\u2460-\u2473\u3251-\u325F\u32B1-\u32BF\u24D0-\u24E9])|\(([a-jA-J])\)|(\[[^\]]+\])/g;
  const alphabetMarkerClassName = alphabetMarkerClassNameForSubtype(subType, options);
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  // 직전 조각이 단독 원문자 마커(match[2] — 삽입 위치 ①·무관 「① __문장__」)였으면 다음 평문 조각의
  // 머리 공백 1개를 nbsp 로 바꿔 마커와 다음 단어를 한 줄에 묶는다. 다른 조각이 끼면 해제.
  let joinAfterMarker = false;
  const pushPlain = (slice: string) => {
    const glued =
      joinAfterMarker && slice.startsWith(" ") ? MARKER_WORD_JOINER + slice.slice(1) : slice;
    joinAfterMarker = false;
    parts.push(<span key={key++}>{glued}</span>);
  };

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      pushPlain(text.slice(lastIndex, match.index));
    }
    joinAfterMarker = false;
    if (match[1]) {
      const circledMarkerMatch = match[1].match(
        koMarkerEligible
          ? /^([\u2460-\u2473\u3251-\u325F\u32B1-\u32BF\u24D0-\u24E9\u3260-\u326D])\s*(.+)$/
          : /^([\u2460-\u2473\u3251-\u325F\u32B1-\u32BF\u24D0-\u24E9])\s*(.+)$/,
      );
      if (circledMarkerMatch) {
        parts.push(
          <span key={key++} data-mark="u" data-raw={`__${match[1]}__`}>
            <span className="font-bold text-blue-700">
              {inlineMarkerDisplay(circledMarkerMatch[1], subType)}
            </span>
            {MARKER_WORD_JOINER}
            <span className="font-semibold underline decoration-blue-500 underline-offset-4">
              {circledMarkerMatch[2]}
            </span>
          </span>,
        );
        lastIndex = pattern.lastIndex;
        continue;
      }
      const markerMatch = match[1].match(/^\(([a-jA-J])\)\s*(.+)$/);
      if (markerMatch) {
        parts.push(
          <span key={key++} data-mark="u" data-raw={`__${match[1]}__`}>
            <span className="font-bold text-blue-700">
              {parenthesizedMarkerDisplay(markerMatch[1], subType)}
            </span>
            {MARKER_WORD_JOINER}
            <span className="font-semibold underline decoration-blue-500 underline-offset-4">
              {markerMatch[2]}
            </span>
          </span>,
        );
      } else {
        parts.push(
          <span key={key++} data-mark="u" className="font-semibold underline decoration-blue-500 underline-offset-4">
            {match[1]}
          </span>,
        );
      }
    } else if (match[2]) {
      parts.push(
        <span key={key++} className="mx-0.5 font-bold text-blue-700">
          {inlineMarkerDisplay(match[2], subType)}
        </span>,
      );
      joinAfterMarker = true;
    } else if (match[3]) {
      // 평문 소문자 라벨 "(a)~(e)" 는 마커가 아니라 **글자 그대로**다(§12.1-2). 장문 세트의 발문
      //   「밑줄 친 (a)~(e) 중에서 …」·선지 「① (a) ② (b) …」·공유 지문이 전부 여기 해당한다.
      // 호출부 옵션이 아니라 전역 규칙인 이유: 발문·선지·지문이 서로 다른 렌더 지점 6곳에서 그려져
      //   옵션을 하나만 빠뜨려도 같은 문항 안에서 (a) 와 (A) 가 섞인다(26-09-08 감독 육안: 44번 발문만
      //   「(A) ~ (E)」 파란 볼드). 실측 무회귀 — 은행 3,076+1,119 중 평문 소문자 라벨은 REFERENCE 490 ·
      //   VOCAB_CHOICE 110 이고 전부 세트 멤버다(대문자 (A)~(J) 보기 참조는 아래 기존 경로 유지).
      if (/^[a-j]$/.test(match[3])) {
        parts.push(<span key={key++}>{`(${match[3]})`}</span>);
        lastIndex = pattern.lastIndex;
        continue;
      }
      // 「(A)」 라벨 바로 뒤에 빈칸선(___)이 오면 한 덩어리(nowrap)로 — 줄 끝에서 라벨만 남고 빈칸이 다음 줄로
      // 떨어지던 것(요약문·(A)(B) 빈칸, 전수 렌더 검수 실측 22건) 방지. 빈칸 조각을 여기서 함께 소비한다.
      const blankAhead = text.slice(pattern.lastIndex).match(/^\s*(_{3,})/);
      if (blankAhead) {
        parts.push(
          <span key={key++} className="whitespace-nowrap">
            <span className={`mx-0.5 ${alphabetMarkerClassName}`}>{parenthesizedMarkerDisplay(match[3], subType)}</span>
            <span
              data-mark="blank"
              data-raw={blankAhead[1]}
              contentEditable={false}
              className="mx-1 inline-block min-w-[4.5em] border-b border-slate-500 align-baseline"
            >
              &nbsp;
            </span>
          </span>,
        );
        pattern.lastIndex += blankAhead[0].length;
        lastIndex = pattern.lastIndex;
        continue;
      }
      parts.push(
        // 스탠드얼론 괄호알파벳 마커도 원형숫자 마커(match[2])와 동일하게 좌우여백 통일.
        <span key={key++} className={`mx-0.5 ${alphabetMarkerClassName}`}>
          {parenthesizedMarkerDisplay(match[3], subType)}
        </span>,
      );
    } else if (match[4]) {
      // 네모 어법(GRAMMAR_CHOICE_COMBO) 후보 [좌 / 우]는 파랑으로(다른 어법 마커와 색 통일).
      // 그 외 유형의 [조건]/[요약문] 등 대괄호는 평문 유지.
      parts.push(
        subType === "GRAMMAR_CHOICE_COMBO" ? (
          <span key={key++} className="font-semibold text-blue-700">
            {match[4]}
          </span>
        ) : (
          <span key={key++}>{match[4]}</span>
        ),
      );
    } else {
      parts.push(
        <span
          key={key++}
          data-mark="blank"
          data-raw={match[0]}
          contentEditable={false}
          // 빈칸 최소폭은 활자 상대(4.5em) — 고정 56px 는 좁은 단·축소 표면에서 쪼갤 수 없는
          // 원자 토큰이 되어 justify 단어 간격 팽창의 증폭기였다(26-08-26 전수조사 WS-1).
          className="mx-1 inline-block min-w-[4.5em] border-b border-slate-500 align-baseline"
        >
          &nbsp;
        </span>,
      );
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) pushPlain(text.slice(lastIndex));
  return parts.length > 0 ? parts : text;
}

function normalizeSummaryCompletionQuestionText(
  text: string,
  subType: string | null | undefined,
) {
  // \uC694\uC57D\uBB38 \uC601\uC791(SUMMARY_WRITING): questionText \uC5D0\uB294 [\uD574\uC11D]/[\uC694\uC57D\uBB38]/[\uBCF4\uAE30]/[\uC55E\uAE00\uC790]\uB9CC
  // \uB4E4\uC5B4\uC788\uACE0 \uC815\uB2F5\uACC4\uC5F4([\uBE48\uCE78 \uC815\uB2F5]/modelAnswer \uB4F1)\uC740 \uC560\uCD08\uC5D0 \uC9C1\uB82C\uD654\uB418\uC9C0 \uC54A\uB294\uB2E4.
  // \uB530\uB77C\uC11C \uC815\uB2F5 \uC81C\uAC70\uAC00 \uBD88\uD544\uC694\uD558\uBA70, \uD559\uC0DD\uB178\uCD9C \uB9C8\uCEE4\uB97C \uADF8\uB300\uB85C \uBCF4\uC874\uD55C\uB2E4.
  if (subType === "SUMMARY_WRITING") return text;

  // 주제문 영작(TOPIC_SENTENCE_WRITING): questionText 에는 [주제 힌트]/[주제문]/[보기]/[배열 단어]만
  // 들어있고 정답계열(modelAnswer/blanks[].answer 등)은 애초에 직렬화되지 않는다.
  // 따라서 정답 제거가 불필요하며, 학생노출 마커를 그대로 보존한다(SUMMARY_WRITING 미러).
  if (subType === "TOPIC_SENTENCE_WRITING") return text;

  if (subType !== "SUMMARY_COMPLETE_MC") return text;

  return text
    .replace(/\n{0,2}\[(?:\uBE48\uCE78\s*\uC815\uB2F5|blank answers)\][\s\S]*$/i, "")
    .replace(/^\[(?:\uC694\uC57D\uBB38|summary)\]\s*/gim, "\u2193\n");
}

// 리스트/라벨/불릿으로 시작하는 줄(하드 개행 유지 대상): [조건]/[영작할 우리말] 같은 라벨,
// "1." "2)" 번호 항목, (A)~(E) 라벨, 원형숫자, 불릿. 이런 줄은 앞줄과 공백으로 이으면
// 뭉개지므로 줄바꿈을 유지한다.
const HARD_BREAK_LINE_RE =
  /^(\[[^\]]+\]|\(?[A-Ea-e]\)|[①-⑳㉑-㉟㊱-㊿]|\d+[.)]|[-*•]\s+)/;

export function joinRenderedLinesForDisplay(
  lines: string[],
  opts?: {
    keepListBreaks?: boolean;
    /**
     * lines[i] 가 원문(\n 경계) 행의 첫 랩행인지(StructRow.isSourceLineStart, lines 와
     * 같은 인덱스). 전달되면 리스트/라벨 판정(HARD_BREAK_LINE_RE)을 원문 행 머리에만
     * 적용한다 — 긴 프로즈가 래핑되다 우연히 "(A)"/"3.5" 등으로 시작하게 된 이어짐
     * 행이 문장 중간 강제 개행으로 오탐되는 것을 구조적으로 차단(래핑 오탐 0).
     */
    sourceLineStarts?: ReadonlyArray<boolean | undefined>;
  },
) {
  // keepListBreaks: 프로즈는 공백으로 잇되, 리스트/라벨 줄과 문단 경계(빈 줄)는 개행을
  // 유지한다([조건] 번호 목록이 한 줄로 뭉개지던 렌더 버그 수정). 부모가 whitespace-pre-line
  // 이라 \n 이 실제 줄바꿈으로 그려진다. 지문(passage)은 기존 "통짜 단일 흐름"을 유지한다.
  if (opts?.keepListBreaks) {
    let result = "";
    let prevBlank = false;
    for (let i = 0; i < lines.length; i += 1) {
      const trimmed = lines[i].trim();
      if (!trimmed) {
        prevBlank = true;
        continue;
      }
      // 플래그가 명시적으로 false(래핑 이어짐 행)면 리스트 판정 자체를 건너뛰고
      // 무조건 공백 연결. undefined(플래그 미전달 레거시 경로)는 종전 휴리스틱 유지.
      const atSourceLineStart = opts.sourceLineStarts
        ? opts.sourceLineStarts[i] !== false
        : true;
      if (result === "") {
        result = trimmed;
      } else if (prevBlank) {
        result += `\n\n${trimmed}`;
      } else if (
        (atSourceLineStart && HARD_BREAK_LINE_RE.test(trimmed)) ||
        // 각주 줄("* word: 뜻")은 원문 행 판정과 무관하게 항상 별도 줄(지문 박스 각주 인쇄 관행)
        PASSAGE_FOOTNOTE_PARAGRAPH_RE.test(trimmed)
      ) {
        result += `\n${trimmed}`;
      } else {
        result += ` ${trimmed}`;
      }
      prevBlank = false;
    }
    return result.replace(/[ \t]{2,}/g, " ").trim();
  }

  const paragraphs: string[] = [];
  let currentParagraph: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      if (currentParagraph.length > 0) {
        paragraphs.push(currentParagraph.join(" "));
        currentParagraph = [];
      }
      continue;
    }

    // 각주 줄("* word: 뜻")은 빈 줄이 없어도 새 단락으로 — 아래 reduce 가 `\n` 으로 이어 별도 줄에 인쇄한다
    // (지문 박스는 normalizePassageText 가 각주를 `\n` 하나로 붙이므로 빈 줄 경계가 없다).
    if (PASSAGE_FOOTNOTE_PARAGRAPH_RE.test(trimmed) && currentParagraph.length > 0) {
      paragraphs.push(currentParagraph.join(" "));
      currentParagraph = [];
    }
    currentParagraph.push(trimmed);
  }

  if (currentParagraph.length > 0) {
    paragraphs.push(currentParagraph.join(" "));
  }

  // 전부 통짜: 단락을 빈 줄(\n\n)이 아닌 공백으로 이어 단일 흐름으로(유형 간 통일).
  // 예외 — 각주 단락("* word: 뜻")은 별도 줄(칸/쪽 경계에서 쪼개진 본문 조각도 통짜 경로와 같은 모양이어야 한다).
  return paragraphs
    .reduce((acc, p) => (acc === "" ? p : acc + (PASSAGE_FOOTNOTE_PARAGRAPH_RE.test(p) ? "\n" : " ") + p), "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

// 지문 단락을 단일 흐름(통짜)으로 — 임베드/박스 유형 간 "문단 분리 vs 통짜" 불일치 해소.
// 수능 지문 관례(단일 문단 흐름)에 맞춤. (given-block 분리 후 적용해 경계 탐색은 보존.)
// 각주 블록("* consensus: 합의 ** aesthetic: 미학의")만은 인쇄 관행대로 본문 아래 별도 줄에 두고,
// 그 밖의 빈 줄은 공백으로 접는다. 규칙 정본은 text-normalization.collapseBodyParagraphsForDisplay —
// 페이지네이션 추정(questionBodyToLines)이 같은 함수를 써야 「추정에만 있는 빈 줄」이 생기지 않는다.
const collapsePassageParagraphs = collapseBodyParagraphsForDisplay;

/** 지문 각주 블록 머리(paper-builder/text-normalization 의 규칙과 동일) */
const PASSAGE_FOOTNOTE_PARAGRAPH_RE = /^[*＊]\s*[A-Za-z]/;

/**
 * 칸/쪽 경계에서 쪼개진 본문 조각의 밑줄 마커(`__…__`) 짝 맞추기.
 * 무관한 문장(① __문장__)처럼 밑줄이 문장 길이라 경계를 넘어가면, 조각 안의 `__` 개수가 홀수가 되어
 * renderFormattedInline 의 `__([^_]+)__` 가 잡지 못하고 원시 `__` 가 그대로 찍힌다(기출 문항 은행 조판 실측).
 * 시작 조각이면 끝에, 이어짐 조각이면 앞에 `__` 를 보충한다. 빈칸(`___` 이상)은 세지 않는다.
 * 조각 전체가 한 밑줄 안에 들어가 마커가 0개인 경우(짝수)는 판별 불가라 그대로 둔다.
 */
export function balanceUnderlineMarkersForFragment(text: string, startsAtBeginning: boolean): string {
  // 정확히 두 글자짜리 밑줄 런만 센다(빈칸 `___` 이상 제외). lookbehind 정규식은 Safari ≤16.3 에서 모듈 평가 시
  // SyntaxError 로 조판기 전체를 죽이므로(검수 실측) 런 길이 스캔으로 쓴다.
  const pairs = (text.match(/_+/g) || []).filter((run) => run.length === 2).length;
  if (pairs % 2 === 0) return text;
  return startsAtBeginning ? `${text}__` : `__${text}`;
}

export function renderQuestionTextInline(
  text: string,
  subType: string | null | undefined,
) {
  const normalizedText = normalizeSummaryCompletionQuestionText(text, subType);
  const { beforeText, givenText } = splitSentenceInsertGivenBlock(normalizedText, subType);
  if (!givenText) return renderFormattedInline(collapsePassageParagraphs(normalizedText), subType);

  // 실제 수능 포맷: '주어진 문장' 박스를 지문 '위'에 둔다(라벨은 한글).
  return (
    <>
      <span data-block="1" className="mb-1.5 block leading-[1.55]">
        <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-wider text-slate-500">
          주어진 문장
        </span>
        {renderFormattedInline(givenText, subType)}
      </span>
      {beforeText && (
        <span data-block="1" className="block">{renderFormattedInline(collapsePassageParagraphs(beforeText), subType)}</span>
      )}
    </>
  );
}
