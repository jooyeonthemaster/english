// 주제/요지(TOPIC_MAIN_IDEA) md 레인 — **적대검수 wave2 회귀 픽스처**.
// 각 검사는 실제로 재현된 결함 하나에 1:1 대응한다(재현 프로브 → 수정 → 이 파일에 고정).
// 단독 실행 파일이 아니다: scripts/_test-md-topic-main-idea.ts 가 픽스처와 카운터를
// 주입해 호출한다(파일 500줄 규약으로 전단/후단/회귀를 갈랐다).
//
// 고정하는 결함 계통:
//  A. silent-drop — 선지·오답해설이 두 줄로 나뉘면 뒷줄이 통째로 버려지고 게이트는 CLEAN
//     (절단된 정답 선지가 그대로 출하됐다. 이 유형은 PASSTHROUGH 라 후처리 보정도 없다.)
//  B. silent-drop — 키워드 줄(`정답:`·`해설:`·`오답:`·`근거문장:`)이 굵게·해시·수식어로
//     오면 필드가 통째로 사라지고, 게이트가 사실과 다른 원인을 재생성 프롬프트에 주입
//  C. gate-gap — 근거문장 정박이 지문의 임의 12자 조각으로 충족(정박이 공회전)
//  D. correctness — 부정 극성에서 프롬프트가 '정답이 무엇인가'를 서로 반대로 지시
import { gateMdTopicMainIdea } from "../src/lib/md-qgen/gate-topic-main-idea";
import {
  parseMdTopicMainIdea,
  verifyGistEvidenceSentence,
  type MdTopicMainIdeaQuestion,
} from "../src/lib/md-qgen/parser-topic-main-idea";
import {
  buildMdTopicMainIdeaPrompt,
  type MdGistMode,
  type MdGistPolarity,
} from "../src/lib/md-qgen/prompts-topic-main-idea";

export interface GistRegressEnv {
  check: (name: string, ok: boolean, detail?: string) => void;
  PASSAGE: string;
  EVIDENCE: string;
  GOOD: string;
  GOOD_TOPIC: string;
  snapOf: (text: string) => MdTopicMainIdeaQuestion;
}

const KO_OPTS = { optionCount: 5, answerCount: 1, gistMode: "MAIN_IDEA" } as const;

const ANSWER_OPTION =
  "③ 추천 알고리즘은 이용자가 이미 승인한 선택을 통계적으로 재생산하기 때문에 목록이 넓어 보여도 실제 취향의 폭은 좁아집니다.";
const ANSWER_OPTION_TEXT = ANSWER_OPTION.slice(2);
const WRONG_FIRST =
  "① 도입부함정 — 반박 이전의 통념을 그대로 옮겨 매력적이지만 글은 그 통념을 곧바로 뒤집습니다.";

