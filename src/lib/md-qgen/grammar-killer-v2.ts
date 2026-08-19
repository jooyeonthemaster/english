// 어법 KILLER v2 레인 (26-08-17 시공, O219~O222 4라운드 벤치 확정 형상).
//
// 대상: md-stream 의 gemini(비-luna) 어법 표준형(5마커·1정답) × KILLER 난이도.
// 구성 3요소(각각 같은 20지문 paired 블라인드 패널로 실측):
//   ① v2 프롬프트 — 규칙 목록(포인트 가이드 4.6KB·합성 few-shot) 제거, 실물 수능29
//      해부 + 킬러 자리 카탈로그 + 설계 절차 + 설계메모 출력(A+B 2→16/20, O220)
//   ② 인용-앵커 해설 — 해설·오답 분석을 "원문 축자 복사 → 분석" 구조로 강제
//      (위치·단복수 날조 4~5건→1건, O221·O222)
//   ③ 결정형 게이트 3종 — 인용 축자(해설은 표시형 기준)·밑줄/정답 표현 포함·
//      "바로 앞의 X" 직전 토큰 대조(관사 스킵). 1차 적발분은 기존 재생성 정책이 흡수.
// 실측 예상치: A+beautiful ~30%·V4 잔존 ~25%(유인 날조·구조 오분석 — 문법 지식
// 계통, 구조·게이트 한계선)·₩27/문항·중앙 62s·게이트 재시도 ~15%.
//
// 벤치 정본: experiments/question-quality-20260715/killer-bench-20260817/
// (prompts-v2.ts 가 실험 원형 — 이 파일은 그 확정분의 프로덕션 사본이다.)
// 킬스위치: env QGEN_GRAMMAR_KILLER_V2=off (전면 구형 프롬프트 복귀, 재빌드 불필요).

import { normalizeWs, type MdGrammarQuestion } from "./parser";

export function isGrammarKillerV2Enabled(): boolean {
  return process.env.QGEN_GRAMMAR_KILLER_V2?.trim().toLowerCase() !== "off";
}

// ── 프롬프트 ─────────────────────────────────────────────────────────────────

const POINT_CODES =
  "포인트코드: (a)정동사vs준동사 (b)관계사·접속사 (c)분사 (d)수일치 (e)태 (f)형용사vs부사 (g)대명사 (h)목적격보어 (i)병렬 (k)to-v vs v-ing";

const EXEMPLAR_2020 = `## 실물 해부 — 수능 29번 (이 "깊이"를 재현하라. 지문·표현을 베끼지는 마라)
지문 일부: "… Both growth and development require a complex and dynamic set of interactions involving all cell parts. ④ What cell metabolism and structure should be complex would not be surprising, but actually, they are rather simple and logical. Even the most complex cell has only a small number of parts, each ⑤ responsible for a distinct, well-defined aspect of cell life."
- 정답 ④ What → That: 문두의 What은 그 자체로는 완벽히 자연스럽다. 절 "cell metabolism and structure should be complex"가 **주어·동사·보어가 다 갖춰진 완전한 절**임을 끝까지 읽고, 그 절 전체가 would not be surprising의 주어임을 파악해야 비로소 명사절 접속사 That이 필요함이 드러난다. 판정 단서가 밑줄에서 멀리(절의 끝과 주절 동사) 있다 — 이것이 킬러 정답의 조건이다.
- 미끼 ① producing: 분사구문. "divides, producing" — 정동사 produces로 고치고 싶어진다. ② was: 대동사(= was large). 뒤에 아무것도 없어 어색해 보여 지우거나 is로 고치고 싶어진다. ③ differentiates: "either prepares to divide or matures and differentiates" — 병렬의 셋째 항. prepares to에 걸린 원형 differentiate로 착각하게 한다. ⑤ responsible: "each (being) responsible" 분사구문. each가 주어처럼 보여 is responsible로 고치고 싶어진다.
- 배치: 10문장 중 3·4·6·8·9번째 문장에 하나씩 — 앞·중·뒤에 흩어져 있고, 정답은 후반부의 복잡한 문장에 있다. 미끼 넷은 서로 다른 기제(분사구문/대동사/병렬/축약 분사구문)이고, 넷 다 "구체적으로 무엇으로 잘못 고치고 싶어지는지"가 분명하다.`;

