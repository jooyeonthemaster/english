// luna 문제생성 레인 (26-08-14, O217 확증런 근거 시공).
//
// md-stream 레인의 표준형 2유형(단일 빈칸 · 어법 5마커 1정답)을 gpt-5.6-luna 로
// 생성한다. 구조(과금·저장·게이트·재생성 정책·SSE 계약)는 gemini 레인과 동일하고,
// 차이는 ① 출력이 json_schema strict(md 규격은 luna 크립토나이트 — O215)
// ② OpenAI 공급자 고정(Azure 폴백 ~10배 이중가격 — O214) ③ 출력 전 자가 검산
// 블록(어법 F 30%→5.3% 소멸의 주역 — O217 R2) ④ 라벨 등장순 재번호·마커 자동삽입
// 결정형 코어스뿐이다.
//
// 실측 근거(luna-bench-20260814/REPORT-v2.md): 빈칸 F 0/20(g36 1/20)·₩6.9(1/4.3),
// 어법 검산v2 F 1/19(g36 10%)·₩9.1(1/4.8), 사고 델타 스트리밍 성립(첫 2.4~8.4s).
// 속도는 g36 대비 2~2.3배(68~89s) — 사용자 수용(26-08-14 "원가 10원 이하면 무조건").
//
// 26-08-19 상태 반전(O226, 사용자 "전 라인업 3.7 통일"): luna 레인은 기본
// **비활성**이고 env QGEN_LUNA_LANE=on 일 때만 켜진다(비상 복귀 노브). 근거:
// INT paired 50:25 로 3.7 우세·원가 동급(₩11.6 vs 12.2)·속도 2.3배·지칭 luna
// 사고 팽창 잡실패 4/20. 위 26-08-14 실측은 당시 g36 대비 수치의 사료다.
// 모델 오버라이드: env LUNA_QGEN_MODEL_ID.

import {
  wordBoundaryRegex,
  type MdBlankQuestion,
  type MdGrammarQuestion,
  type MdMultiBlankQuestion,
} from "./parser";

export const LUNA_QGEN_MODEL_ID =
  process.env.LUNA_QGEN_MODEL_ID?.trim() || "openai/gpt-5.6-luna";

/** 사고+출력 공유 상한. 20k 는 사고가 10k+ 로 팽창해 시간 2배(O217 프로브) — 14k 고정. */
export const LUNA_QGEN_MAX_TOKENS = 14_000;

/** luna 레인 적격 판정 — 정본 2유형의 전 형식(단일·다중 빈칸, 어법 표준·비표준).
 * 신형(lane-registry) 유형은 luna-ext-registry 가 별도 담당한다. KO 지문·범위 밖
 * 설정은 호출측이 이미 거른다. (26-08-14 확장: 다중 빈칸 2~3·어법 5~10마커 K정답) */
export function isLunaQgenEligible(args: {
  subType: string;
  blankCount: number;
  markerCount: number;
  answerCount: number;
  hasMdLane: boolean;
}): boolean {
  // 26-08-19 전 라인업 3.7 통일(사용자 결정, O226): luna 레인은 **옵트인**으로
  // 반전 — QGEN_LUNA_LANE=on 일 때만 활성(비상 복귀 노브). 코드·게이트·브릿지는
  // 전부 보존한다. 근거: INT paired 50:25 3.7 우세·원가 동급·지칭 luna 병리.
  if (process.env.QGEN_LUNA_LANE?.trim().toLowerCase() !== "on") return false;
  if (args.hasMdLane) return false;
  if (args.subType === "BLANK_INFERENCE")
    return args.blankCount >= 1 && args.blankCount <= 3;
  if (args.subType === "GRAMMAR_ERROR")
    return (
      args.markerCount >= 5 &&
      args.markerCount <= 10 &&
      args.answerCount >= 1 &&
      args.answerCount <= args.markerCount
    );
  return false;
}

/** 형식 지시 충돌 해소 — md 규격 지시는 무시하고 내용 요구만 따르게 한다(O215). */
export const LUNA_QGEN_SYSTEM_MESSAGE =
  "출제 지시문 안의 출력 형식(마크다운 섹션 규격)은 무시하고, 내용 요구사항(문항 설계·품질 기준·해설 요건)만 전부 따르라. 출력은 반드시 지정된 JSON 스키마 하나다.";

// ── json_schema (md 파서 산출물과 동형 — 이후 스냅·게이트·어댑터 무수정 재사용) ──

