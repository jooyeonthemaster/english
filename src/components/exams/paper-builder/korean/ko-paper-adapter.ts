// ============================================================================
// ko-paper-adapter — 국어 문항의 시험지 본문 세그먼트 변환 (KO-DESIGN-SPEC §1 B2b)
// ============================================================================
// KO 문항의 structuredData → 레지스트리 모듈 toRenderModel → KoRenderModel →
// StructSegment[] (question-body-layout 의 세그먼트 모델). SUMMARY_WRITING 렌더
// 패턴을 미러한다: 지문 박스(마커 병합) → <보기> 박스 → <조건> 박스.
// 세그먼트는 줄 단위로 흘려 칸 경계에서 분할된다(<보기> 박스는 칸 경계 분할
// 허용이 수능 조판 관행 — 원자화하지 않는다).
//
// 소비 표면 3곳(웹 structuredSegments·DOCX buildQuestionBlock·HWPX
// renderQuestionBlock)이 이 어댑터 하나만 쓰므로 구조가 자동 정합된다.
//
// 무회귀: 이 어댑터는 KO 게이트 하에서만 호출된다. 신규 StructRowStyle 을 만들지
// 않고 기존 boxStyle("passage"|"given")만 재사용해 pagination-metrics 를 무변경으로
// 통과한다. 박스 헤더("〈 보 기 〉"/"[조건]")·출처·각주는 별도 스타일 대신 세그먼트
// "행" 으로 실어 나르고, 렌더러가 행 패턴으로 식별한다(textToLines 가 원문 행을
// 절대 병합하지 않으므로 행 단위 식별이 안전하다).
// ============================================================================

import { getKoTypeModule, isKoQuestionType } from "@/lib/korean/registry";
import type { KoRenderModel } from "@/lib/korean/core/render-model";
import type { StructSegment } from "../question-body-layout";

// ---------------------------------------------------------------------------
// 입력 형태 — PaperItem(웹)·BuilderItemResolved(DOCX/HWPX)를 구조적으로 수용
// ---------------------------------------------------------------------------

export interface KoPaperQuestionLike {
  /** 출제자 지문 포함 토글 (false 면 지문 박스 억제 — 웹/DOCX/HWPX 공통). */
  includePassage?: boolean;
  passageContent?: string;
  questionText?: string;
  sourceQuestion: {
    subType: string | null;
    structuredData?: unknown;
    questionText?: string | null;
    passage?: { content?: string | null } | null;
  };
}

/** KO 유형 중 시험지 구조화 렌더(지문/자료/보기/조건 박스)를 쓰는지. */
export function isKoStructuredSubtype(subType: string | null | undefined): boolean {
  if (!isKoQuestionType(subType)) return false;
  const mod = getKoTypeModule(subType || "");
  if (!mod) return false;
  return (
    mod.meta.includesPassage ||
    mod.meta.usesBogi !== "none" ||
    (mod.meta.usesStimulus ?? "none") !== "none" ||
    mod.meta.answerFormat === "ESSAY"
  );
}

/**
 * KO 봉투 최소 계약 검사. '객체이기만 하면' 통과시키면 직접수정(발문 자유편집)이 남긴
 * `{_manualEditedFlat:true}` 스텁도 렌더모델 조립에 성공해(방어적 읽기라 throw 없음)
 * 발문·보기·마커가 통째로 소실된 문항이 3표면(웹/DOCX/HWPX)에 인쇄된다. KO 봉투는
 * 항상 direction(발문)을 문자열로 갖고 생성 스냅샷은 _typeId="KO_*" 를 갖는다 —
 * 어느 쪽도 없으면(또는 스텁이면) null 로 강등해 표준 questionText 폴백 경로를 태운다.
 */
function isKoEnvelope(data: Record<string, unknown>): boolean {
  if (data._manualEditedFlat === true) return false;
  if (typeof data.direction === "string") return true;
  return typeof data._typeId === "string" && data._typeId.startsWith("KO_");
}

function readStructuredData(item: KoPaperQuestionLike): Record<string, unknown> | null {
  const raw = item.sourceQuestion.structuredData;
  if (!raw) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const record = raw as Record<string, unknown>;
    return isKoEnvelope(record) ? record : null;
  }
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) &&
      isKoEnvelope(parsed as Record<string, unknown>)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 렌더모델 해소
// ---------------------------------------------------------------------------

