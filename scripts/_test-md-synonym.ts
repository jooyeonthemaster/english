// 동의어(SYNONYM) md 레인 0원 결정론 픽스처 테스트.
// 파싱 → 스냅 → 게이트 → 어댑터 → processSynonym 왕복 → 셔플 → 품질검증 →
// 레인 계약(과금·적격성·설정 집행·난이도 3분기)까지.
// 실행: npx tsx scripts/_test-md-synonym.ts
//
// 형식 계약: `대상:` 한 줄 + 원문자 선지 N줄 + `정답:` + `해설:` + `오답:`.
// 지문을 재출력시키지 않으므로 지문 재구성 게이트가 없고, 지문 결속점이 `대상:`
// 한 줄뿐이라 그 줄의 축자·자리 유일성이 이 유형의 최강 게이트다.
// `문맥 문장`은 모델에게 받지 않고 지문에서 잘라 낸다(철칙 1) — 그 파생 경로도 검증한다.
import {
  autoSnapSynonymTarget,
  locateSynonymTarget,
  parseMdSynonym,
  synonymContextSentence,
  type MdSynonymQuestion,
} from "../src/lib/md-qgen/parser-synonym";
import { gateMdSynonym } from "../src/lib/md-qgen/gate-synonym";
import {
  adaptMdSynonymToAiQuestion,
  SYNONYM_MD_DIRECTION,
  SYNONYM_MD_DIRECTION_MULTI,
} from "../src/lib/md-qgen/adapter-synonym";
import { SYNONYM_MD_LANE } from "../src/lib/md-qgen/lane-synonym";
import {
  buildMdSynonymPrompt,
  clampSynonymMdAnswerCount,
  clampSynonymMdOptionCount,
  SYNONYM_MD_CIRCLED,
} from "../src/lib/md-qgen/prompts-synonym";
import type { MdLaneContext } from "../src/lib/md-qgen/lane-types";
import { postProcessQuestion } from "../src/lib/question-postprocess";
import { validateQuestionQuality } from "../src/lib/question-quality";
import { shuffleQuestionOptionsForDiversity } from "../src/lib/question-diversity";
import { CREDIT_COSTS } from "../src/lib/credit-costs";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
}

// ───────────────────────────────────────────────────────────────────────────
// 지문 · 정상 md
// ───────────────────────────────────────────────────────────────────────────
const PASSAGE =
  "Managers who suppress every disagreement eventually cultivate a silence that looks like consensus. " +
  "The quiet is then read as approval, so nobody asks what the team has stopped saying aloud. " +
  "Junior staff learn fast that raising a concern costs more than staying still. " +
  "Researchers at Cornell traced the same drift in hospital teams and in newsrooms. " +
  "By the time a project fails, the warning signs have been circulating privately for months. " +
  "What the company lost was never the argument itself but the information the argument carried.";

const GOOD = `대상: cultivate
① till
② foster
③ tolerate
④ fabricate
⑤ endure
정답: ②
해설: 이 글에서 cultivate 는 밭을 간다는 뜻이 아니라 침묵이라는 분위기를 서서히 길러 낸다는 뜻으로 쓰였습니다. foster 는 의도치 않게 무언가를 자라게 한다는 의미여서 목적어와 인과 구조를 그대로 지키므로 정답입니다.
오답:
① 다의어 오축 — 경작한다는 뜻의 정당한 사전 동의어지만 침묵을 목적어로 받지 못합니다.
③ 논지 배반 — 관리자가 침묵을 허용했다는 말이 되어 만들어 냈다는 인과가 사라집니다.
④ 강도 이동 — 의도적으로 날조한다는 세기가 과해 무의식적 결과라는 문맥과 어긋납니다.
⑤ 의미장 이웃 — 침묵과 자주 붙어 다녀 연상으로 끌리지만 동의 관계가 아닙니다.`;

function gateOf(text: string, optionCount = 5, answerCount = 1): string[] {
  const q = autoSnapSynonymTarget(parseMdSynonym(text), PASSAGE).question;
  return gateMdSynonym(q, PASSAGE, { optionCount, answerCount });
}

// ───────────────────────────────────────────────────────────────────────────
// 1. 정상 경로
// ───────────────────────────────────────────────────────────────────────────
const parsed = parseMdSynonym(GOOD);
check("파싱: 대상 cultivate", parsed.target === "cultivate", parsed.target);
check("파싱: 선지 5개", parsed.options.length === 5, `실제 ${parsed.options.length}`);
check("파싱: 정답 ②", parsed.answer === "②" && parsed.answers.length === 1, parsed.answer);
check("파싱: 오답해설 4개", parsed.wrong.length === 4, `실제 ${parsed.wrong.length}`);
check("파싱: 해설 존재", parsed.explanation.length > 20);
const snapped = autoSnapSynonymTarget(parsed, PASSAGE);
check("스냅: 정상 입력은 무보정", snapped.corrections.length === 0);
check("게이트: 정상 입력 클린", gateOf(GOOD).length === 0, gateOf(GOOD).join(" / "));