export const LUNA_GRAMMAR_JSON_SCHEMA = {
  name: "grammar_killer_item",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["markedPassage", "marks", "answer", "fix", "explanation", "wrong"],
    properties: {
      markedPassage: {
        type: "string",
        description:
          "지문 전체를 원문 그대로 복사하되, 밑줄 5곳을 [[A:표현]] [[B:표현]] [[C:표현]] [[D:표현]] [[E:표현]] 인라인 마커로 감싼 것. 마커 밖 텍스트는 원문과 한 글자도 달라선 안 되고, 마커는 반드시 5개 전부 본문 안에 있어야 한다. 마커는 지문 등장 순서대로 A→E.",
      },
      marks: {
        type: "array",
        minItems: 5,
        maxItems: 5,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label", "shown", "original", "code"],
          properties: {
            label: { type: "string", enum: ["(A)", "(B)", "(C)", "(D)", "(E)"] },
            shown: { type: "string", description: "지문에 표시된 형태(정답 밑줄은 틀린 형태)" },
            original: {
              type: "string",
              description: "어법상 옳은 원형(정답이 아닌 밑줄은 shown 과 동일)",
            },
            code: { type: "string", description: "포인트 코드 a~m 한 글자" },
          },
        },
      },
      answer: {
        type: "string",
        enum: ["(A)", "(B)", "(C)", "(D)", "(E)"],
        description: "어법상 틀린 밑줄",
      },
      fix: { type: "string", description: "정답 밑줄의 고침(옳은 형태)" },
      explanation: { type: "string", description: "정답 해설(한국어, 합쇼체, 1~2문장) — 밑줄 자리가 어떤 규칙을 어기는지와 고친 형태만" },
      wrong: {
        type: "array",
        minItems: 4,
        maxItems: 4,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label", "text"],
          properties: {
            label: { type: "string", enum: ["(A)", "(B)", "(C)", "(D)", "(E)"] },
            text: {
              type: "string",
              description: "이 밑줄이 어떤 규칙으로 옳은지 딱 1문장(한국어, 합쇼체) — 유혹·심리 서사 금지",
            },
          },
        },
      },
    },
  },
} as const;

export const LUNA_BLANK_JSON_SCHEMA = {
  name: "blank_killer_item",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["originalExpression", "options", "answer", "explanation", "wrong"],
    properties: {
      originalExpression: {
        type: "string",
        description:
          "빈칸으로 뚫을 지문 원문 구간 — 지문에서 복사-붙여넣기한 **연속 축자 부분 문자열**. '[빈칸]' 같은 플레이스홀더·대괄호·말줄임·문장 틀 절대 금지. 지문에 이 문자열이 그대로(따옴표·구두점 포함) 존재해야 한다.",
      },
      options: {
        type: "array",
        minItems: 5,
        maxItems: 5,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label", "text"],
          properties: {
            label: { type: "string", enum: ["①", "②", "③", "④", "⑤"] },
            text: { type: "string", description: "선지 영어 표현" },
          },
        },
      },
      answer: { type: "string", enum: ["①", "②", "③", "④", "⑤"] },
      explanation: { type: "string", description: "정답 해설(한국어, 합쇼체, 1~2문장) — 근거 문장과 정답 도출만" },
      wrong: {
        type: "array",
        minItems: 4,
        maxItems: 4,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label", "text"],
          properties: {
            label: { type: "string", enum: ["①", "②", "③", "④", "⑤"] },
            text: {
              type: "string",
              description: "이 오답이 왜 탈락인지 딱 1문장(한국어, 합쇼체) — 매력 이유·기제 이름 서술 금지",
            },
          },
        },
      },
    },
  },
} as const;

// ── 출력 전 자가 검산 블록 (O217 — 어법 F 30%→5.3% 소멸의 주역) ─────────────────

