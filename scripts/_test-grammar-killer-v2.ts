// 어법 KILLER v2 레인 픽스처 (26-08-17 시공 검증) — API 0콜.
// 프롬프트 조립·설계메모 절단·인용 앵커 게이트(정상/위반 5계통/관사 스킵)·표시 필터.
import {
  GrammarKillerV2DisplayFilter,
  buildGrammarKillerV2Prompt,
  isGrammarKillerV2Enabled,
  processGrammarKillerV2Quotes,
  stripGrammarKillerV2Plan,
  transformQuoteLine,
} from "../src/lib/md-qgen/grammar-killer-v2";
import { parseMdGrammar } from "../src/lib/md-qgen/parser";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ── 합성 지문·출력 ───────────────────────────────────────────────────────────
const PASSAGE =
  "He chatters with his fingertips. Betrayal oozes out of him at every pore. " +
  "The students who study hard usually pass the exam. " +
  "What was novel was the connection between the two ideas.";

// 정답 (C) oozes→ooze(가상의 오형), 미끼 3개 — 5마커 규격을 위해 marks 5개 구성.
const MODEL_OUTPUT = `문장1 · oozes · 수일치 · 5단어 · 자연스러움
문장3 · pass · 수일치 · 4단어 · 보통
정답은 문장1 로 선정한다.

밑줄지문:
He chatters with his [[A:fingertips]]. Betrayal [[B:ooze]] out of him at every pore. The [[C:students]] who study hard usually [[D:pass]] the exam. [[E:What]] was novel was the connection between the two ideas.

원형·포인트:
(A) fingertips | g
(B) oozes | d
(C) students | g
(D) pass | d
(E) What | b
정답: (B)
고침: oozes
해설: 원문「Betrayal ooze out of him at every pore.」 분석: 주어는 단수 명사 Betrayal이므로 단수 동사가 필요합니다. 따라서 ooze는 oozes로 고쳐야 합니다.
오답:
(A) 원문「He chatters with his fingertips.」 분석: 소유격 뒤 복수 명사로 옳습니다.
(C) 원문「The students who study hard usually pass」 분석: 복수 명사 주어로 옳습니다.
(D) 원문「students who study hard usually pass the exam」 분석: 바로 앞의 usually가 수식하는 복수 동사로 옳습니다.
(E) 원문「What was novel was the connection」 분석: 선행사를 포함한 관계대명사로 옳습니다.`;

// 1) 프롬프트 조립
const prompt = buildGrammarKillerV2Prompt("PASSAGE_HERE");
check("prompt: 실물 해부 포함", prompt.includes("실물 해부"));
check("prompt: 자리 카탈로그 포함", prompt.includes("킬러 정답이 사는 자리"));
check("prompt: 설계메모 지시 포함", prompt.includes("설계메모"));
check("prompt: 해설 인용 형식", prompt.includes("해설: 원문「"));
check("prompt: 오답 인용 형식", prompt.includes("(A) 원문「"));
check("prompt: 지문 주입", prompt.includes("PASSAGE_HERE"));
check(
  "prompt: 구형 규칙 목록 부재(포인트 가이드 제거 확인)",
  !prompt.includes("기출 빈도 기반") && !prompt.includes("모범 예시 — 우리 검증을"),
);

// 2) 설계메모 절단
const stripped = stripGrammarKillerV2Plan(MODEL_OUTPUT);
check("stripPlan: 메모 제거", stripped.startsWith("밑줄지문:"));
check("stripPlan: 마커 없으면 원문 유지", stripGrammarKillerV2Plan("no marker") === "no marker");

// 3) 파싱 + 인용 처리(정상)
const q0 = parseMdGrammar(stripped);
check("parse: 마커 5", q0.marks.length === 5, String(q0.marks.length));
const ok = processGrammarKillerV2Quotes(q0, PASSAGE);
check("quotes: 위반 0", ok.issues.length === 0, JSON.stringify(ok.issues));
check("quotes: 해설 인용 추출", ok.quotes["해설"]?.includes("Betrayal ooze"));
check(
  "quotes: 해설 분석부만 잔존",
  ok.question.explanation.startsWith("주어는 단수") && !ok.question.explanation.includes("원문「"),
);
check(
  "quotes: 오답 분석부만 잔존",
  ok.question.wrong.every((w) => !w.text.includes("원문「")),
);
check(
  "quotes: (D) '바로 앞의 usually' 참 — 통과",
  !ok.issues.some((i) => i.includes("오답 (D)")),
);

// 4) 위반 계통 — 각각 독립 확인
const mutate = (fn: (t: string) => string) =>
  processGrammarKillerV2Quotes(parseMdGrammar(stripGrammarKillerV2Plan(fn(MODEL_OUTPUT))), PASSAGE);