// 문맥 문장 파생 — 지문 축자 슬라이스여야 한다(후처리 위치 힌트 + 폴백 표면).
function sentenceOf(word: string): string {
  const hit = locateSynonymTarget(PASSAGE, word);
  return hit && hit.count === 1
    ? synonymContextSentence(PASSAGE, hit.index, hit.length)
    : "";
}
for (const [word, head, tail] of [
  ["cultivate", "Managers", "consensus."],
  ["circulating", "By the time", "months."],
  ["Cornell", "Researchers", "newsrooms."],
] as const) {
  const s = sentenceOf(word);
  check(
    `문맥문장 파생(${word}): 지문 축자 · 표적 포함 · 문장 경계 정확`,
    PASSAGE.includes(s) && s.includes(word) && s.startsWith(head) && s.endsWith(tail),
    s,
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 2. 게이트 반려 — 전종
// ───────────────────────────────────────────────────────────────────────────
// [이름, 치환 전, 치환 후, 게이트 메시지에 반드시 들어가야 할 문구]
const REJECTS: [string, string, string, string][] = [
  ["선지 개수 부족", "⑤ endure\n", "", "선지 4개"],
  ["선지 라벨 순서 어긋남", "③ tolerate", "⑦ tolerate", "선지 라벨이"],
  ["대상 줄 누락", "대상: cultivate\n", "", "대상 단어 누락"],
  ["대상이 지문에 없음", "대상: cultivate", "대상: harvest", "지문에 축자로 없음"],
  ["대상 자리 모호(2회 등장)", "대상: cultivate", "대상: argument", "밑줄 자리가 모호"],
  ["대상이 기능어", "대상: cultivate", "대상: the", "기능어"],
  ["대상 단어 수 초과", "대상: cultivate", "대상: the warning signs have been", "단어 이내의 단어"],
  ["대상이 고유명사", "대상: cultivate", "대상: Cornell", "고유명사"],
  ["선지에 한글 뜻풀이", "① till", "① till (경작하다)", "한글이 섞임"],
  ["선지가 문장 형태", "③ tolerate", "③ tolerate the silence.", "문장 형태"],
  ["선지 단어 수 초과", "③ tolerate", "③ put up with all of it", "단어 이내의 단어·짧은 구"],
  ["선지 중복", "⑤ endure", "⑤ foster", "선지 중복"],
  ["선지 굴절형 중복", "① till", "① fosters", "같은 단어의 굴절형"],
  ["선지가 대상과 동일", "① till", "① cultivate", "대상 단어와 동일"],
  ["선지가 대상의 굴절형", "① till", "① cultivates", "대상 단어의 굴절형"],
  ["형태 불일치(-ing)", "① till", "① tilling", "형태 불일치"],
  ["정답 누락", "정답: ②\n", "", "정답 누락"],
  ["정답 라벨이 선지에 없음", "정답: ②", "정답: ⑨", "정답 라벨(⑨)이 선지에 없음"],
  ["정답 개수 초과", "정답: ②", "정답: ②, ③", "정답 2개"],
  ["해설의 평숫자 선지 지칭", "foster 는 의도치", "2번이 정답입니다. foster 는 의도치", "평숫자로 지칭"],
  ["오답해설 개수 부족", "⑤ 의미장 이웃 — 침묵과", "", "오답해설 3개"],
  // ── 적대검수 1기 수리분 ─────────────────────────────────────────────────
  // (a) 선지 구분자 병기 — fast 프롬프트가 금지한 "word (meaning)" 의 괄호 없는
  //     우회 형태. 정답 선지가 이 형태면 뜻풀이가 곧 정답 힌트가 된다.
  ["선지 뜻풀이 병기(공백 대시)", "④ fabricate", "④ fabricate - invent", "뜻풀이·병기가 붙음"],
  ["선지 뜻풀이 병기(슬래시)", "④ fabricate", "④ fabricate / invent", "뜻풀이·병기가 붙음"],
  ["선지 뜻풀이 병기(콜론)", "④ fabricate", "④ fabricate: invent", "뜻풀이·병기가 붙음"],
  ["선지 뜻풀이 병기(쉼표)", "④ fabricate", "④ fabricate, invent", "뜻풀이·병기가 붙음"],
  ["선지 뜻풀이 병기(세미콜론)", "④ fabricate", "④ fabricate; invent", "뜻풀이·병기가 붙음"],
  ["선지 뜻풀이 병기(파이프)", "④ fabricate", "④ fabricate | invent", "뜻풀이·병기가 붙음"],
  ["선지에 표적 병기(정답누출 완전일치 비교 우회)", "① till", "① cultivate, till", "뜻풀이·병기가 붙음"],
  // (b) 장식이 붙은 선지 — 파서가 벗기고 **게이트가 진짜 결함을 지목**해야 한다.
  //     종전에는 `**foster` 가 남아 아래 세 검사가 전부 무발화했다(critical).
  ["굵게 정답 선지 중복", "⑤ endure", "⑤ **foster**", "선지 중복"],
  ["굵게 표적 자신(정답 누출)", "① till", "① **cultivate**", "대상 단어와 동일"],
  ["굵게 표적 굴절형", "① till", "① **cultivates**", "대상 단어의 굴절형"],
  ["백틱 표적 자신(정답 누출)", "① till", "① `cultivate`", "대상 단어와 동일"],
];
for (const [name, from, to, want] of REJECTS) {
  const issues = gateOf(GOOD.replace(from, to));
  check(
    `게이트 반려: ${name}`,
    issues.some((i) => i.includes(want)),
    `기대 '${want}' · 실제 [${issues.join(" / ")}]`,
  );
}
check(
  "게이트 반려: 해설 줄 자체가 없으면 반려",
  gateOf(GOOD.replace(/^해설:.*$/m, "")).some((i) => i.includes("해설 누락")),
);
// 오답 목록에 정답 줄이 끼어드는 실측 드리프트는 **파서가 걷어낸다**(위 드리프트
// 관용 참조). 따라서 게이트의 정답 누출 검사는 파서를 우회해 직접 형상을 만들어
// 확인해야 한다 — 견본 _test-md-antonym.ts 와 동일 기법.
check(
  "게이트 반려: 오답해설에 정답 라벨(파서 우회 직접 형상)",
  gateMdSynonym(
    {
      ...snapped.question,
      wrong: [...snapped.question.wrong, { label: "②", text: "정답인데 끼어듦" }],
    },
    PASSAGE,
    { optionCount: 5, answerCount: 1 },
  ).some((i) => i.includes("오답해설에 정답 라벨")),
);
check(
  "게이트 반려: 오답해설 라벨이 선지 밖",
  gateMdSynonym(
    {
      ...snapped.question,
      wrong: [...snapped.question.wrong.slice(1), { label: "⑨", text: "선지에 없는 라벨" }],
    },
    PASSAGE,
    { optionCount: 5, answerCount: 1 },
  ).some((i) => i.includes("오답해설 라벨(⑨)이 선지에 없음")),
);

// ───────────────────────────────────────────────────────────────────────────
// 3. 드리프트 관용 — 전부 5선지 + 게이트 클린이어야 한다(줄 유실 방지, 철칙 3)
// ───────────────────────────────────────────────────────────────────────────
const DRIFTS: [string, string, string][] = [
  ["불릿 접두", "② foster", "- ② foster"],
  ["별표 불릿", "③ tolerate", "* ③ tolerate"],
  ["굵게 라벨", "④ fabricate", "**④** fabricate"],
  ["숫자 마침표 라벨", "⑤ endure", "5. endure"],
  ["괄호 숫자 라벨", "① till", "(1) till"],
  ["숫자 괄호 라벨", "① till", "1) till"],
  ["표 형식 행", "⑤ endure", "| ⑤ | endure |"],
  ["잔여 굵게 마감", "④ fabricate", "④ **fabricate**"],
  ["전각 콜론 정답", "정답: ②", "정답：②"],
  ["정답 뒤 부가 설명", "정답: ②", "정답: ② — ④는 강도가 과함"],
  ["오답 헤더 마크다운", "오답:", "## 오답:"],
  ["대상 라벨 '밑줄:'", "대상: cultivate", "밑줄: cultivate"],
  ["대상 라벨 '대상 단어:'", "대상: cultivate", "대상 단어: cultivate"],
  ["대상 라벨 '표적:'", "대상: cultivate", "표적: cultivate"],
  ["대상 굵게 장식", "대상: cultivate", "대상: **cultivate**"],
  ["대상 따옴표 장식", "대상: cultivate", '대상: "cultivate"'],
  ["대상 곱슬따옴표 장식", "대상: cultivate", "대상: “cultivate”"],
  ["대상 밑줄 마크다운", "대상: cultivate", "대상: __cultivate__"],
  ["오답 목록에 정답 줄 끼어듦", "오답:\n", "오답:\n② 정답인데 모델이 끼워 넣음.\n"],
  // ── 적대검수 1기 수리분 (critical: 선지 장식 잔재) ──────────────────────
  // `② **foster**` 는 최빈 드리프트다. 종전 파서는 후행 `**` 하나만 벗겨
  // `"**foster"` 를 남겼고, 다섯 선지 중 **유일하게 별표가 붙은 것이 정답**이라
  // 셔플의 정답 은닉이 통째로 무의미해졌다(학생 시험지에서 정답이 눈에 띈다).
  ["정답 선지 굵게", "② foster", "② **foster**"],
  ["선지 기울임", "① till", "① *till*"],
  ["선지 백틱", "③ tolerate", "③ `tolerate`"],
  ["선지 밑줄 마크다운", "④ fabricate", "④ __fabricate__"],
  ["선지 후행 쉼표", "④ fabricate", "④ fabricate,"],
  ["선지 라벨 뒤 대시 잔재", "④ fabricate", "④ - fabricate"],
  // ── 적대검수 1기 수리분 (major: 키워드 줄 무관용) ───────────────────────
  // 라벨을 굵게/불릿/콜론없는 헤더로 쓰면 정답·해설·오답이 통째로 유실돼 게이트가
  // "정답 누락·해설 누락·오답해설 0개" 라는 **사실과 다른 원인**을 지목했다.
  ["굵게 정답 라벨", "정답: ②", "**정답:** ②"],
  ["굵게 해설 라벨", "해설: 이 글", "**해설:** 이 글"],
  ["굵게 오답 헤더", "오답:", "**오답:**"],
  ["불릿 정답 줄", "정답: ②", "- 정답: ②"],
  ["불릿 해설 줄", "해설: 이 글", "- 해설: 이 글"],
  ["불릿 오답 헤더", "오답:", "* 오답:"],
  ["콜론 없는 오답 헤더", "오답:", "### 오답"],
  ["굵게+전각콜론 정답", "정답: ②", "**정답：** ②"],
  ["헤더 정답 줄", "정답: ②", "## 정답: ②"],
  ["굵게 대상 라벨", "대상: cultivate", "**대상:** cultivate"],
  ["오답해설 헤더 표기", "오답:", "**오답 해설:**"],
];
for (const [name, from, to] of DRIFTS) {
  const drifted = GOOD.replace(from, to);
  const q = parseMdSynonym(drifted);
  const issues = gateOf(drifted);
  // 장식 잔재 0 — 선지 텍스트가 그대로 학생 표면이므로 한 글자도 남으면 안 된다.
  const clean = q.options.every((o) => !/[*_`~|]/.test(o.text));
  check(
    `드리프트 관용: ${name}`,
    q.options.length === 5 && issues.length === 0 && clean,
    `선지 ${q.options.length}개 · [${q.options.map((o) => o.text).join("|")}] · ${issues.join(" / ")}`,
  );
}
// 유실 없이 **모든 필드**가 살아 있는지 — 개수만이 아니라 값까지 못 박는다.
for (const [name, from, to] of [
  ["굵게 라벨 3종 동시", "정답: ②", "**정답:** ②"],
  ["콜론 없는 오답 헤더", "오답:", "### 오답"],
] as const) {
  const q = parseMdSynonym(
    GOOD.replace(from, to).replace("해설: 이 글", "**해설:** 이 글").replace(/^오답:$/m, "**오답:**"),
  );
  check(
    `드리프트 필드 보존: ${name}`,
    q.answer === "②" && q.wrong.length === 4 && q.explanation.length === 126,
    `answer='${q.answer}' wrong=${q.wrong.length} 해설len=${q.explanation.length}`,
  );
}
check(
  "드리프트 관용: 굵게 선지 텍스트가 축자로 보존된다",
  parseMdSynonym(GOOD.replace("② foster", "② **foster**")).options[1].text === "foster",
);
{
  // 문장 한복판 강조 — 양끝 벗기기만으로는 닫는 `**` 가 저장 표면에 남는다.
  const q = parseMdSynonym(
    GOOD.replace("① 다의어 오축 —", "① **다의어 오축** —").replace(
      "해설: 이 글에서 cultivate",
      "해설: 이 글에서 **cultivate**",
    ),
  );
  check(
    "드리프트 관용: 본문 중간 강조 스팬도 벗긴다(저장 표면에 마크업 0)",
    q.wrong[0].text.startsWith("다의어 오축 —") &&
      !/[*`]/.test(q.wrong[0].text) &&
      !/[*`]/.test(q.explanation),
    `${q.wrong[0].text.slice(0, 30)} / ${q.explanation.slice(0, 30)}`,
  );
}

// 과잉 관용 방지 — 선지 구역 밖 산문·해설 속 숫자를 선지로 오인하지 않는다
check(
  "과잉 관용 방지: 라벨 없는 산문 줄 무시",
  parseMdSynonym(GOOD.replace("대상: cultivate\n", "대상: cultivate\nAll five options are verbs.\n"))
    .options.length === 5,
);

// ───────────────────────────────────────────────────────────────────────────
// 4. 스냅 보정 — 진실원은 지문이다
// ───────────────────────────────────────────────────────────────────────────
function snapOf(line: string) {
  return autoSnapSynonymTarget(
    parseMdSynonym(GOOD.replace("대상: cultivate", line)),
    PASSAGE,
  );
}
for (const [name, line, want] of [
  ["대소문자 드리프트", "대상: Cultivate", "cultivate"],
  ["앞뒤 구두점", "대상: cultivate,", "cultivate"],
  ["선행 한정어", "대상: the silence", "silence"],
  ["공백량 드리프트", "대상: warning  signs", "warning signs"],
] as const) {
  const s = snapOf(line);
  check(
    `스냅: ${name} → 지문 축자`,
    s.question.target === want && s.corrections.length === 1,
    `target='${s.question.target}' corrections=${s.corrections.join(" / ")}`,
  );
}
{
  // 자리가 모호하면 손대지 않는다 — 엉뚱한 자리에 밑줄을 긋느니 게이트 반려가 낫다.
  const ambiguous = snapOf("대상: ARGUMENT");
  check(
    "스냅: 자리 모호(2회 등장)는 보정하지 않고 게이트에 넘긴다",
    ambiguous.corrections.length === 0 && ambiguous.question.target === "ARGUMENT",
    ambiguous.corrections.join(" / "),
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 5. 어댑터 → processSynonym 왕복 → 셔플 → 품질검증
// ───────────────────────────────────────────────────────────────────────────
{
  const adapt = adaptMdSynonymToAiQuestion(snapped.question, PASSAGE, "KILLER");
  check("어댑터: 성공", adapt.ok === true, adapt.error);
  const ai = (adapt.aiQuestion ?? {}) as Record<string, unknown>;
  check("어댑터: 발문 단일 정답형", ai.direction === SYNONYM_MD_DIRECTION, String(ai.direction));
  check("어댑터: targetWord 축자", ai.targetWord === "cultivate", String(ai.targetWord));
  const ctxSentence = String(ai.contextSentence ?? "");
  check(
    "어댑터: contextSentence 를 지문에서 파생(모델 입력 아님)",
    PASSAGE.includes(ctxSentence) && ctxSentence.includes("cultivate"),
    ctxSentence,
  );
  const opts = ai.options as Array<Record<string, unknown>>;
  check(
    "어댑터: 선지 라벨 숫자 축 '1'~'5' · 텍스트 무변형",
    opts.length === 5 && opts[0].label === "1" && opts[4].label === "5" && opts[1].text === "foster",
  );
  check("어댑터: correctAnswer '2'", ai.correctAnswer === "2", String(ai.correctAnswer));
  check("어댑터: 단일 정답은 correctAnswers 미생성", !("correctAnswers" in ai));
  const woe = ai.wrongOptionExplanations as Array<Record<string, unknown>>;
  const woeLabels = woe.map((w) => w.label).join(",");
  check("어댑터: 오답해설 4개 · 라벨 1,3,4,5", woe.length === 4 && woeLabels === "1,3,4,5", woeLabels);
  check("어댑터: keyPoints 빈 배열", Array.isArray(ai.keyPoints) && (ai.keyPoints as []).length === 0);
  check(
    "어댑터: 이물 필드 없음(빈칸 계열 · 후처리 소관)",
    !["blanks", "passageWithBlank", "originalExpression", "passageWithUnderline"].some((k) => k in ai),
  );

  const pp = postProcessQuestion("SYNONYM", PASSAGE, ai as never);
  check("후처리: 성공", pp.success === true, pp.error);
  const data = (pp.data ?? {}) as Record<string, unknown>;
  const pwu = String(data.passageWithUnderline ?? "");
  check("후처리: passageWithUnderline 에 __cultivate__ 생성", pwu.includes("__cultivate__"), pwu.slice(0, 90));
  check("후처리: 위치 탐색 경고 없음", (pp.warnings ?? []).length === 0, (pp.warnings ?? []).join(" / "));

  const shuffled = shuffleQuestionOptionsForDiversity({ ...data }, "SYNONYM");
  const sOpts = shuffled.options as Array<Record<string, unknown>>;
  const answerIdx = Number(String(shuffled.correctAnswer)) - 1;
  check(
    "셔플: 정답 키가 foster 를 계속 가리킨다",
    sOpts.length === 5 && sOpts[answerIdx]?.text === "foster",
    `${String(shuffled.correctAnswer)} → ${String(sOpts[answerIdx]?.text)}`,
  );

  const issues = validateQuestionQuality({
    typeId: "SYNONYM",
    question: { ...shuffled, difficulty: "KILLER" },
    passage: PASSAGE,
    requestedDifficulty: "KILLER",
    genericOptionCount: 5,
    genericAnswerCount: 1,
    stemLanguage: "ko",
    optionLanguage: "en",
  });
  const errors = issues.filter((i) => i.severity === "error");
  check("품질검증: error 0", errors.length === 0, errors.map((e) => e.code).join(", "));
}

// ───────────────────────────────────────────────────────────────────────────
// 6. 복수 정답(optionCount 6 · answerCount 2)
// ───────────────────────────────────────────────────────────────────────────
const GOOD_MULTI = `대상: cultivate
① till
② foster
③ tolerate
④ nurture
⑤ fabricate
⑥ endure
정답: ②, ④
해설: 이 글에서 cultivate 는 침묵이라는 분위기를 서서히 길러 낸다는 뜻으로 쓰였습니다. foster 와 nurture 는 모두 그 자라남의 의미를 문장의 목적어와 인과 구조 그대로 보존합니다.
오답:
① 다의어 오축 — 경작한다는 뜻의 사전 동의어지만 침묵을 목적어로 받지 못합니다.
③ 논지 배반 — 허용했다는 말이 되어 만들어 냈다는 인과가 사라집니다.
⑤ 강도 이동 — 의도적 날조라는 세기가 과합니다.
⑥ 의미장 이웃 — 연상으로 끌릴 뿐 동의 관계가 아닙니다.`;
{
  const q = autoSnapSynonymTarget(parseMdSynonym(GOOD_MULTI), PASSAGE).question;
  const issues = gateMdSynonym(q, PASSAGE, { optionCount: 6, answerCount: 2 });
  check("복수정답: 게이트 클린", issues.length === 0, issues.join(" / "));
  const ai = (adaptMdSynonymToAiQuestion(q, PASSAGE, "INTERMEDIATE").aiQuestion ??
    {}) as Record<string, unknown>;
  check(
    "복수정답: 발문에 '모두' · correctAnswers 배열 · correctAnswer '2, 4'",
    ai.direction === SYNONYM_MD_DIRECTION_MULTI &&
      Array.isArray(ai.correctAnswers) &&
      (ai.correctAnswers as string[]).join(",") === "2,4" &&
      ai.correctAnswer === "2, 4",
    `${String(ai.direction)} / ${String(ai.correctAnswer)}`,
  );
  check("복수정답: 오답해설 4개(6−2)", (ai.wrongOptionExplanations as unknown[]).length === 4);
  check(
    "복수정답: answerCount 1로 검사하면 반려",
    gateMdSynonym(q, PASSAGE, { optionCount: 6, answerCount: 1 }).some((i) =>
      i.includes("정답 2개 (1개 필요)"),
    ),
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 7. 레인 계약 — 과금 축(이중청구 회귀 방지) · 적격성 · 설정 집행 · 난이도 3분기
// ───────────────────────────────────────────────────────────────────────────
function ctxOf(over: Partial<MdLaneContext> = {}): MdLaneContext {
  return {
    passage: PASSAGE,
    difficulty: "KILLER",
    rawDifficulty: "KILLER",
    resolved: { genericOptionCount: 5, genericAnswerCount: 1 },
    rawTypeSettings: null,
    teacherPoints: [],
    variantIndex: 0,
    variantCount: 1,
    ...over,
  };
}
/** 레인 전 구간(파싱→게이트→어댑터)을 통과한 최종 발문. */
function directionOf(md: string, ctx: MdLaneContext): string {
  return String(
    (SYNONYM_MD_LANE.adapt(SYNONYM_MD_LANE.parseAndGate(md, ctx), ctx).aiQuestion ?? {})
      .direction ?? "",
  );
}

check("레인: subType SYNONYM · retryEligible", SYNONYM_MD_LANE.subType === "SYNONYM" && SYNONYM_MD_LANE.retryEligible);
check(
  "레인: 과금 QUESTION_GEN_VOCAB (1크레딧) — fast VOCAB_TYPES 동기 · 이중청구 방지",
  SYNONYM_MD_LANE.operationType === "QUESTION_GEN_VOCAB" &&
    CREDIT_COSTS.QUESTION_GEN_VOCAB === 1,
  String(SYNONYM_MD_LANE.operationType),
);
check(
  "레인: 적격성 optionCount 4~8 · answerCount 1~N-1",
  SYNONYM_MD_LANE.isEligible({ genericOptionCount: 4, genericAnswerCount: 1 }) &&
    SYNONYM_MD_LANE.isEligible({ genericOptionCount: 8, genericAnswerCount: 7 }) &&
    SYNONYM_MD_LANE.isEligible({}) &&
    !SYNONYM_MD_LANE.isEligible({ genericOptionCount: 3 }) &&
    !SYNONYM_MD_LANE.isEligible({ genericOptionCount: 9 }) &&
    !SYNONYM_MD_LANE.isEligible({ genericOptionCount: 5, genericAnswerCount: 5 }),
);
check(
  "레인: diversityTargets = structuredData.targetWord",
  SYNONYM_MD_LANE.diversityTargets({ targetWord: "cultivate" }).join(",") === "cultivate" &&
    SYNONYM_MD_LANE.diversityTargets({}).length === 0,
);
check(
  "레인: parseAndGate 정상 클린 + 스냅 기록",
  SYNONYM_MD_LANE.parseAndGate(GOOD, ctxOf()).gateIssues.length === 0 &&
    SYNONYM_MD_LANE.parseAndGate(GOOD.replace("대상: cultivate", "대상: Cultivate"), ctxOf())
      .corrections.length === 1,
);
check(
  "레인: 설정 집행 — optionCount 6 설정에 5선지면 반려",
  SYNONYM_MD_LANE.parseAndGate(
    GOOD,
    ctxOf({ resolved: { genericOptionCount: 6, genericAnswerCount: 1 } }),
  ).gateIssues.some((i) => i.includes("선지 5개 (6개 필요)")),
);
const six = ctxOf({ resolved: { genericOptionCount: 6, genericAnswerCount: 2 } });
check(
  "레인: qualityArgs · mdFormat 이 설정 실값을 싣는다(보기 언어는 구조 고정 en)",
  JSON.stringify(SYNONYM_MD_LANE.qualityArgs(six)) ===
    JSON.stringify({
      genericOptionCount: 6, genericAnswerCount: 2, stemLanguage: "ko", optionLanguage: "en",
    }) &&
    JSON.stringify(SYNONYM_MD_LANE.mdFormat(ctxOf())) ===
      JSON.stringify({ optionCount: 5, answerCount: 1, optionLanguage: "en" }),
);
check(
  "레인: 교사 지정 포인트 준수 게이트(픽커 미등재라 방어적)",
  SYNONYM_MD_LANE.parseAndGate(
    GOOD,
    ctxOf({ teacherPoints: [{ text: "consensus" }] as never }),
  ).gateIssues.some((i) => i.includes("교사 지정 표현이 대상 단어가 아님")) &&
    SYNONYM_MD_LANE.parseAndGate(
      GOOD,
      ctxOf({ teacherPoints: [{ text: "cultivate" }] as never }),
    ).gateIssues.length === 0,
);
{
  const koCtx = ctxOf();
  const enCtx = ctxOf({ rawTypeSettings: { SYNONYM: { stemLanguage: "en" } } });
  check("레인: 기본 발문 언어 ko — 언어 블록 미주입", SYNONYM_MD_LANE.buildExtras(koCtx).length === 0);
  check(
    "레인: stemLanguage=en → 언어 블록 + 영어 발문 치환",
    SYNONYM_MD_LANE.buildExtras(enCtx).some((e) => e.includes("질문 언어")) &&
      directionOf(GOOD, enCtx).startsWith("Which of the following"),
  );
  const enMultiCtx = ctxOf({
    rawTypeSettings: { SYNONYM: { stemLanguage: "en" } },
    resolved: { genericOptionCount: 6, genericAnswerCount: 2 },
  });
  check(
    "레인: stemLanguage=en + 복수정답 → 영어 발문에 'all' 포함(복수정답 발문 게이트)",
    directionOf(GOOD_MULTI, enMultiCtx).includes("all"),
  );
  check("레인: qualityArgs stemLanguage 반영", SYNONYM_MD_LANE.qualityArgs(enCtx).stemLanguage === "en");
}

// ───────────────────────────────────────────────────────────────────────────
// 8. 프롬프트 — 난이도 3분기 · 형식 리터럴 · 클램프
// ───────────────────────────────────────────────────────────────────────────
for (const d of ["BASIC", "INTERMEDIATE", "KILLER"] as const) {
  const p = buildMdSynonymPrompt(PASSAGE, "full", d, { optionCount: 6, answerCount: 1 });
  check(
    `프롬프트 ${d}: 난이도 분기 + 6선지 스캐폴드 + 형식 리터럴 + 지문 포함`,
    p.includes("## 표적 설계") &&
      p.includes("⑥ <영어 단어 또는 짧은 구>") &&
      p.includes("대상: <지문에서 밑줄 칠 단어") &&
      p.includes("## 지문") &&
      p.includes(PASSAGE.slice(0, 50)),
  );
}
check(
  "프롬프트: 난이도별 표적 설계 문구가 서로 다르다",
  new Set(
    (["BASIC", "INTERMEDIATE", "KILLER"] as const).map(
      (d) => buildMdSynonymPrompt(PASSAGE, "full", d).split("## 표적 설계")[1]?.slice(0, 120),
    ),
  ).size === 3,
);
check(
  "프롬프트: BASIC 은 few-shot 생략 · 그 외 탑재",
  !buildMdSynonymPrompt(PASSAGE, "full", "BASIC").includes("모범 설계 해부") &&
    buildMdSynonymPrompt(PASSAGE, "full", "INTERMEDIATE").includes("모범 설계 해부"),
);
const KILLER_PROMPT = buildMdSynonymPrompt(PASSAGE, "full", "KILLER");
// 형식 계약(철칙 1·2)이 프롬프트 문면에서 지켜지는지 — 칸을 늘리는 회귀 방지.
check("프롬프트: 문맥 문장을 모델에게 요구하지 않는다(파생값 계약)", !KILLER_PROMPT.includes("문맥:"));
check("프롬프트: 선지 줄에 정답 표시 칸을 요구하지 않는다", !KILLER_PROMPT.includes("O 또는 X"));
check("프롬프트: 대입 검사(uniqueness test) 조항 탑재", KILLER_PROMPT.includes("대입 검사"));
check(
  "프롬프트: 표적·선지 단어 상한이 게이트와 같은 숫자",
  KILLER_PROMPT.includes("3단어 이내") && KILLER_PROMPT.includes("4단어 이내의 짧은 구"),
);
check(
  "프롬프트: answer-only 모드는 오답 섹션 미요구",
  !buildMdSynonymPrompt(PASSAGE, "answer-only", "KILLER").includes("\n오답:\n"),
);
check(
  "프롬프트: 복수정답이면 정답 개수를 명시",
  buildMdSynonymPrompt(PASSAGE, "full", "KILLER", { optionCount: 6, answerCount: 2 })
    .includes("정답이 2개"),
);
check(
  "클램프: optionCount 2→4 · 99→8 · 비수치→5 / answerCount 1~N−1",
  clampSynonymMdOptionCount(2) === 4 &&
    clampSynonymMdOptionCount(99) === 8 &&
    clampSynonymMdOptionCount("x") === 5 &&
    clampSynonymMdAnswerCount(99, 5) === 4 &&
    clampSynonymMdAnswerCount(0, 5) === 1 &&
    clampSynonymMdAnswerCount(3, 4) === 3,
);

// ───────────────────────────────────────────────────────────────────────────
// 9. 적대검수 1기 수리 회귀 — 결함을 재현하는 픽스처로 고정한다
// ───────────────────────────────────────────────────────────────────────────

// (1) major/edge-case: -s 로 끝나는 **단수 명사** 표적이 전 선지를 반려시키던 오탐.
//     core.hasInflectionalS 의 예외 목록(ss|us|is|ous|less|ness)이 -es/-ws/-ns/-as/
//     -os/-ics 를 못 걸러 species·news·lens·bias·means·series·physics·chaos·canvas 를
//     표적으로 잡으면 선지 5개 전부에 "-s 형태 불일치" 가 찍혀 문항이 100% 실패했다.
function formIssuesOf(target: string, opts: string[], psg: string): string[] {
  const q: MdSynonymQuestion = {
    kind: "synonym",
    target,
    options: opts.map((t, i) => ({ label: SYNONYM_MD_CIRCLED[i], text: t })),
    answers: ["①"],
    answer: "①",
    explanation: "형태 검사 전용 픽스처입니다.",
    wrong: [],
  };
  return gateMdSynonym(q, psg, {
    optionCount: opts.length,
    answerCount: 1,
    requireWrong: false,
  }).filter((i) => i.includes("형태 불일치"));
}
for (const w of [
  "species", "news", "lens", "bias", "means", "series",
  "physics", "politics", "chaos", "canvas",
]) {
  const psg = `Every account of the ${w} changed after the second review. Readers noticed the shift at once.`;
  check(
    `-s 단수명사 표적 면제(${w}) — 선지 전멸 반려 없음`,
    formIssuesOf(w, ["kind", "type", "sort", "variety", "class"], psg).length === 0,
    formIssuesOf(w, ["kind", "type", "sort", "variety", "class"], psg).join(" / "),
  );
}
{
  // 진짜 3인칭 단수 굴절(costs)은 계속 잡아야 한다 — 면제가 검사를 죽이면 안 된다.
  const bad = formIssuesOf("costs", ["require", "demand", "take", "need", "exact"], PASSAGE);
  check(
    "진짜 -s 굴절 불일치는 계속 반려 · 전 선지 공통이면 대상을 지목한 한 줄로 모은다",
    bad.length === 1 && bad[0].includes("선지 5개가 전부 대상 'costs'"),
    bad.join(" / "),
  );
  check(
    "굴절형이 맞으면 클린",
    formIssuesOf("costs", ["requires", "demands", "takes", "needs", "exacts"], PASSAGE).length === 0,
  );
  check(
    "일부 선지만 어긋나면 라벨별로 지목(집계로 뭉개지 않는다)",
    formIssuesOf("cultivate", ["till", "foster", "tolerating", "fabricate", "endure"], PASSAGE)
      .every((i) => i.startsWith("③ 형태 불일치")),
  );
}

// (2) major/gate-gap: 하이픈 단어는 구분자 검사에 걸리면 안 된다(과잉 반려 방지).
check(
  "구분자 검사 과잉 방지: 하이픈 합성어는 통과",
  gateOf(GOOD.replace("③ tolerate", "③ hand-rear")).length === 0,
  gateOf(GOOD.replace("③ tolerate", "③ hand-rear")).join(" / "),
);

// (3) critical 2차 방벽: 장식이 파서를 통과해도 게이트 비교 키가 빗나가지 않는다.
check(
  "게이트 방벽: 장식 남은 선지도 정답누출·장식 반려를 동시에 발화(파서 우회 직접 형상)",
  (() => {
    const issues = gateMdSynonym(
      {
        ...snapped.question,
        options: [
          { label: "①", text: "**cultivate**" },
          ...snapped.question.options.slice(1),
        ],
      },
      PASSAGE,
      { optionCount: 5, answerCount: 1 },
    );
    return (
      issues.some((i) => i.includes("대상 단어와 동일")) &&
      issues.some((i) => i.includes("마크다운 장식"))
    );
  })(),
);

// (4) major/prompt-quality: 개수 반려가 **자리를 지목**하고, 다른 검사를 침묵시키지 않는다.
{
  const missing = gateOf(GOOD.replace("④ fabricate\n", ""));
  check(
    "개수 반려가 빠진 라벨을 지목",
    missing.some((i) =>
      i.includes("선지 4개 (5개 필요) — 인식된 라벨 ①②③⑤, ④ 줄이 없거나 형식이 어긋남"),
    ),
    missing.join(" / "),
  );
  const both = gateOf(
    GOOD.replace("④ fabricate\n", "").replace("대상: cultivate", "대상: harvest"),
  );
  check(
    "개수 반려가 표적·정답·해설 검사를 침묵시키지 않는다(조기 return 철회)",
    both.some((i) => i.includes("선지 4개")) && both.some((i) => i.includes("지문에 축자로 없음")),
    both.join(" / "),
  );
  const stray = gateOf(GOOD.replace("① till", "⑦ till").replace("⑤ endure\n", ""));
  check(
    "개수 반려가 계약 밖 라벨도 지목",
    stray.some((i) => i.includes("①⑤ 줄이 없거나 형식이 어긋남") && i.includes("⑦ 는 계약 밖 라벨")),
    stray.join(" / "),
  );
}
{
  // 정답 해설을 오답 칸에 쓰고 ⑤ 를 빠뜨린 실측 실패 — 파서가 정답 줄을 걷어내므로
  // 게이트가 그 사실을 되살려 적지 않으면 "오답해설 3개" 만 남아 원인이 은폐된다.
  const q = parseMdSynonym(
    GOOD.replace(
      "⑤ 의미장 이웃 — 침묵과 자주 붙어 다녀 연상으로 끌리지만 동의 관계가 아닙니다.",
      "② 정답 해설을 오답 칸에 잘못 썼습니다.",
    ),
  );
  check("파서: 걷어낸 정답 줄 라벨을 기록", (q.answerLabelsInWrong ?? []).join("") === "②");
  const issues = gateMdSynonym(autoSnapSynonymTarget(q, PASSAGE).question, PASSAGE, {
    optionCount: 5,
    answerCount: 1,
  });
  check(
    "오답해설 반려가 빠진 라벨 + 정답 라벨 혼입을 함께 지목",
    issues.some(
      (i) =>
        i.includes("오답해설 3개 (4개 필요)") &&
        i.includes("⑤ 줄이 없거나 형식이 어긋남") &&
        i.includes("정답 라벨 ② 줄이 오답 칸에 있어 제외됨"),
    ),
    issues.join(" / "),
  );
}

// (5) 수리 전 결함을 그대로 재현하는 종단 픽스처 — 파싱→게이트→어댑터→후처리까지
//     굵게 드리프트가 정상 문항으로 끝나는지 확인한다(정답이 눈에 띄지 않아야 한다).
{
  const drifted = GOOD.replace("② foster", "② **foster**").replace("정답: ②", "**정답:** ②");
  const q = autoSnapSynonymTarget(parseMdSynonym(drifted), PASSAGE).question;
  check("종단: 굵게 드리프트 게이트 클린", gateMdSynonym(q, PASSAGE, { optionCount: 5, answerCount: 1 }).length === 0);
  const ai = (adaptMdSynonymToAiQuestion(q, PASSAGE, "KILLER").aiQuestion ?? {}) as Record<string, unknown>;
  const texts = (ai.options as Array<Record<string, unknown>>).map((o) => String(o.text));
  check(
    "종단: 저장 선지에 장식 0 · 정답만 도드라지지 않음",
    texts.join(",") === "till,foster,tolerate,fabricate,endure" && ai.correctAnswer === "2",
    `${texts.join(",")} / ${String(ai.correctAnswer)}`,
  );
}

console.log(`\n${pass}/${pass + fail} 통과`);
if (fail > 0) process.exit(1);