/**
 * KO 문항의 렌더모델을 해소한다. KO 유형이 아니거나 레지스트리 미등록이거나
 * structuredData 결손/조립 예외면 null — 호출측이 기존 questionText 폴백 경로로
 * 비파괴 강등한다(조용한 크래시 금지).
 */
export function koPaperRenderModel(item: KoPaperQuestionLike): KoRenderModel | null {
  const subType = item.sourceQuestion.subType;
  if (!isKoQuestionType(subType)) return null;
  const mod = getKoTypeModule(subType);
  if (!mod) return null;
  const structuredData = readStructuredData(item);
  if (!structuredData) return null;
  const passage = item.passageContent || item.sourceQuestion.passage?.content || "";
  try {
    return mod.toRenderModel(structuredData, {
      passage,
      suppressPassage: item.includePassage === false,
    });
  } catch {
    return null; // 렌더모델 조립 실패 → 폴백 (비파괴)
  }
}

/** 발문 표시 텍스트 — 부정어 __밑줄__ 마크업 유지 + [n점] 표기(카드 렌더러와 동일 규칙). */
export function koPaperStemText(model: KoRenderModel): string {
  return model.stem.points ? `${model.stem.text} [${model.stem.points}점]` : model.stem.text;
}

/** KO 문항의 발문(stem) — [n점] 표기 포함. 지시문만 헤더에 렌더된다. */
export function koStemForItem(item: KoPaperQuestionLike): string {
  const model = koPaperRenderModel(item);
  if (!model || !model.stem.text.trim()) {
    // 폴백: questionText 첫 줄 (serializeKoQuestion 은 발문을 첫 행에 둔다)
    const fallback = item.questionText || item.sourceQuestion.questionText || "";
    return fallback.split("\n")[0]?.trim() || fallback;
  }
  return koPaperStemText(model);
}

// ---------------------------------------------------------------------------
// 박스 헤더/특수 행 규약
// ---------------------------------------------------------------------------

/** "〈 보 기 〉" 헤더 행 — 두 글자 이하 라벨만 자간 벌림(수능 조판 관행, 카드와 동일). */
export function koBogiHeaderLine(label: string): string {
  const compact = (label || "보기").replace(/\s+/g, "");
  const display = compact.length <= 2 ? compact.split("").join(" ") : label;
  return `〈 ${display} 〉`;
}

export const KO_BOGI_HEADER_LINE_RE = /^〈[^〈〉\n]+〉$/;
export const KO_CONDITION_HEADER_LINE = "[조건]";
/** 문학 출처 행 "- 작가, 「작품」 -" (지문 박스 말미 — 우측 정렬 렌더 대상). */
export const KO_SOURCE_LINE_RE = /^-\s.+\s-$/;
/** 각주 행 "*어휘: 뜻풀이" (지문 박스 말미 — 축소 렌더 대상). */
export const KO_FOOTNOTE_LINE_RE = /^\*\S/;

/** 지문 파트 1개 → "passage" 박스 행 텍스트 ((가) 라벨 + 본문 + 출처 + 각주 행). */
export function koPassagePartText(part: NonNullable<KoRenderModel["passage"]>["parts"][number]): string {
  const lines: string[] = [];
  lines.push(part.label ? `${part.label} ${part.text}` : part.text);
  if (part.sourceLine) lines.push(part.sourceLine);
  for (const f of part.footnotes ?? []) lines.push(`*${f.term}: ${f.gloss}`);
  return lines.join("\n");
}

/**
 * 자체자료 블록 1개 → "passage" 박스 행 텍스트.
 * 첫 행 = "(가) 표제"(있을 때만), 이후 자료 본문 행(화자 라벨·지시문·S# 행 단위
 * 보존 — isSourceLineStart 가 하드 개행으로 유지), 말미 각주 행(*어휘: 뜻 —
 * splitKoStructBoxRows 의 passage 각주 걷어내기가 그대로 적용된다).
 */
function koStimulusBlockText(block: NonNullable<KoRenderModel["stimulus"]>[number]): string {
  const lines: string[] = [];
  const head = [block.label, block.title].filter(Boolean).join(" ");
  if (head) lines.push(head);
  lines.push(...block.lines);
  for (const f of block.footnotes ?? []) lines.push(`*${f.term}: ${f.gloss}`);
  return lines.join("\n");
}