export const LUNA_GRAMMAR_SELFCHECK = [
  // 26-08-18 O223 수술: 종전 "1순위 확정성" 사다리가 KILLER 의 "복잡한 문장에 정답"
  // 지시를 눌러 이겨 앞쪽 안전 자리 편중(앞 20% 밀집 9/20)을 만들었다 — 확정성은
  // 제약으로 강등, 난이도 정합을 목표로 승격. 배치 정량 금지(앞 20%·첫 문장 정답·
  // 뒤쪽 비움)는 종전 gemini 전용 절의 luna 이식.
  "## 규칙 충돌 시 우선순위 (필수 — 지시가 서로 부딪히면 이 사다리를 따르라)",
  "- 확정성(시비 없는 지점)은 **제약**이다: 아래 금지 목록에 걸리는 자리는 어떤 경우에도 쓰지 마라. 기출 형식(단어 단위 밑줄·위치 분산)도 양보 불가다.",
  "- 그 제약 안에서는 **요청된 난이도에 맞는 자리**가 목표다. '시비가 없다'는 이유로 요청 난이도보다 얕고 안전한 자리(지문 앞쪽 정형 자리)로 후퇴하는 것은 실패다 — 확정적이면서 난이도에 맞는 자리는 거의 모든 지문에 있다.",
  "- 전부를 동시에 만족할 수 없으면 **포인트 다양성부터 양보하라**(같은 포인트 코드 2회까지 허용된다).",
  "",
  "## 밑줄 형식 — 단어 단위 (필수)",
  "- 밑줄은 **판정을 결정짓는 핵심 단어 1개**에 긋는 것이 기출 관행이다(예: producing / was / differentiates / What / responsible). 조동사+원형처럼 불가피할 때만 2단어까지 허용된다.",
  "- 3단어 이상 구·절 밑줄(예: 'trying to solve', 'which already know')은 기계 검사에서 자동 반려된다 — 같은 포인트라도 핵심 단어 하나로 좁혀 그어라.",
  "",
  "## 밑줄 위치 분산 (필수)",
  "- 밑줄 5곳은 서로 다른 문장에, 지문 앞·중·뒤로 고르게 분산하라(지문 문장 수가 5개 미만이면 문장당 최대 2개까지 허용 — 대신 같은 문장 안 두 밑줄은 서로 다른 절에 두어라). 지문 앞 20% 구간에 밑줄을 2개 이상 몰지 말고, 지문 뒤쪽 절반의 문장들을 통째로 비워 두지 마라. 지문 첫 문장에 정답을 두지 마라.",
  "- 한 동사구·한 구(phrase)를 쪼개 밑줄 두 개를 만들지 마라 — 인접 밑줄(사이에 단어 3개 미만)은 기계 검사에서 자동 반려된다.",
  "",
  "## 밑줄 표적 선정 금지 규칙 (필수)",
  "- 표준 학교문법 기준으로 옳고 그름 판정이 **확정적인 지점만** 밑줄로 써라(정답·오답 밑줄 모두).",
  "- 금지: 고어체·문어체 잔존형(예: 'whatever source it be derived' 같은 가정법 잔존), 대시/삽입구·등위 접속(and)으로 주어 해석이 갈려 수일치 판정이 논쟁이 되는 지점, 관계절 선행사가 중의적이어서 단·복수 판단이 갈리는 지점, 학자·교재마다 견해가 갈리는 지점.",
  "- 자기 검사: 각 밑줄에 대해 '상위권 학생이나 동료 교사가 이 판정에 이의를 제기할 수 있는가?'를 물어라. 이의 여지가 있으면 그 자리를 버리고 확정적인 다른 지점으로 교체하라.",
  "",
  "## 해설 사실성 검산 (필수)",
  "- 해설·오답 해설에서 지문 구조(선행사 위치, 주어의 핵, 수식 관계)를 서술할 때는 실제 지문을 다시 읽고 **사실만** 써라.",
  "- '바로 앞의 명사가 아니라 멀리 있는 선행사 X' 같은 상투 문구를 실제 위치 확인 없이 쓰지 마라 — 선행사가 바로 앞이면 '바로 앞의 X'라고 써라. 지문에 없는 구조를 지어내면 반려된다.",
  "- 문법 용어를 정확히 써라(예: what 은 선행사를 **포함하는** 관계대명사다 — 정의를 뒤집어 쓰면 반려된다). 학생의 오인 시나리오는 실제로 성립하는 것만 써라 — 수 표지가 없는 단어를 수일치 유혹의 근거로 지목하거나, 성립하지 않는 '~로 고치고 싶어진다'를 지어내지 마라.",
  "",
  "## 출력 전 자가 검산 (필수 — 하나라도 어기면 기계 검사에서 자동 반려된다)",
  "- markedPassage 안에 [[A: [[B: [[C: [[D: [[E: 마커가 **5개 전부** 있는지 세어라 — marks 배열에만 있고 본문에 마커가 빠지면 반려된다.",
  "- markedPassage 에서 마커 5개를 각 밑줄의 원형(original)으로 되돌려 이어 붙이면 소스 지문과 한 글자도 다르지 않아야 한다(공백·따옴표·구두점 포함). 출력 직전 실제로 재구성해 대조하라.",
  "- 마커 라벨은 지문 등장 순서대로 (A)→(E) 다.",
  "- 정답 밑줄 1개만 shown≠original(틀린 형태로 변형), 나머지 4개는 shown 과 original 이 완전히 동일해야 한다.",
  "- 해설과 오답 해설의 문체는 합쇼체(-습니다)로 통일하라 — 반말('~한다')과 섞지 마라.",
  "- 해설 분량: 정답 해설 1~2문장(어떤 규칙을 어기는지·고친 형태), 오답 해설 딱 1문장(어떤 규칙으로 옳은지). \"~로 잘못 고치고 싶어진다\"·\"~와 헷갈리기 쉽다\" 같은 유혹·심리 서사는 쓰지 마라 — 짧을수록 좋다.",
].join("\n");