export function runGistRegressChecks({
  check,
  PASSAGE,
  EVIDENCE,
  GOOD,
  GOOD_TOPIC,
  snapOf,
}: GistRegressEnv) {
  const gateOf = (text: string, opts = KO_OPTS) =>
    gateMdTopicMainIdea(snapOf(text), PASSAGE, opts);
  const prompt = (
    difficulty: "BASIC" | "INTERMEDIATE" | "KILLER",
    polarity: MdGistPolarity,
    extra: { gistMode?: MdGistMode; optionCount?: number; answerCount?: number } = {},
  ) => buildMdTopicMainIdeaPrompt(PASSAGE, "full", difficulty, { polarity, ...extra });

  // ── A. 이어짐-줄 병합 (선지·오답해설 절단 차단) ──────────────────────────────
  {
    // 실측 프로브: 정답 선지가 wrap 되면 종속절만 남은 비문이 게이트 CLEAN 으로 출하됐다.
    const wrapped = GOOD.replace(
      ANSWER_OPTION,
      "③ 추천 알고리즘은 이용자가 이미 승인한 선택을 통계적으로 재생산하기 때문에\n   목록이 넓어 보여도 실제 취향의 폭은 좁아집니다.",
    );
    const q = snapOf(wrapped);
    check(
      "회귀A: 정답 선지가 두 줄로 나뉘어도 절단되지 않는다",
      q.options.length === 5 && q.options[2].text === ANSWER_OPTION_TEXT,
      `'${q.options[2]?.text}'`,
    );
    check("회귀A: 병합 후 게이트 클린", gateOf(wrapped).length === 0, gateOf(wrapped).join(" / "));
  }
  {
    // 5개 선지 전부 wrap — 종전에는 전부 조각으로 잘리고도 게이트 CLEAN 이었다.
    const allWrapped = GOOD.split("\n")
      .map((line) => (/^[①-⑤] /.test(line) ? line.replace(/(.{20}) /, "$1\n  ") : line))
      .join("\n");
    const q = snapOf(allWrapped);
    check(
      "회귀A: 선지 5개 전부 wrap 되어도 원문 복원",
      q.options.length === 5 &&
        q.options.every((o, i) => o.text === snapOf(GOOD).options[i].text),
      q.options.map((o) => o.text.length).join(","),
    );
  }
  {
    const wrapped = GOOD.replace(WRONG_FIRST, "① 도입부함정\n반박 이전의 통념입니다.");
    const q = snapOf(wrapped);
    check(
      "회귀A: 오답해설이 두 줄로 나뉘어도 절단되지 않는다",
      q.wrong[0]?.text === "도입부함정 반박 이전의 통념입니다.",
      `'${q.wrong[0]?.text}'`,
    );
  }
  {
    // 과잉 병합 방지 ①: 빈 줄은 항목의 끝이다(뒤따르는 메모를 삼키지 않는다).
    const memo = GOOD.replace("\n정답: ③", "\n\n이 설계 메모는 출력에 섞인 잔여물입니다.\n정답: ③");
    const q = snapOf(memo);
    check(
      "회귀A: 빈 줄 뒤 산문은 선지에 병합되지 않는다",
      q.options.length === 5 && !q.options[4].text.includes("설계 메모"),
      q.options[4]?.text,
    );
  }
  {
    // 과잉 병합 방지 ②: 라벨 축 밖 원문자 줄은 병합으로 감추지 않는다(게이트가 봐야 한다).
    const outOfRange = GOOD.replace("\n정답: ③", "\n⑨ 라벨 축 밖 선지\n정답: ③");
    const q = snapOf(outOfRange);
    check(
      "회귀A: 라벨 축 밖 원문자 줄은 병합하지 않는다",
      q.options.length === 5 && !q.options[4].text.includes("라벨 축 밖"),
      q.options[4]?.text,
    );
  }
  {
    // 과잉 병합 방지 ③: 다른 섹션 머리표는 이어짐이 아니다.
    const q = parseMdTopicMainIdea(GOOD);
    check(
      "회귀A: 근거문장·정답 머리표가 선지에 병합되지 않는다",
      q.options.every((o) => !o.text.includes("근거문장") && !o.text.includes("정답:")),
      q.options.map((o) => o.text.slice(0, 12)).join(" | "),
    );
  }
  check(
    "회귀A: 프롬프트가 '개행 없이 한 줄' 을 명시(순서 유형과 동일 계약)",
    prompt("KILLER", "POSITIVE").includes("개행 없이 한 줄"),
  );

  // ── B. 키워드 줄 관용 (굵게·해시·동의 수식어·콜론 생략) ──────────────────────
  const HEAD_DRIFTS: [string, string, string][] = [
    ["오답 머리표 굵게·콜론 생략", "오답:\n", "**오답**\n"],
    ["오답 머리표 해시 헤딩 + 수식어", "오답:\n", "### 오답 해설\n"],
    ["오답 머리표 이름 뒤 수식어", "오답:\n", "오답 해설:\n"],
    ["오답 머리표 해시 + 콜론", "오답:\n", "## 오답:\n"],
    ["해설 머리표 굵게·콜론 생략", "해설: 글은", "**해설** 글은"],
    ["해설 머리표 이름 뒤 수식어", "해설: 글은", "해설 정리: 글은"],
    ["정답 머리표 굵게·콜론 생략", "정답: ③", "**정답** ③"],
    ["정답 머리표 이름 뒤 수식어", "정답: ③", "정답 번호: ③"],
    ["근거문장 머리표 굵게·콜론 생략", `근거문장: ${EVIDENCE}`, `**근거문장** ${EVIDENCE}`],
    ["근거문장 머리표 해시", `근거문장: ${EVIDENCE}`, `### 근거문장: ${EVIDENCE}`],
  ];
  for (const [name, from, to] of HEAD_DRIFTS) {
    const drifted = GOOD.replace(from, to);
    const q = snapOf(drifted);
    const issues = gateMdTopicMainIdea(q, PASSAGE, KO_OPTS);
    check(
      `회귀B: ${name}`,
      q.options.length === 5 &&
        q.answers.join(",") === "③" &&
        q.wrong.length === 4 &&
        q.explanation.length > 20 &&
        q.evidence === EVIDENCE &&
        issues.length === 0,
      `선지 ${q.options.length} · 정답 ${q.answers.join(",")} · 오답 ${q.wrong.length} · 해설 ${q.explanation.length} · ${issues.join(" / ")}`,
    );
  }
  {
    // 오답 머리표가 정말 없을 때 — 유령 4건 대신 원인을 지목해야 한다.
    const noHead = GOOD.replace("오답:\n", "");
    const issues = gateOf(noHead);
    check(
      "회귀B: 오답 머리표 미인식은 '0개 (4개 필요)' 가 아니라 원인을 지목",
      issues.some((i) => i.includes("오답 블록 머리표를 인식할 수 없음")) &&
        !issues.some((i) => i.startsWith("오답해설 0개")) &&
        !issues.some((i) => i.endsWith("오답해설 누락")),
      issues.join(" / "),
    );
  }
  {
    // 정답 줄은 있는데 라벨을 못 읽는 경우 — 받은 값을 그대로 보여 준다.
    const junk = GOOD.replace("정답: ③", "정답: 세 번째 선지입니다");
    const issues = gateOf(junk);
    check(
      "회귀B: 정답 줄의 값을 못 읽으면 받은 값을 지목",
      issues.some((i) => i.includes("정답 누락 — '정답:' 줄에서 선지 번호를 읽을 수 없음")),
      issues.join(" / "),
    );
    check(
      "회귀B: 정답 줄이 아예 없으면 종전 문구 유지(무회귀)",
      gateOf(GOOD.replace("정답: ③\n", "")).some((i) => i === "정답 누락"),
    );
  }
  {
    // 과잉 관용 방지: 본문 줄이 머리표로 오인되면 섹션 경계가 앞으로 밀린다.
    const proseHeads = GOOD.replace(
      "정답: ③",
      "- 정답과 오답의 길이를 맞췄습니다.\n- 해설이 길어지지 않게 다듬었습니다.\n정답: ③",
    );
    const q = snapOf(proseHeads);
    check(
      "회귀B: '정답과'·'해설이' 같은 본문 줄을 머리표로 오인하지 않는다",
      q.answers.join(",") === "③" && q.options.length === 5 && q.explanation.length > 20,
      `정답 ${q.answers.join(",")} · 선지 ${q.options.length} · 해설 ${q.explanation.length}`,
    );
  }

  // ── C. 근거문장 문장성(지문 정박 공회전 차단) ────────────────────────────────
  const FRAGMENTS: [string, string][] = [
    ["문장 앞 세 단어 조각", "The claim is"],
    ["문장 중간 조각", "the number of available items, not the range of taste"],
    ["문장 중간에서 시작한 조각", "recommendation is a statistical restatement of choices"],
    ["종결 구두점 없는 꼬리", "its suggestions drift toward the center of that history"],
  ];
  for (const [name, fragment] of FRAGMENTS) {
    const drifted = GOOD.replace(EVIDENCE, fragment);
    const issues = gateOf(drifted);
    check(
      `회귀C: ${name} 은 정박으로 인정되지 않는다`,
      issues.some((i) => i.includes("근거문장이 지문의 완결된 한 문장이 아님")),
      issues.join(" / "),
    );
  }
  check(
    "회귀C: 지문 첫 문장도 정박으로 인정(문장 시작 경계 = 지문 처음)",
    verifyGistEvidenceSentence(
      PASSAGE,
      "Streaming platforms promise that their recommendation engines will broaden what listeners encounter.",
    ) === "ok",
  );
  check(
    "회귀C: 완결 문장은 종전대로 클린(무회귀)",
    verifyGistEvidenceSentence(PASSAGE, EVIDENCE) === "ok" && gateOf(GOOD).length === 0,
  );
  check(
    "회귀C: 지문에 없는 재진술은 종전 문구로 반려(무회귀)",
    verifyGistEvidenceSentence(PASSAGE, "What grows is only the number of items a listener sees.") ===
      "not-found",
  );
  check(
    "회귀C: 프롬프트가 조각 인용을 금지",
    prompt("KILLER", "POSITIVE").includes("문장 중간을 잘라낸 조각 금지"),
  );

  // ── D. 부정 극성 — 프롬프트가 정답의 성질을 한 방향으로만 지시하는가 ──────────
  const POSITIVE_ONLY = [
    "정답은 글의 결론 문장을 평이하게 재진술한 것이다",
    "정답은 서로 다른 두 문장을 이어야 도출되게 하라",
    "정답은 글의 구조 전체(도입 → 전환 → 근거 → 귀결)를 한 문장으로 접은 추상 재진술이다",
    "정답이 왜 글 전체를 대표하는지",
    "정답을 더 접어라",
  ];
  for (const d of ["BASIC", "INTERMEDIATE", "KILLER"] as const) {
    const neg = prompt(d, "NEGATIVE");
    const leaked = POSITIVE_ONLY.filter((phrase) => neg.includes(phrase));
    check(
      `회귀D: ${d} 부정 극성 프롬프트에 POSITIVE 정답 정의가 남지 않는다`,
      leaked.length === 0,
      leaked.join(" / "),
    );
    check(
      `회귀D: ${d} 부정 극성 정답 설계 블록이 '부적절한 선지' 로 쓰여 있다`,
      neg.includes("## 정답 설계") && neg.includes("요지로 부적절한 선지"),
    );
  }
  check(
    "회귀D: 부정 극성 해설·자기검산 리터럴도 뒤집힌다",
    prompt("KILLER", "NEGATIVE").includes("정답 선지가 왜 그 논지에 비추어 요지로 부적절한지") &&
      prompt("KILLER", "NEGATIVE").includes("명백히 반증되는지"),
  );
  check(
    "회귀D: 주제 모드면 '주제로 부적절한 선지' 로 치환된다(치환 자리 잔존 금지)",
    prompt("KILLER", "NEGATIVE", { gistMode: "TOPIC" }).includes("주제로 부적절한 선지") &&
      !prompt("KILLER", "NEGATIVE", { gistMode: "TOPIC" }).includes("{kind}"),
  );
  for (const d of ["BASIC", "INTERMEDIATE", "KILLER"] as const) {
    const pos = prompt(d, "POSITIVE");
    check(
      `회귀D: ${d} POSITIVE 정답 설계는 무변경(무회귀)`,
      pos.includes("## 정답 설계") &&
        !pos.includes("부적절한 선지") &&
        pos.includes("정답이 왜 글 전체를 대표하는지") &&
        pos.includes("정답을 더 접어라"),
    );
  }
  {
    const neg = prompt("KILLER", "NEGATIVE", { optionCount: 6, answerCount: 2 });
    check(
      "회귀D: 부정 극성 + 복수 정답 블록이 '명백히 부적절' 로 뒤집힌다",
      neg.includes("## 정답 2개 (교사 설정, 필수)") &&
        neg.includes("서로 다른 방식으로 명백히 부적절") &&
        !neg.includes("정답 2개는 각각 독립적으로 지문 전체의 요지로 성립해야 한다"),
    );
    const pos = prompt("KILLER", "POSITIVE", { optionCount: 6, answerCount: 2 });
    check(
      "회귀D: POSITIVE 복수 정답 블록은 무변경(무회귀)",
      pos.includes("정답 2개는 각각 독립적으로 지문 전체의 요지로 성립해야 한다") &&
        !pos.includes("명백히 부적절"),
    );
  }
  {
    // few-shot 은 (모드 × 극성) 4분기여야 한다 — 종전에는 극성이 모드보다 먼저 갈려
    // 주제(영어 명사구) + 부정 극성에 한국어 완결 문장 예시가 실렸다.
    const negTopic = prompt("KILLER", "NEGATIVE", { gistMode: "TOPIC" });
    const negMain = prompt("KILLER", "NEGATIVE", { gistMode: "MAIN_IDEA" });
    check(
      "회귀D: 주제 + 부정 극성 few-shot 은 영어 명사구 판본",
      negTopic.includes("the widening of listener taste driven by algorithmic recommendation") &&
        !negTopic.includes("추천 알고리즘은 이용자가 접하는 취향의 폭을 꾸준히 넓혀 왔다") &&
        negTopic.includes("영어 **명사구**"),
    );
    check(
      "회귀D: 요지 + 부정 극성 few-shot 은 한국어 진술문 판본(무회귀)",
      negMain.includes("추천 알고리즘은 이용자가 접하는 취향의 폭을 꾸준히 넓혀 왔다") &&
        !negMain.includes("the widening of listener taste") &&
        negMain.includes("한국어 **완결 진술문**"),
    );
    check(
      "회귀D: 긍정 극성 few-shot 2종은 무변경(무회귀)",
      prompt("KILLER", "POSITIVE", { gistMode: "TOPIC" }).includes(
        "the narrowing of taste caused by recommendation systems that recycle past choices",
      ) &&
        prompt("KILLER", "POSITIVE", { gistMode: "MAIN_IDEA" }).includes(
          "· 세부과장 — \"이용자 대부분은 추천된 곡의 절반도 듣지 않는다\"",
        ),
    );
  }
  {
    // 주제 모드 픽스처가 회귀 수정 뒤에도 그대로 통과해야 한다(영어 선지 경로 무회귀).
    const issues = gateOf(GOOD_TOPIC, { optionCount: 5, answerCount: 1, gistMode: "TOPIC" });
    check("회귀: 주제 모드 정상 픽스처 클린 유지", issues.length === 0, issues.join(" / "));
  }
}