/** KoRenderModel → 구조 세그먼트. 선지는 기존 옵션 리스트 경로가 그린다(세그먼트 미포함). */
export function koPaperSegmentsFromModel(model: KoRenderModel): StructSegment[] {
  const segs: StructSegment[] = [];

  // 지문 박스 (마커 병합 완료본) — (가)(나) 복합지문은 파트당 1박스.
  for (const part of model.passage?.parts ?? []) {
    if (!part.text.trim()) continue;
    segs.push({ kind: "box", boxStyle: "passage", text: koPassagePartText(part) });
  }

  // 자체자료 박스 — 블록당 1박스, 지문 박스 스타일 재사용(신규 StructRowStyle 금지 —
  // pagination-metrics 무변경 통과). 칸 경계 분할 허용(수능 조판 관행 동일).
  for (const block of model.stimulus ?? []) {
    if (!block.lines.some((l) => l.trim())) continue;
    segs.push({ kind: "box", boxStyle: "passage", text: koStimulusBlockText(block) });
  }

  // <보기> 박스 — 첫 행 = 중앙 헤더 행.
  if (model.bogi && model.bogi.lines.length > 0) {
    segs.push({
      kind: "box",
      boxStyle: "given",
      text: [koBogiHeaderLine(model.bogi.label), ...model.bogi.lines].join("\n"),
    });
  }

  // <조건> 박스 — 서술형. 첫 행 = "[조건]" 헤더 행.
  if (model.conditionBox && model.conditionBox.length > 0) {
    segs.push({
      kind: "box",
      boxStyle: "given",
      text: [KO_CONDITION_HEADER_LINE, ...model.conditionBox.map((c) => `• ${c}`)].join("\n"),
    });
  }

  return segs;
}

/**
 * KO 문항의 구조화 본문 세그먼트 — structuredSegments() 의 KO 게이트가 소비.
 * item.includePassage === false (출제자가 지문 토글 OFF)면 지문 박스를 생략한다.
 * 어댑터 해소 실패 시 빈 배열(발문만 렌더 — 비파괴 강등).
 */
export function koStructuredSegments(item: KoPaperQuestionLike): StructSegment[] {
  const model = koPaperRenderModel(item);
  if (!model) return [];
  return koPaperSegmentsFromModel(model);
}

// ---------------------------------------------------------------------------
// KO 박스 행 잇기/분해 — 렌더 표면(웹 StructuredBody·HWPX fragment)이 소비
// ---------------------------------------------------------------------------
// 페이지네이션이 만든 줄(row)들은 원문 행 경계를 넘지 않는다(원문 행마다 개별
// 래핑 — pagination-metrics.textToLinesWithMeta). 원문 행 경계(isSourceLineStart)는
// 전부 하드 개행으로 보존한다 — 시·시조·희곡의 행(行)은 그 자체가 의미 단위라
// 산문처럼 병합하면 행 단위 판정(시상 전개·행 인용)이 지면에서 붕괴한다(카드/DOCX 는
// 행 보존이라 표면 간 불일치이기도 했다). 래핑으로 생긴 이어짐 행만 공백으로 다시
// 이어 브라우저/한컴이 칸 폭에 맞게 재흘림한다. 아래 행 머리 패턴 휴리스틱은 플래그가
// 없는 레거시 경로 전용 폴백으로 강등:
//   〈 보 기 〉 헤더 · [라벨] · ㄱ./ㄴ. 항목 · • 불릿 · "- 출처 -" · *각주 · 화자 표기

const KO_HARD_BREAK_LINE_RE =
  /^(?:〈[^〈〉\n]+〉$|\[[^\]\n]+\]|[ㄱ-ㅎ][.)]\s|[-*•]\s|\*\S|-\s.+\s-$|(?:학생|교사|갑|을|병)\s*\d*\s*[:：])/;

export function joinKoStructLines(
  lines: string[],
  /** lines[i] 가 원문 행의 첫 랩행인지(StructRow.isSourceLineStart, lines 와 같은 인덱스). */
  sourceLineStarts?: ReadonlyArray<boolean | undefined>,
): string {
  let result = "";
  let prevBlank = false;
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      prevBlank = true;
      continue;
    }
    const src = sourceLineStarts?.[i];
    // 원문 행 시작(true)=하드 개행 / 래핑 이어짐(false)=공백 / 미상(undefined)=휴리스틱.
    const hardBreak = src === undefined ? KO_HARD_BREAK_LINE_RE.test(trimmed) : src;
    if (!result) result = trimmed;
    else if (prevBlank) result += `\n\n${trimmed}`;
    else if (hardBreak) result += `\n${trimmed}`;
    else result += ` ${trimmed}`;
    prevBlank = false;
  }
  return result.replace(/[ \t]{2,}/g, " ").trim();
}