export const LUNA_BLANK_SELFCHECK = [
  "## 출력 전 자가 검산 (필수 — 하나라도 어기면 기계 검사에서 자동 반려된다)",
  "- originalExpression 은 지문에서 복사-붙여넣기한 연속 축자 부분 문자열이어야 한다. '[빈칸]'·대괄호·말줄임·문장 틀을 절대 넣지 마라. 출력 직전, 그 문자열을 지문에서 그대로 검색해 존재를 확인하라(따옴표·구두점까지 원문 그대로).",
  "- 해설·오답 해설은 지문을 다시 읽고 **사실만** 써라 — 지문에 없는 내용·구조·논리 관계를 지어내면 반려된다. 오답의 함정 기제 서술도 실제로 성립하는 것만.",
  "- 해설 분량: 정답 해설 1~2문장(근거 문장·정답 도출), 오답 해설 딱 1문장(왜 탈락인지). 매력 이유·기제 이름·학생 심리 서사는 쓰지 마라 — 짧을수록 좋다.",
  "- 정답 선지를 빈칸 자리에 끼운 완성문이 자연스럽고 원문과 논리 등가(축소·과장·반전 없음)인지 소리 내어 검산하라.",
  "- 오답 4개는 정답과 형식·길이·추상 층위가 평행하되 논리적으로 성립하지 않아야 한다 — 오답이 문맥상 성립 가능하면 정답 시비가 난다.",
  "- 해설과 오답 해설의 문체는 합쇼체(-습니다)로 통일하라 — 반말('~한다')과 섞지 마라.",
].join("\n");

// ── JSON → Md*Question 어댑트 + 결정형 코어스 ────────────────────────────────

/** 라벨 등장순 재번호(0원 결정형, O215 잔여 과제) — markedPassage 의 [[X: 등장
 * 순서대로 marks 를 정렬해 A→E 로 다시 붙이고 answer/answers/fixes/wrong 을 동기
 * 치환한다. 이미 등장순이면 무변화. */
export function renumberGrammarByAppearance(q: MdGrammarQuestion): {
  question: MdGrammarQuestion;
  renumbered: boolean;
} {
  if (!q.markedPassage || !Array.isArray(q.marks)) return { question: q, renumbered: false };
  const mp0 = q.markedPassage;
  const positions = q.marks.map((mark) => ({
    mark,
    pos: mp0.indexOf(`[[${mark.label.replace(/[()]/g, "")}:`),
  }));
  if (positions.some((p) => p.pos < 0)) return { question: q, renumbered: false };
  const sorted = [...positions].sort((a, b) => a.pos - b.pos);
  const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
  // "이미 등장순"은 라벨 시퀀스로 판정한다 — 배열 순서가 등장순이어도 라벨이
  // 뒤집혀 있으면(예: 첫 밑줄이 (D)) 재번호 대상이다.
  if (sorted.every((p, i) => p.mark.label === `(${LETTERS[i]})`))
    return { question: q, renumbered: false };
  const relabel = new Map<string, string>();
  sorted.forEach((p, i) => relabel.set(p.mark.label, `(${LETTERS[i]})`));
  // 마커 문자 치환은 임시 토큰 경유 2단계 — (A)↔(B) 맞교환에서의 자기충돌 방지.
  let mp = mp0;
  for (const [oldLabel] of relabel) {
    const letter = oldLabel.replace(/[()]/g, "");
    mp = mp.replace(new RegExp(`\\[\\[${letter}:`, "g"), `[[TMP_${letter}:`);
  }
  for (const [oldLabel, newLabel] of relabel) {
    mp = mp.replace(
      new RegExp(`\\[\\[TMP_${oldLabel.replace(/[()]/g, "")}:`, "g"),
      `[[${newLabel.replace(/[()]/g, "")}:`,
    );
  }
  const mapLabel = (l: string) => relabel.get(l) ?? l;
  const fixes: Record<string, string> = {};
  for (const [k, v] of Object.entries(q.fixes ?? {})) fixes[mapLabel(k)] = v;
  return {
    question: {
      ...q,
      markedPassage: mp,
      marks: sorted.map((p, i) => ({ ...p.mark, label: `(${LETTERS[i]})` })),
      answer: mapLabel(q.answer),
      answers: (q.answers ?? [q.answer]).map(mapLabel),
      fixes,
      wrong: (q.wrong ?? []).map((w) => ({ ...w, label: mapLabel(w.label) })),
    },
    renumbered: true,
  };
}