// 4a) 인용이 지문 축자가 아님
const bad1 = mutate((t) => t.replace("He chatters with his fingertips.」 분석: 소유격", "He talks with his fingertips.」 분석: 소유격"));
check("gate: 비축자 인용 반려", bad1.issues.some((i) => i.includes("축자가 아님")), JSON.stringify(bad1.issues));

// 4b) 인용에 밑줄 표현 없음
const bad2 = mutate((t) => t.replace("원문「What was novel was the connection」", "원문「was novel was the connection」"));
check("gate: 밑줄 표현 누락 반려", bad2.issues.some((i) => i.includes('밑줄 표현("What")')), JSON.stringify(bad2.issues));

// 4c) "바로 앞의 X" 위치 허위
const bad3 = mutate((t) => t.replace("분석: 복수 명사 주어로 옳습니다.", "분석: 바로 앞의 exam 을 보고 고치기 쉬우나 옳습니다."));
check("gate: 바로 앞 허위 반려", bad3.issues.some((i) => i.includes('"바로 앞의 exam"')), JSON.stringify(bad3.issues));

// 4d) 형식 위반(인용 없음)
const bad4 = mutate((t) => t.replace("(A) 원문「He chatters with his fingertips.」 분석: 소유격 뒤 복수 명사로 옳습니다.", "(A) 소유격 뒤 복수 명사로 옳습니다."));
check("gate: 인용 형식 위반 반려", bad4.issues.some((i) => i.includes("형식 위반")), JSON.stringify(bad4.issues));

// 4e) 관사 스킵 — "바로 앞의 the exam"은 exam 을 대조(직전이 the exam 이면 통과)
const bad5 = mutate((t) => t.replace("분석: 선행사를 포함한 관계대명사로 옳습니다.", "분석: 바로 앞이 문장 첫머리라 관계대명사로 옳습니다."));
check("gate: 영단어 없는 바로앞 서술은 통과", !bad5.issues.some((i) => i.includes("바로 앞")), JSON.stringify(bad5.issues));
// (D) 밑줄 pass 직전은 "hard usually" — "바로 앞의 the usually"류 관사 포함 주장도 usually 로 대조돼 통과
const art = mutate((t) => t.replace("분석: 바로 앞의 usually가 수식하는 복수 동사로 옳습니다.", "분석: 바로 앞의 the usually 가 아니라 usually 가 수식하므로 옳습니다."));
check("gate: 관사 스킵 후 실단어 대조", !art.issues.some((i) => i.includes("오답 (D)") && i.includes("바로 앞")), JSON.stringify(art.issues));

// 5) 표시 필터 — 설계메모 은닉·인용 절단·지문 통과
{
  const out: string[] = [];
  const f = new GrammarKillerV2DisplayFilter((t) => out.push(t));
  // 소형 델타로 밀어 넣어 스트리밍 재현
  for (let i = 0; i < MODEL_OUTPUT.length; i += 7) f.push(MODEL_OUTPUT.slice(i, i + 7));
  f.flush();
  const shown = out.join("");
  check("filter: 설계메모 은닉", !shown.includes("정답은 문장1"), shown.slice(0, 60));
  check("filter: 밑줄지문부터 시작", shown.startsWith("밑줄지문:"));
  check("filter: 지문 본문 통과", shown.includes("Betrayal [[B:ooze]] out"));
  check("filter: 해설 인용 절단", !shown.includes("원문「Betrayal"), "해설 줄에 인용 잔존");
  check("filter: 해설 분석 표시", shown.includes("해설: 주어는 단수 명사"));
  check("filter: 오답 인용 절단", !shown.includes("원문「He chatters"));
  check("filter: 오답 분석 표시", shown.includes("(A) 소유격 뒤 복수 명사로 옳습니다."));
  check("filter: 원형·포인트 줄 보존", shown.includes("(B) oozes | d"));
}
// 5b) 마커 없는 출력은 flush 시 원문 방출(표시 유실 방지)
{
  const out: string[] = [];
  const f = new GrammarKillerV2DisplayFilter((t) => out.push(t));
  f.push("이상한 출력 형식");
  f.flush();
  check("filter: 마커 부재 시 원문 방출", out.join("") === "이상한 출력 형식");
}
// 5c) transformQuoteLine 단독
check(
  "transform: 인용 절단",
  transformQuoteLine('(C) 원문「abc def」 분석: 옳습니다.') === "(C) 옳습니다.",
);

// 6) 킬스위치
check("env: 기본 on", isGrammarKillerV2Enabled() === (process.env.QGEN_GRAMMAR_KILLER_V2?.trim().toLowerCase() !== "off"));

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
