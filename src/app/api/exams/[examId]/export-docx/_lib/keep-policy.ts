/**
 * DOCX 묶음 유지(keep-together) 정책 — docs/EXAM-PAPER-MODEL.md §9, COH-3(웹·HWPX·DOCX 한 규칙).
 *
 * 렌더러(build-builder-document/{question,answer,passage,assemble}.ts, render-options.ts)는 문단을
 * 만들 때 **역할**만 고르고, 역할 → OOXML 문단 속성(keepNext·keepLines, 표 행 cantSplit) 변환은 이 모듈
 * 한 곳이 한다. 역할 어휘와 규칙은 HWPX keep-policy(export-hwpx/_lib/keep-policy.ts)와 같다.
 *
 * ── 역할 대응표 ───────────────────────────────────────────────────────────────────────────────
 *  역할          HWPX(keep-policy.ts, breakSetting)              DOCX(여기, w:pPr)
 *  questionHead  keepWithNext + keepLines, 뒤가 또 머리면 kwn 없음  keepNext + keepLines, 문항 안에 뒤 요소가 있을 때만 keepNext
 *  caption       keepWithNext + keepLines                          keepNext + keepLines (주어진 문장·세트 안내문·지문 제목·↓·
 *                                                                  〈보기〉·[조건]·해설/핵심 포인트/오답 분석 라벨, 본문 안
 *                                                                  단독 라벨 줄 — isStandaloneLabelLine)
 *  optionHead    keepWithNext + keepLines                          다중 빈칸 표 머리 행 = 선지 행과 같은 optionKeep + 행 cantSplit
 *  option        keepLines, 다음이 option 이면 kwn                  keepLines, 묶음 마지막이 아니면 keepNext (render-options.optionKeep)
 *                (빈 문단 너머 정답 배지면 이어 묶음)                 ★ 선지 → 배지 다리는 두지 않는다(아래 「의도된 차이」)
 *  배지(역할 표)  표 keepWithNext                                  행 문단 keepNext + keepLines + 행 cantSplit — 뒤에 해설 구역이
 *                                                                  있을 때만. Word 는 「표 → 다음 문단」 묶음을 행 문단의 keepNext 로 읽는다
 *  빈 간격 문단   kwn 역할 뒤 최대 2개가 사슬을 잇는다              bridgeKeep — 배지 → 간격 → 「해설」 에만 쓴다
 *  역할 없음      0 (지문·본문·해설 문단)                           0 — 아래 HW-1
 *  상한          사슬 추정 높이 > 단 높이면 끊음(CHAIN_CAP)         역할 문단 추정 줄 수 > KEEP_MAX_LINES 면 역할 플래그를 달지 않는다
 *
 * ── 의도된 차이: 선지 → 정답 배지 다리 없음(26-09-30 실측, A=107문항·B=80문항 정답포함) ──────────────
 *  HWPX 는 사슬 추정 높이로 끊는 상한이 있지만 DOCX 는 엔진이 사슬을 끊지 않는다. 선지 묶음 + 배지 + 「해설」 +
 *  첫 줄(단의 약 40%)을 한 사슬로 걸면 Word 가 통째로 옮겨 25% 넘는 빈 단이 A 0→10, B 0→9 로 늘었다.
 *  다리를 빼면 두 엔진 모두 0 이다. 대가: 배지가 선지와 떨어져 다음 단 첫머리(해설과 함께)에서 시작할 수
 *  있다(HWPX 도 같은 대가를 받아들였다 — 배지 단 첫머리). 배지만 단 바닥에 남는 고아는 Word 0.
 *  한컴의 DOCX 가져오기는 표 셀 문단의 keepNext 를 표 전체의 「다음 문단과 함께」로 늘 읽지는 않아
 *  배지 바닥 고아가 일부 남는다(A 해설 5, B 해설 0). 한글 사용자의 정본 경로는 HWPX 다.
 *
 * ── 왜 본문에는 걸지 않는가(HW-1, 26-09-30 한컴 2024 실측) ─────────────────────────────────────
 *  Word 는 keepNext 문단을 쪽·단 경계에서 나눌 수 있다(마지막 줄만 다음 문단과 붙인다). 한컴은 DOCX 의
 *  keepNext 문단을 **통째로** 다음 문단과 같은 단에 두려 한다. 선지 앞 마지막 본문 문단(대개 지문 전체
 *  15~18줄)에 keepNext 를 걸면 ① 그 지문이 다음 단으로 통째로 밀려 74~82% 빈 단이 생기고 ② 머리→지문→
 *  선지 사슬이 한 단보다 길어지면 한컴이 keep 을 포기해 선지 묶음이 갈라지고 머리 줄만 단 바닥에 남았다.
 *  그래서 본문 문단은 어떤 경우에도 keepNext 를 받지 않는다(EXAM-PAPER-MODEL §9 「지문·본문 문단은 묶지 않는다」).
 *  역할 문단 뒤의 본문은 사슬의 끝이 되어 첫 줄(들)만 함께 간다 — 두 엔진 모두(HWPX V-A2 first-lines 와 같다.
 *  한컴 실측: 머리 뒤 지문 첫 줄만 단 바닥에 남는 경우가 있다 = 사슬 끝 문단은 통째로 옮기지 않는다).
 *  같은 이유로 역할 문단이라도 비정상적으로 길면(요약문 완성 발문에 지문이 통째로 붙은 저장본 등)
 *  본문처럼 다룬다 — KEEP_MAX_LINES.
 *
 * false 값은 속성을 아예 빼서 반환한다 — <w:keepNext w:val="false"/> 를 남기지 않는다(존재만 보고 참으로
 * 읽는 파서 대비, tests/unit/docx-table-grid 「no keepNext false」).
 */