const KILLER_SITES = `## 킬러 정답이 사는 자리 (지문에서 이런 구조를 찾아라 — 판정 단서가 밑줄에서 멀리 있는 자리)
- 병렬의 마지막 항: 첫 항이 멀리 있어 짝을 잊게 되는 to-v/v-ing/원형/시제 (either A or B and C 류)
- 삽입구·관계절·분사구·동격으로 주어의 핵이 멀어진 수일치, 또는 도치문의 진짜 주어 수일치 (주어 바로 옆 수일치는 킬러가 아니다)
- 문두 명사절: That/Whether/What — 절이 완전한지 끝까지 읽어야 갈리는 자리
- 관계사 뒤 삽입절: "the man who (I think) is/are …", "which (they said) was/were …"
- 분사구문·축약 분사: 의미상 주어가 주절 주어와 같은지, 능동/수동이 문맥으로만 갈리는 자리 (each/most of them + p.p./-ing)
- 대동사 do/does/did vs be, 대부정사 to
- 5형식·준사역·지각동사의 목적어가 길어져 보어(원형/p.p./형용사)가 동사에서 멀어진 자리
- 형용사 보어 자리(remain/keep/leave/find + O + 형용사, 감각동사)와 부사 자리가 표면상 구분되지 않는 곳
- 관계부사 vs 관계대명사: 관계절 내부 성분이 완결됐는지 뒤까지 읽어야 아는 자리
정답 오형은 그 자리에 놓았을 때 **로컬로는 자연스러워 보여야** 한다. 철자·비단어·조동사 바로 뒤 원형·관사 같은 즉답 자리는 금지.`;

// 26-08-18 해설 다이어트(O225, 사용자 결정 "원큐·짧게·유혹 서사 금지"): 종전
// "무엇으로 잘못 고치고 싶어지는지 → 왜 옳은지" 지시가 위치 허위("바로 앞의 X")·
// 성립하지 않는 오독 경로의 발원지였다 — 실사용 표본에서 재생성 후에도 재발.
// 분석은 **판정 근거 1문장**만: 인용은 앵커(사실 접지)로 유지, 서사는 뺀다.
const QUOTE_RULES = `## 오답 분석 작성 규칙 (필수 — 짧을수록 좋다)
- 각 오답 분석은 **원문 복사부터** 한다: 그 밑줄을 포함한 주변 8~12단어를 「」 안에 지문에서 한 글자도 바꾸지 말고 그대로 옮겨 적고, 이어서 같은 줄에 "분석:"을 쓴다.
- 분석은 **딱 1문장** — 그 자리가 어떤 규칙으로 옳은지만. "학생이 ~로 잘못 고치고 싶어진다"·"~와 헷갈리기 쉽다" 같은 유혹·심리 서사는 쓰지 마라(미끼의 유혹 설계는 사고 안에서만 하고 출력하지 않는다).
- 위치·수(단복수) 서술이 꼭 필요하면 방금 복사한 인용 안에 실제로 보이는 것만 쓴다. "바로 앞의 X"는 X가 인용 안에서 그 밑줄 바로 앞에 실제로 보일 때만.

## 정답 해설 작성 규칙 (필수)
- 해설도 **원문 복사부터** 한다: 정답 밑줄이 포함된 문장(화면에 표시된 형태 그대로 — 오형 포함, [[ ]] 마커는 빼고)을 「」 안에 복사하고, 이어서 "분석:"을 쓴다.
- 분석은 **1~2문장** — 밑줄 자리가 어떤 규칙을 어기는지와 고친 형태만. 밑줄 바로 그 자리의 성분(그 동사의 주어·그 관계사의 선행사)만 말하고, 다른 절의 구조를 끌어오지 마라. 인용에 없는 구조를 지어내면 반려된다.`;

const PLAN_SECTION = `## 설계메모 (출력 최상단, 4~6줄, 형식 자유 — 단 "정답:" "고침:" "(A)" 같은 표식은 쓰지 마라)
- 후보 자리 3개를 "문장번호 · 표현 · 기제 · 판정 단서까지의 거리(단어 수) · 오형이 로컬로 자연스러운가"로 한 줄씩 적고, 그중 무엇을 정답으로 택했는지 한 줄로 밝혀라.
- 그 다음 줄부터 아래 출력 형식을 그대로 이어라.`;