/**
 * 행 경계를 넘는 __밑줄__ 마크업을 행별 균형 마크업으로 정규화한다.
 * buildKoMarkedPassage 의 마킹 타깃(KoSpanMatch.sourceText)은 개행을 포함할 수 있는데,
 * DOCX/HWPX 는 텍스트를 행으로 쪼갠 뒤 행마다 `__([^_]+)__` 를 매칭하므로 개행을 낀
 * 마킹은 행마다 홀수 `__` 만 남아 리터럴 언더스코어로 인쇄된다. 각 행에서 여닫도록
 * 나눠 감싼다(개행 없는 마킹·`___` 빈칸 런은 무변경 — [^_]+ 라 3연속 이상은 미매칭).
 */
export function balanceKoUnderlineMarkersPerLine(text: string): string {
  return text.replace(/__([^_]+)__/g, (match, inner: string) => {
    if (!inner.includes("\n")) return match;
    return inner
      .split("\n")
      .map((part) => (part.trim() ? `__${part}__` : part))
      .join("\n");
  });
}

export interface KoStructBoxView {
  /** "〈 보 기 〉" 또는 "[조건]" 헤더 행 (세그먼트 첫 조각에서만 non-null). */
  header: string | null;
  body: string;
  /** 지문 박스 말미 출처 행 — 우측 정렬 렌더 대상. */
  sourceLine: string | null;
  /** 지문 박스 말미 각주 행들 — 축소 렌더 대상. */
  footnotes: string[];
}

/**
 * 박스에 배정된 줄(row)들을 헤더/본문/출처/각주로 분해한다. 칸 경계로 쪼개진
 * 이어짐 조각(isSegStart=false)은 헤더 탐지를 건너뛴다(헤더는 첫 조각에만 존재).
 * 헤더("〈 보 기 〉"/"[조건]")는 어댑터가 given 박스에만 만들므로 given 에서만
 * 탐지한다 — 지문 첫 행이 "〈제1수〉"(연시조 수 라벨)처럼 〈…〉 단독인 경우
 * 본문 행이 헤더로 오분류·이탈하지 않는다.
 */
export function splitKoStructBoxRows(
  lines: string[],
  opts: {
    isSegStart: boolean;
    style: "passage" | "given";
    /** lines[i] 가 원문 행의 첫 랩행인지(StructRow.isSourceLineStart, lines 와 같은 인덱스). */
    sourceLineStarts?: ReadonlyArray<boolean | undefined>;
  },
): KoStructBoxView {
  const rows = lines.map((line, i) => ({ line, src: opts.sourceLineStarts?.[i] }));
  let header: string | null = null;

  if (opts.isSegStart && opts.style === "given") {
    const firstIdx = rows.findIndex((r) => r.line.trim());
    if (firstIdx >= 0) {
      const first = rows[firstIdx].line.trim();
      if (KO_BOGI_HEADER_LINE_RE.test(first) || first === KO_CONDITION_HEADER_LINE) {
        header = first;
        rows.splice(0, firstIdx + 1);
      }
    }
  }

  const footnotes: string[] = [];
  let sourceLine: string | null = null;
  if (opts.style === "passage") {
    // 말미에서 각주 → 출처 순으로 걷어낸다(구성 순서: 본문, 출처, 각주*n).
    while (rows.length > 0) {
      const last = rows[rows.length - 1].line.trim();
      if (!last) {
        rows.pop();
        continue;
      }
      if (KO_FOOTNOTE_LINE_RE.test(last)) {
        footnotes.unshift(last);
        rows.pop();
        continue;
      }
      break;
    }
    const last = rows.length > 0 ? rows[rows.length - 1].line.trim() : "";
    if (KO_SOURCE_LINE_RE.test(last)) {
      sourceLine = last;
      rows.pop();
    }
  }

  return {
    header,
    body: joinKoStructLines(
      rows.map((r) => r.line),
      rows.map((r) => r.src),
    ),
    sourceLine,
    footnotes,
  };
}