/** 마커 존재 결정형 코어스 — marks 배열에는 있는데 markedPassage 본문에서 빠진
 * **비정답** 마커(shown=original)를 인접 마커 사이 구간에서 단어 경계로 유일
 * 확정해 삽입한다(O217 R1 게이트 사각 G25·G31 계통의 "고쳐서 살린다" 안전판).
 * 유일 확정 실패·정답 마커 누락은 이슈로 남겨 게이트 반려(재생성)로 보낸다. */
export function ensureGrammarMarkersPresent(q: MdGrammarQuestion): {
  question: MdGrammarQuestion;
  issues: string[];
  inserted: string[];
} {
  const issues: string[] = [];
  const inserted: string[] = [];
  let mp = q.markedPassage ?? "";
  if (!mp) return { question: q, issues, inserted };
  // 비표준(마커 5~10)까지 커버 — (A)~(J).
  const letters: string[] = [...GRAMMAR_LETTERS];
  const missing = q.marks.filter(
    (m) => !mp.includes(`[[${m.label.replace(/[()]/g, "")}:`),
  );
  for (const m of missing) {
    const letter = m.label.replace(/[()]/g, "");
    if (m.shown !== m.original) {
      issues.push(`${m.label} 마커가 markedPassage에 없음(정답 밑줄 — 자동수리 불가)`);
      continue;
    }
    const idxOf = (l: string) => mp.indexOf(`[[${l}:`);
    const li = letters.indexOf(letter);
    const prevIdx = letters
      .slice(0, li)
      .map(idxOf)
      .filter((i) => i >= 0)
      .pop();
    let nextIdx: number | undefined;
    for (const l of letters.slice(li + 1)) {
      const i = idxOf(l);
      if (i >= 0) {
        nextIdx = i;
        break;
      }
    }
    const lo = prevIdx != null ? prevIdx : 0;
    const hi = nextIdx != null ? nextIdx : mp.length;
    const segment = mp.slice(lo, hi);
    const matches = [...segment.matchAll(wordBoundaryRegex(m.original))].filter(
      (mm) => !segment.slice(Math.max(0, (mm.index ?? 0) - 12), mm.index ?? 0).includes("[["),
    );
    if (matches.length !== 1) {
      issues.push(
        `${m.label} 마커가 markedPassage에 없음(자동삽입 위치 ${matches.length}곳 — 유일 확정 실패)`,
      );
      continue;
    }
    const at = lo + (matches[0].index ?? 0);
    const len = matches[0][0].length;
    mp = `${mp.slice(0, at)}[[${letter}:${mp.slice(at, at + len)}]]${mp.slice(at + len)}`;
    inserted.push(m.label);
  }
  return { question: { ...q, markedPassage: mp }, issues, inserted };
}

/** luna JSON 출력 → MdGrammarQuestion (재번호 + 마커 코어스 포함).
 * 반환 issues 는 게이트 이슈 배열 앞에 합류시켜 재생성 피드백으로 보낸다. */
export function adaptLunaGrammarJson(text: string): {
  question: MdGrammarQuestion;
  issues: string[];
  renumbered: boolean;
  markerInserted: string[];
} {
  const raw = JSON.parse(text) as {
    markedPassage: string;
    marks: Array<{ label: string; shown: string; original: string; code: string }>;
    answer: string;
    fix: string;
    explanation: string;
    wrong: Array<{ label: string; text: string }>;
  };
  let q: MdGrammarQuestion = {
    kind: "grammar",
    marks: raw.marks.map((m) => ({ ...m, anchor: undefined })),
    markedPassage: raw.markedPassage,
    answer: raw.answer,
    answers: [raw.answer],
    fix: raw.fix,
    fixes: { [raw.answer]: raw.fix },
    explanation: raw.explanation,
    // 라벨 오름차순 정렬(표시 결정론) — 모델 출력 순서가 ⑤③④② 처럼 뒤섞여
    // 나오는 실사용 신고의 0원 봉합.
    wrong: [...raw.wrong].sort((a, b) => a.label.localeCompare(b.label)),
  };
  const rn = renumberGrammarByAppearance(q);
  q = rn.question;
  const em = ensureGrammarMarkersPresent(q);
  return {
    question: em.question,
    issues: em.issues,
    renumbered: rn.renumbered,
    markerInserted: em.inserted,
  };
}