export type DocxKeepRole = "questionHead" | "caption" | "option" | "badge";

export type DocxKeepFlags = { keepNext?: true; keepLines?: true };

/**
 * 역할 문단 한 개가 keep 을 받을 수 있는 최대 추정 줄 수. 넘으면 역할이 없는 본문처럼 다룬다.
 * 한 단(A4 2단 ≈ 40줄)의 15% 안팎 — keep 때문에 다음 단으로 밀려도 남는 빈칸이 25% 게이트 아래다.
 * 선지(option)는 묶음 규칙(EXAM-PAPER-MODEL §9)이 우선이라 상한을 적용하지 않는다(한 단보다 긴 묶음은 엔진이 쪼갠다).
 */
export const KEEP_MAX_LINES = 6;

/** 한글·전각·원문자는 1em, 그 밖(라틴·숫자·공백·구두점)은 0.55em 로 보는 거친 줄 수 추정. */
export function estimateTextLines(text: string, sizeHalfPt: number, widthDxa: number): number {
  const sizePt = sizeHalfPt / 2;
  const widthPt = widthDxa / 20;
  if (!(sizePt > 0) || !(widthPt > 0)) return 1;
  let em = 0;
  for (const ch of text) {
    em += /[ᄀ-ᇿ①-⓿　-〿㄰-㆏가-힣＀-￯]/.test(ch) ? 1 : 0.55;
  }
  return Math.max(1, Math.ceil((em * sizePt) / widthPt));
}

/**
 * 역할 → 문단 keep 속성.
 *  - hasNext: 같은 묶음(문항 블록·해설 블록) 안에서 이 문단 뒤에 함께 가야 할 요소가 있는가.
 *    없으면 keepNext 를 달지 않는다(사슬이 다음 문항으로 번지지 않게 — HWPX headAfterHead 가드와 같은 목적).
 *  - lines: 추정 줄 수(estimateTextLines). questionHead·caption 이 KEEP_MAX_LINES 를 넘으면 {}.
 */
export function docxKeep(
  role: DocxKeepRole,
  opts: { hasNext: boolean; lines?: number },
): DocxKeepFlags {
  const { hasNext, lines = 1 } = opts;
  switch (role) {
    case "option":
      return hasNext ? { keepNext: true, keepLines: true } : { keepLines: true };
    case "badge":
      // 표 행 문단 — 행 자체는 cantSplit(렌더러가 TableRow 에 준다).
      return hasNext ? { keepNext: true, keepLines: true } : { keepLines: true };
    case "questionHead":
    case "caption":
      if (lines > KEEP_MAX_LINES) return {};
      return hasNext ? { keepNext: true, keepLines: true } : { keepLines: true };
    default:
      return {};
  }
}

/**
 * 문항 본문 안의 단독 라벨 줄(「[조건]」·「[보기]」·「<요약문>」·「〈보기〉」처럼 괄호 라벨만 있는 줄) — caption.
 * HWPX 는 같은 줄을 parseQuestionSections 의 구역 라벨(labelPara, caption)로 그린다. 라벨 뒤에 내용이 붙은
 * 줄(「[영작할 우리말] 걷기 좋은…」)은 본문이다.
 */
const STANDALONE_LABEL_RE = /^(?:\[[^[\]\n]{1,12}\]|<[^<>\n]{1,12}>|〈[^〈〉\n]{1,12}〉|【[^【】\n]{1,12}】)$/;
export function isStandaloneLabelLine(text: string): boolean {
  return STANDALONE_LABEL_RE.test(text.trim());
}

/** kwn 역할 문단과 그 뒤 역할 요소 사이의 빈 간격 문단(선지→배지, 배지→「해설」) — 사슬을 잇는다. */
export function bridgeKeep(hasNext: boolean): DocxKeepFlags {
  return hasNext ? { keepNext: true } : {};
}