const OUTPUT_FORMAT = `## 출력 형식 (마크다운 — 이 형식 그대로, 다른 말 붙이지 마라)
밑줄지문:
<지문 "전체"를 한 글자도 바꾸지 말고 그대로 옮겨 적는다. 단, 밑줄 5곳만 [[A:표현]] ~ [[E:표현]] 로 감싼다(등장 순서대로 A→E). 정답 한 곳만 표현이 원문과 다른 오형이고, 나머지 4곳은 원문 그대로다. 마커 밖의 모든 텍스트는 원문과 완전히 동일해야 한다.>

원형·포인트:
(A) <이 자리의 원문 형태(정답 자리는 고친 원형, 미끼는 마커 안 표현과 동일)> | <포인트코드: a~k 한 글자만>
(B) ...
(C) ...
(D) ...
(E) ...
정답: <(A)~(E) 하나>
고침: <정답 자리를 고친 원형>
해설: 원문「<정답 밑줄이 포함된 문장을 화면 표시 형태(오형 그대로, 마커 제외)로 복사>」 분석: <1~2문장, 합니다체 — 밑줄 자리가 어떤 규칙을 어기는지와 고친 형태만>
오답:
(A) 원문「<이 밑줄을 포함한 지문 원문 8~12단어를 한 글자도 바꾸지 말고 그대로 복사>」 분석: <이 자리가 어떤 규칙으로 옳은지 딱 1문장 합니다체 — 유혹·심리 서사 금지> (정답 라벨 제외 4개만, 인용과 분석은 같은 줄에)
...`;

/** 어법 KILLER v2 base 프롬프트 — 종전의 buildMdGrammarPrompt(KILLER)+포인트 가이드
 * +공용 검산을 통째로 대체한다(교사 지정·다양성·추가 지시 블록은 호출측이 뒤에 붙임). */
export function buildGrammarKillerV2Prompt(passage: string): string {
  return `너는 수능 영어 어법 문항을 오래 출제해 온 출제위원이다. 아래 지문으로 밑줄 5개 "어법상 틀린 것" 문항 1개를 KILLER 난이도로 설계하라. 목표는 하나다 — **상위권 학생도 구조를 끝까지 추적해야 답이 갈리는 문항**. 규칙을 채우는 것이 아니라 아름다운 자리를 고르는 일이다.

${EXEMPLAR_2020}

${KILLER_SITES}

## 설계 절차 (사고 안에서 순서대로 수행하라)
1. 지문을 문장 단위로 훑으며, 위 목록에 해당하는 구조를 **문장마다** 찾아 후보로 적어라(문장번호·표현·기제·판정 단서까지의 거리).
2. 정답 = 후보 중 판정 단서가 가장 멀고, 오형이 로컬로 가장 자연스러운 자리. 지문에서 가장 구조가 복잡한 문장(삽입·관계절·병렬이 겹친 곳)에 두는 것이 원칙이다. 후보를 최소 2개 놓고 비교한 뒤 골라라. 수일치가 최선이더라도 주어의 핵과 동사 사이에 실제로 다른 명사·절이 끼어 있을 때만 허용한다.
3. 미끼 4개 = 각각 "학생이 구체적으로 무엇으로 잘못 고치고 싶어지는 자리". 그 잘못된 고침을 스스로 한 단어로 말할 수 없으면 그 자리는 미끼가 아니다(by -ing·관사 옆·주어 바로 옆 동사·지시 대상이 붙은 대명사는 실격). 넷의 기제가 서로 다르고, 정답과 같은 포인트코드는 피한다.
4. 배치: 밑줄 5개는 서로 다른 문장에, 지문 앞·중·뒤에 흩어라. 한 문장에 둘, 지문 첫 두 문장에 둘, 직접 인용문 안에 둘은 피한다. 지문 문장 수가 5개 미만이면 **생성을 포기하지 말고** 문장당 2~3개까지 허용하되 서로 다른 절·다른 포인트로 — 짧은 지문에서는 밑줄 사이 1단어 이상이면 된다(0단어 간격 연속 밑줄만 금지). 밑줄은 판정이 걸린 단어 1개(불가피하면 2개)에만 긋는다.
5. 검산: 마커를 원형으로 되돌리면 원문과 한 글자도 다르지 않은가. 정답 외 4곳이 표준 문법으로 이론의 여지 없이 옳은가(선행사가 둘로 읽히거나 원문 자체가 논쟁적인 자리는 정답으로도 미끼로도 쓰지 않는다). 해설·오답 해설이 서술하는 구조가 실제 지문에 그대로 있는가.

${POINT_CODES}

${QUOTE_RULES}

${PLAN_SECTION}

${OUTPUT_FORMAT}

## 지문
${passage}`;
}