// ── 확장형 ①: 어법 비표준 (마커 5~10 · 정답 1~N) — 26-08-14 캠페인 ────────────
// 검증된 5·1 상수(위)는 바이트 불변으로 두고, 비표준은 동적 빌더를 쓴다.

const GRAMMAR_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"] as const;

export function buildLunaGrammarJsonSchemaNK(
  markerCount: number,
  answerCount: number,
) {
  const labels = GRAMMAR_LETTERS.slice(0, markerCount).map((l) => `(${l})`);
  const markerList = GRAMMAR_LETTERS.slice(0, markerCount)
    .map((l) => `[[${l}:표현]]`)
    .join(" ");
  const wrongNeeded = markerCount - answerCount;
  return {
    name: "grammar_nk_item",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["markedPassage", "marks", "answers", "fixes", "explanation", "wrong"],
      properties: {
        markedPassage: {
          type: "string",
          description: `지문 전체를 원문 그대로 복사하되, 밑줄 ${markerCount}곳을 ${markerList} 인라인 마커로 감싼 것. 마커 밖 텍스트는 원문과 한 글자도 달라선 안 되고, 마커는 ${markerCount}개 전부 본문 안에 지문 등장 순서대로 있어야 한다.`,
        },
        marks: {
          type: "array",
          minItems: markerCount,
          maxItems: markerCount,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["label", "shown", "original", "code"],
            properties: {
              label: { type: "string", enum: labels },
              shown: { type: "string", description: "지문에 표시된 형태(정답 밑줄은 틀린 형태)" },
              original: { type: "string", description: "어법상 옳은 원형(정답이 아닌 밑줄은 shown 과 동일)" },
              code: { type: "string", description: "포인트 코드 a~m 한 글자" },
            },
          },
        },
        answers: {
          type: "array",
          minItems: answerCount,
          maxItems: answerCount,
          items: { type: "string", enum: labels },
          description: `어법상 틀린 밑줄 라벨 정확히 ${answerCount}개`,
        },
        fixes: {
          type: "array",
          minItems: answerCount,
          maxItems: answerCount,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["label", "fix"],
            properties: {
              label: { type: "string", enum: labels },
              fix: { type: "string", description: "그 정답 밑줄의 고침(옳은 형태 = 원문 축자)" },
            },
          },
        },
        explanation: { type: "string", description: "정답 해설(한국어, 합쇼체) — 정답 라벨당 1문장, 어떤 규칙을 어기는지와 고친 형태만" },
        wrong: {
          type: "array",
          minItems: wrongNeeded,
          maxItems: wrongNeeded,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["label", "text"],
            properties: {
              label: { type: "string", enum: labels },
              text: { type: "string", description: "이 밑줄이 어떤 규칙으로 옳은지 딱 1문장(한국어, 합쇼체) — 유혹·심리 서사 금지" },
            },
          },
        },
      },
    },
  } as const;
}

export function buildLunaGrammarSelfcheckNK(
  markerCount: number,
  answerCount: number,
): string {
  const markerRun = GRAMMAR_LETTERS.slice(0, markerCount)
    .map((l) => `[[${l}:`)
    .join(" ");
  return [
    "## 규칙 충돌 시 우선순위 (필수 — 지시가 서로 부딪히면 이 사다리를 따르라)",
    "- 확정성(시비 없는 지점)은 **제약**이다: 판정이 갈리는 자리는 어떤 경우에도 쓰지 마라. 기출 형식(단어 단위 밑줄·위치 분산)도 양보 불가다.",
    "- 그 제약 안에서는 **요청된 난이도에 맞는 자리**가 목표다. '시비가 없다'는 이유로 요청 난이도보다 얕고 안전한 자리(지문 앞쪽 정형 자리)로 후퇴하는 것은 실패다.",
    "- 전부를 동시에 만족할 수 없으면 **포인트 다양성부터 양보하라**(같은 포인트 코드 2회까지 허용).",
    "",
    "## 밑줄 형식 (필수)",
    "- 밑줄은 판정을 결정짓는 **핵심 단어 1개**가 원칙(불가피할 때만 2단어). 3단어 이상 구·절 밑줄은 자동 반려된다.",
    `- 밑줄 ${markerCount}곳은 서로 다른 문장에, 지문 앞·중·뒤로 고르게 분산하라(지문 문장 수가 밑줄 수보다 적으면 문장당 최대 2개, 서로 다른 절에) — 지문 앞 20% 구간에 2개 이상 몰지 말고, 뒤쪽 절반을 통째로 비우지 말며, 같은 문장 안 인접 밑줄(사이 단어 3개 미만)은 자동 반려된다. 지문 첫 문장에 정답을 두지 마라.`,
    "- 고어체·삽입구/등위 접속으로 판정이 갈리는 지점·선행사 중의 지점은 밑줄(정답·오답 모두)로 쓰지 마라.",
    "",
    "## 출력 전 자가 검산 (필수 — 하나라도 어기면 기계 검사에서 자동 반려된다)",
    `- markedPassage 안에 ${markerRun} 마커가 ${markerCount}개 전부, 지문 등장 순서대로 있는지 세어라.`,
    "- markedPassage 의 마커를 각 밑줄의 원형(original)으로 되돌려 이어 붙이면 소스 지문과 한 글자도 다르지 않아야 한다 — 출력 직전 실제로 재구성해 대조하라.",
    `- 정답 밑줄 ${answerCount}개만 shown≠original(틀린 형태), 나머지 ${markerCount - answerCount}개는 shown=original 완전 동일. answers 라벨 집합과 변형된 밑줄 집합이 정확히 일치해야 한다.`,
    answerCount >= 2
      ? `- 정답 ${answerCount}곳은 서로 다른 문장에, 서로 다른 문법 포인트로 흩어 놓아라 — 한 문장을 해부하면 정답 두 개가 같이 나오는 배치는 금지.`
      : "",
    "- fixes 의 각 fix 는 그 라벨의 original 과 동일해야 한다(원문 복원형).",
    "- 해설·오답 해설의 구조 서술(선행사·주어 핵)은 실제 지문을 다시 읽고 사실만 써라. 문법 용어는 정확히(정의를 뒤집으면 반려된다), 학생 오인 시나리오는 실제로 성립하는 것만. 문체는 합쇼체(-습니다) 통일.",
    "- 해설 분량: 정답 해설은 라벨당 1문장(어떤 규칙을 어기는지·고친 형태), 오답 해설 딱 1문장(어떤 규칙으로 옳은지). 유혹·심리 서사는 쓰지 마라 — 짧을수록 좋다.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** 비표준 어법 JSON → MdGrammarQuestion (answers/fixes 배열 계약). */
export function adaptLunaGrammarJsonNK(text: string): {
  question: MdGrammarQuestion;
  issues: string[];
  renumbered: boolean;
  markerInserted: string[];
} {
  const raw = JSON.parse(text) as {
    markedPassage: string;
    marks: Array<{ label: string; shown: string; original: string; code: string }>;
    answers: string[];
    fixes: Array<{ label: string; fix: string }>;
    explanation: string;
    wrong: Array<{ label: string; text: string }>;
  };
  const fixes: Record<string, string> = {};
  for (const f of raw.fixes ?? []) fixes[f.label] = f.fix;
  const answers = [...(raw.answers ?? [])];
  let q: MdGrammarQuestion = {
    kind: "grammar",
    marks: raw.marks.map((m) => ({ ...m, anchor: undefined })),
    markedPassage: raw.markedPassage,
    answer: answers[0] ?? "",
    answers,
    fix: fixes[answers[0] ?? ""] ?? "",
    fixes,
    explanation: raw.explanation,
    wrong: [...(raw.wrong ?? [])].sort((a, b) => a.label.localeCompare(b.label)),
  };
  const rn = renumberGrammarByAppearance(q);
  q = rn.question;
  const em = ensureGrammarMarkersPresent(q);
  return {
    question: em.question,
    issues: em.issues,
    renumbered: rn.renumbered,
    markerInserted: em.inserted,
  };
}

// ── 확장형 ②: 다중 빈칸 조합형 (blankCount 2~3) — 26-08-14 캠페인 ─────────────

const MULTIBLANK_LABELS = ["(A)", "(B)", "(C)"] as const;
const MULTIBLANK_CIRCLED = ["①", "②", "③", "④", "⑤"] as const;
/** 조합 선지 값 구분자 — parser.ts parseMdMultiBlank 계약 리터럴(공백+…+…+공백). */
export const MULTIBLANK_VALUE_SEPARATOR = " …… ";

export function buildLunaMultiBlankJsonSchema(blankCount: 2 | 3) {
  const labels = MULTIBLANK_LABELS.slice(0, blankCount);
  return {
    name: "multi_blank_item",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["blanks", "options", "answer", "explanation", "wrong"],
      properties: {
        blanks: {
          type: "array",
          minItems: blankCount,
          maxItems: blankCount,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["label", "expression"],
            properties: {
              label: { type: "string", enum: labels },
              expression: {
                type: "string",
                description:
                  "빈칸으로 뚫을 지문 원문 구 — 지문에서 복사-붙여넣기한 연속 축자 부분 문자열(플레이스홀더·대괄호 금지). 라벨은 지문 등장 순서대로.",
              },
            },
          },
        },
        options: {
          type: "array",
          minItems: 5,
          maxItems: 5,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["label", "blankValues"],
            properties: {
              label: { type: "string", enum: MULTIBLANK_CIRCLED },
              blankValues: {
                type: "array",
                minItems: blankCount,
                maxItems: blankCount,
                items: { type: "string" },
                description: "빈칸 (A)→ 순서대로의 값 — 각 값은 그 자리 문법 슬롯에 그대로 꽂혀야 한다",
              },
            },
          },
        },
        answer: { type: "string", enum: MULTIBLANK_CIRCLED },
        explanation: { type: "string", description: "정답 해설(한국어, 합쇼체, 2~3문장) — 각 빈칸의 근거 문장과 정답 조합 도출만" },
        wrong: {
          type: "array",
          minItems: 4,
          maxItems: 4,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["label", "text"],
            properties: {
              label: { type: "string", enum: MULTIBLANK_CIRCLED },
              text: { type: "string", description: "이 오답 조합의 어느 빈칸 값이 왜 어긋나는지 딱 1문장(한국어, 합쇼체)" },
            },
          },
        },
      },
    },
  } as const;
}