// ── 설계메모 절단 ─────────────────────────────────────────────────────────────

/** 출력 최상단 설계메모를 잘라 "밑줄지문:"부터 반환(파서·저장용). 마커가 없으면 원문 그대로. */
export function stripGrammarKillerV2Plan(text: string): string {
  const i = text.indexOf("밑줄지문:");
  return i > 0 ? text.slice(i) : text;
}

// ── 인용-앵커 처리(분리·게이트) ───────────────────────────────────────────────

const QUOTE_RE = /^원문\s*[「"']([\s\S]+?)[」"']\s*분석\s*[:：]\s*([\s\S]+)$/;

/** "바로 앞의 X" 주장 대조 — reference 에서 target 직전 1~2토큰과 대조.
 * 관사(the/a/an)는 주장 단어 추출에서 건너뛴다(O222 오탐: "바로 앞의 the X"). */
function checkImmediatelyBefore(
  analysis: string,
  target: string,
  reference: string,
  where: string,
): string | null {
  const m = analysis.match(
    /바로 앞(?:의|에 있는)?\s*(?:(?:단수|복수)\s*)?(?:명사(?:구)?|대명사|주어)?\s*((?:(?:the|a|an)\s+)*)([A-Za-z][A-Za-z'-]*)/i,
  );
  if (!m) return null;
  const claimed = m[2].toLowerCase();
  if (["the", "a", "an"].includes(claimed)) return null; // 안전망
  const norm = normalizeWs(reference);
  const idx = norm.toLowerCase().indexOf(normalizeWs(target).toLowerCase());
  if (idx <= 0) return null;
  const before = norm
    .slice(0, idx)
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((t) => t.replace(/[^A-Za-z'-]/g, "").toLowerCase());
  if (!before.includes(claimed)) {
    return `${where}: 분석의 "바로 앞의 ${m[3] ?? m[2]}"가 실제 어순과 다름(직전: ${before.join(" ")})`;
  }
  return null;
}

export interface GrammarKillerV2QuoteResult {
  question: MdGrammarQuestion;
  issues: string[];
  quotes: Record<string, string>;
}

/** 해설·오답의 인용을 검증·절단한다 — 파싱(재번호·스냅) 직후, gateMdQuestion 이전/이후
 * 어느 시점이든 무방하나 반려 사유 병합을 위해 게이트와 같은 층에서 호출한다.
 * 해설 인용의 대조 기준은 **표시 지문**(마커 제거, 정답 자리 = 오형)이다. */
export function processGrammarKillerV2Quotes(
  q: MdGrammarQuestion,
  passage: string,
): GrammarKillerV2QuoteResult {
  const displayed = (q.markedPassage ?? "").replace(
    /\[\[([A-J]):([\s\S]*?)\]\]/g,
    "$2",
  );
  const issues: string[] = [];
  const quotes: Record<string, string> = {};

  const cleanedWrong = q.wrong.map((w) => {
    const m = w.text.match(QUOTE_RE);
    if (!m) {
      issues.push(`오답 ${w.label}: 인용-분석 형식 위반(원문「…」 분석: 필요)`);
      return w;
    }
    const quote = m[1].trim();
    const analysis = m[2].trim();
    quotes[w.label] = quote;
    if (
      !normalizeWs(passage).includes(normalizeWs(quote)) &&
      !normalizeWs(displayed).includes(normalizeWs(quote))
    ) {
      issues.push(`오답 ${w.label}: 인용이 지문 축자가 아님("${quote.slice(0, 50)}…")`);
    }
    const mk = q.marks.find((x) => x.label === w.label);
    if (mk && !normalizeWs(quote).includes(normalizeWs(mk.shown))) {
      issues.push(`오답 ${w.label}: 인용에 밑줄 표현("${mk.shown}")이 없음`);
    }
    if (mk) {
      const posIssue = checkImmediatelyBefore(analysis, mk.shown, displayed, `오답 ${w.label}`);
      if (posIssue) issues.push(posIssue);
    }
    return { ...w, text: analysis };
  });

  let explanation = q.explanation;
  const em = explanation.match(QUOTE_RE);
  if (!em) {
    issues.push("해설: 인용-분석 형식 위반(원문「…」 분석: 필요)");
  } else {
    const quote = em[1].trim();
    const analysis = em[2].trim();
    quotes["해설"] = quote;
    if (!normalizeWs(displayed).includes(normalizeWs(quote))) {
      issues.push(`해설: 인용이 표시 지문 축자가 아님("${quote.slice(0, 50)}…")`);
    }
    const ansMark = q.marks.find((x) => x.label === (q.answer ?? q.answers?.[0]));
    if (ansMark && !normalizeWs(quote).includes(normalizeWs(ansMark.shown))) {
      issues.push(`해설: 인용에 정답 밑줄 표현("${ansMark.shown}")이 없음`);
    }
    if (ansMark) {
      const posIssue = checkImmediatelyBefore(analysis, ansMark.shown, displayed, "해설");
      if (posIssue) issues.push(posIssue);
    }
    explanation = analysis;
  }

  return { question: { ...q, wrong: cleanedWrong, explanation }, issues, quotes };
}

// ── 스트리밍 표시 필터 ────────────────────────────────────────────────────────
//
// v2 출력에는 학생에게 보이면 안 되는 두 가지가 섞여 있다: ① 최상단 설계메모
// ② 해설·오답 줄의 원문「…」 인용. 파서·저장은 위 함수들이 처리하지만, md 레인은
// 원시 델타를 그대로 클라에 방류하므로 표시 계층에서도 걸러야 한다.
// 전략: "밑줄지문:" 등장 전까지 전부 억제 → 이후는 줄 단위 상태기계 —
// 줄 머리가 "해설:"/"(X)"로 판별되면 그 줄만 보류 후 인용 절단해 방출, 그 외
// (지문 단락 등 긴 줄)는 즉시 통과시켜 스트리밍 체감을 보존한다.

const HOLD_HEAD_RE = /^(해설\s*:|\([A-J]\))/;
const HOLD_DECIDE_LEN = 6;

export class GrammarKillerV2DisplayFilter {
  private readonly emit: (text: string) => void;
  private started = false;
  private pre = "";
  private line = "";
  private mode: "deciding" | "hold" | "pass" = "deciding";

  constructor(emit: (text: string) => void) {
    this.emit = emit;
  }

  push(delta: string): void {
    if (!this.started) {
      this.pre += delta;
      const i = this.pre.indexOf("밑줄지문:");
      if (i < 0) return;
      this.started = true;
      const rest = this.pre.slice(i);
      this.pre = "";
      this.feed(rest);
      return;
    }
    this.feed(delta);
  }

  /** 스트림 종료 시 잔여 버퍼 방출. */
  flush(): void {
    if (!this.started) {
      // 설계메모 마커가 없던 비정형 출력 — 표시 유실 방지 위해 원문 방출.
      if (this.pre) this.emit(this.pre);
      this.pre = "";
      return;
    }
    if (this.line) {
      this.emit(this.mode === "hold" ? transformQuoteLine(this.line) : this.line);
      this.line = "";
    }
    this.mode = "deciding";
  }

  private feed(text: string): void {
    let rest = text;
    for (;;) {
      const nl = rest.indexOf("\n");
      const chunk = nl < 0 ? rest : rest.slice(0, nl);
      if (chunk) this.consume(chunk);
      if (nl < 0) return;
      // 줄 종료 — 보류분 방출.
      if (this.mode === "hold") {
        this.emit(transformQuoteLine(this.line) + "\n");
      } else if (this.mode === "deciding") {
        this.emit(this.line + "\n");
      } else {
        this.emit("\n");
      }
      this.line = "";
      this.mode = "deciding";
      rest = rest.slice(nl + 1);
    }
  }

  private consume(chunk: string): void {
    if (this.mode === "pass") {
      this.emit(chunk);
      return;
    }
    this.line += chunk;
    if (this.mode === "hold") return;
    // deciding: 줄 머리가 판별될 만큼 쌓이면 hold/pass 결정.
    if (HOLD_HEAD_RE.test(this.line)) {
      this.mode = "hold";
      return;
    }
    if (this.line.length >= HOLD_DECIDE_LEN && !couldBecomeHoldHead(this.line)) {
      this.mode = "pass";
      this.emit(this.line);
      this.line = "";
    }
  }
}

function couldBecomeHoldHead(line: string): boolean {
  return "해설:".startsWith(line) || /^\([A-J]?$/.test(line);
}

/** 해설/오답 줄에서 원문「…」 인용부를 잘라 표시용 텍스트로. */
export function transformQuoteLine(line: string): string {
  return line.replace(/원문\s*[「"'][\s\S]*?[」"']\s*분석\s*[:：]\s*/, "");
}