export function buildLunaMultiBlankSelfcheck(blankCount: 2 | 3): string {
  const labelsRun = MULTIBLANK_LABELS.slice(0, blankCount).join("");
  return [
    "## 출력 전 자가 검산 (필수 — 하나라도 어기면 기계 검사에서 자동 반려된다)",
    `- 빈칸원문 ${blankCount}개는 각각 지문에서 복사-붙여넣기한 연속 축자 부분 문자열이어야 한다 — 출력 직전 지문에서 그대로 검색해 확인하라(따옴표·구두점 포함). '[빈칸]'·대괄호·말줄임 금지.`,
    `- 빈칸 라벨은 지문 등장 순서대로 ${labelsRun} 이고, 빈칸끼리 구간이 겹치면 안 되며 서로 다른 문장에서 골라라.`,
    `- 선지 5개는 각각 값 ${blankCount}개(빈칸 순서대로)를 갖는다. 각 값은 그 빈칸 자리의 문법 슬롯에 그대로 꽂혀 자연스러워야 한다 — 꽂아 읽어 검산하라.`,
    "- 정답 조합은 원문과 논리 등가여야 하고, 오답 조합은 지문 실재 소재로 만들되 최소 1개는 정답에서 딱 한 빈칸만 틀린 near-miss 로 설계하라. 같은 조합 중복 금지.",
    "- 오답 해설 4개는 정답 라벨을 제외한 4개 선지 각각에 있어야 한다.",
    "- 해설 문체는 합쇼체(-습니다) 통일. 해설에서 지문에 없는 내용을 지어내지 마라.",
    "- 해설 분량: 정답 해설 2~3문장(각 빈칸 근거·정답 조합), 오답 해설 딱 1문장(어느 빈칸 값이 왜 어긋나는지). 매력 이유·학생 심리 서사는 쓰지 마라.",
  ].join("\n");
}

/** 다중 빈칸 JSON → MdMultiBlankQuestion — options[].text 는 계약 구분자로 조립한다. */
export function adaptLunaMultiBlankJson(text: string): { question: MdMultiBlankQuestion } {
  const raw = JSON.parse(text) as {
    blanks: Array<{ label: string; expression: string }>;
    options: Array<{ label: string; blankValues: string[] }>;
    answer: string;
    explanation: string;
    wrong: Array<{ label: string; text: string }>;
  };
  return {
    question: {
      kind: "multiBlank",
      blanks: raw.blanks,
      options: raw.options.map((o) => ({
        label: o.label,
        text: o.blankValues.join(MULTIBLANK_VALUE_SEPARATOR),
        blankValues: o.blankValues,
      })),
      answer: raw.answer,
      explanation: raw.explanation,
      wrong: [...(raw.wrong ?? [])].sort((a, b) => a.label.localeCompare(b.label)),
    },
  };
}

/** luna JSON 출력 → MdBlankQuestion. */
export function adaptLunaBlankJson(text: string): { question: MdBlankQuestion } {
  const raw = JSON.parse(text) as {
    originalExpression: string;
    options: Array<{ label: string; text: string }>;
    answer: string;
    explanation: string;
    wrong: Array<{ label: string; text: string }>;
  };
  return {
    question: {
      kind: "blank",
      originalExpression: raw.originalExpression,
      options: raw.options,
      answer: raw.answer,
      explanation: raw.explanation,
      wrong: [...raw.wrong].sort((a, b) => a.label.localeCompare(b.label)),
    },
  };
}
