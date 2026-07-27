// 주제 추론(TOPIC) — 웨이브2 적대검수 지적 회귀 픽스처.
// scripts/_test-md-topic.ts 가 import 해서 호출한다(진입점은 그대로 하나).
// 여기 담긴 것은 전부 **수리 전에 실제로 재현된** 결함이다. 각 블록 머리에 그
// 결함이 프로덕션에서 어떻게 끝나는지를 적어 둔다 — 나중에 이 검사를 지우려는
// 사람이 대가를 알고 지우도록.
import {
  autoSnapTopicOptions,
  parseMdTopic,
  stripTopicDecoration,
  topicKeywordHead,
} from "../src/lib/md-qgen/parser-topic";
import { gateMdTopic } from "../src/lib/md-qgen/gate-topic";
import { adaptMdTopicToAiQuestion } from "../src/lib/md-qgen/adapter-topic";

type Check = (name: string, ok: boolean, detail?: string) => void;

export interface TopicWave2Fixtures {
  PASSAGE: string;
  OPTION_TEXTS: string[];
  GOOD: string;
  BASE_GATE: { optionCount: number; answerCount: number; optionLanguage: "en" | "ko" };
}

export function runTopicWave2Regressions(check: Check, fx: TopicWave2Fixtures): void {
  const { PASSAGE, OPTION_TEXTS, GOOD, BASE_GATE } = fx;
  const snapOf = (text: string) => autoSnapTopicOptions(parseMdTopic(text)).question;
  const gateOf = (text: string, over: Partial<typeof BASE_GATE> = {}) =>
    gateMdTopic(snapOf(text), PASSAGE, { ...BASE_GATE, ...over });

  // 원본 오답 ① 줄 — 하드랩·지칭 픽스처의 교체 대상.
  const WRONG1 = "① 도입부 소재 함정으로, 논지가 꺾이기 전의 통념일 뿐 필자가 반박하려고 꺼낸 배경입니다.";

  // ─────────────────────────────────────────────────────────────────────────
  // W2-A. 키워드 줄 무관용 → silent-drop (지적 #2 · 웨이브 전체 1위 결함 계통)
  //
  // 재현됐던 사고: `**정답:** ②` 한 줄로 answers=[] → 게이트가 "정답 누락"이라는
  // **사실과 다른 원인**을 지목 → 그 문구가 그대로 [반려 재생성] 피드백이 되어
  // 모델을 엉뚱한 방향으로 몬다 → 모델이 같은 표기를 반복하면 재재생성이 없으므로
  // 생성 실패 + 크레딧 환불. `정답:` 은 이 유형 정답의 유일 진실원이라 어디서도
  // 복구되지 않는다. 굵게·전각콜론·불릿·백틱·해시를 전 키워드 줄에서 흡수한다.
  // ─────────────────────────────────────────────────────────────────────────
  const ANSWER_HEAD_DRIFTS: [string, string][] = [
    ["콜론 뒤 굵게 닫힘 **정답:** ②", "**정답:** ②"],
    ["머리표만 굵게 **정답**: ②", "**정답**: ②"],
    ["값만 굵게 정답: **②**", "정답: **②**"],
    ["값 백틱 정답: `②`", "정답: `②`"],
    ["기울임 _정답_: ②", "_정답_: ②"],
    ["기울임 *정답*: ②", "*정답*: ②"],
    ["물결 ~정답~: ②", "~정답~: ②"],
    ["불릿 접두 - 정답: ②", "- 정답: ②"],
    ["별표 불릿 * 정답: ②", "* 정답: ②"],
    ["인용 접두 > 정답: ②", "> 정답: ②"],
    ["해시 머리 #### 정답: ②", "#### 정답: ②"],
    ["굵게 + 전각 콜론 **정답：** ②", "**정답：** ②"],
    ["콜론 앞뒤 공백 정답 :  ②", "정답 :  ②"],
    ["굵게 + 평숫자 **정답:** 2", "**정답:** 2"],
    ["굵게 + 괄호 숫자 **정답:** (2)", "**정답:** (2)"],
  ];
  for (const [name, line] of ANSWER_HEAD_DRIFTS) {
    const text = GOOD.replace("정답: ②", line);
    const q = snapOf(text);
    const issues = gateMdTopic(q, PASSAGE, BASE_GATE);
    check(
      `W2 정답 줄 관용: ${name}`,
      q.answers.join("") === "②" && q.options.length === 5 && issues.length === 0,
      `answers=${q.answers.join("") || "없음"} · ${issues.join(" / ")}`,
    );
  }

  const EXPLAIN_HEAD_DRIFTS: [string, string][] = [
    ["머리표만 굵게 **해설**:", "**해설**: 이 글은"],
    ["콜론 뒤 굵게 닫힘 **해설:**", "**해설:** 이 글은"],
    ["불릿 접두 - 해설:", "- 해설: 이 글은"],
    ["인용 접두 > 해설:", "> 해설: 이 글은"],
    ["전각 콜론 해설：", "해설： 이 글은"],
    ["해시 머리 ### 해설:", "### 해설: 이 글은"],
  ];
  for (const [name, line] of EXPLAIN_HEAD_DRIFTS) {
    const text = GOOD.replace("해설: 이 글은", line);
    const q = snapOf(text);
    const issues = gateMdTopic(q, PASSAGE, BASE_GATE);
    check(
      `W2 해설 줄 관용: ${name}`,
      q.explanation.startsWith("이 글은") && issues.length === 0,
      `'${q.explanation.slice(0, 24)}' · ${issues.join(" / ")}`,
    );
  }

  const WRONG_HEAD_DRIFTS: [string, string][] = [
    ["머리표만 굵게 **오답**:", "**오답**:"],
    ["콜론 뒤 굵게 닫힘 **오답:**", "**오답:**"],
    ["불릿 접두 - 오답:", "- 오답:"],
    ["인용 접두 > 오답:", "> 오답:"],
    ["전각 콜론 오답：", "오답："],
    ["해시 머리 ### 오답:", "### 오답:"],
  ];
  for (const [name, line] of WRONG_HEAD_DRIFTS) {
    const text = GOOD.replace("오답:", line);
    const q = snapOf(text);
    const issues = gateMdTopic(q, PASSAGE, BASE_GATE);
    check(
      `W2 오답 머리표 관용: ${name}`,
      q.wrong.length === 4 &&
        q.wrong.map((w) => w.label).join("") === "①③④⑤" &&
        !q.explanation.includes("도입부") &&
        issues.length === 0,
      `오답 ${q.wrong.length}개 · ${issues.join(" / ")}`,
    );
  }

  check(
    "W2 키워드 줄 관용: 세 머리표가 동시에 굵게여도 전 필드 생존 + 게이트 클린",
    (() => {
      const text = GOOD.replace("정답: ②", "**정답:** ②")
        .replace("해설: 이 글은", "**해설:** 이 글은")
        .replace("오답:", "**오답:**");
      const q = snapOf(text);
      return (
        q.answers.join("") === "②" &&
        q.explanation.startsWith("이 글은") &&
        q.wrong.length === 4 &&
        gateMdTopic(q, PASSAGE, BASE_GATE).length === 0
      );
    })(),
  );
  check(
    "W2 키워드 줄 관용: 굵게 정답 줄이 어댑터까지 통과한다(레인 종단)",
    (() => {
      const q = snapOf(GOOD.replace("정답: ②", "**정답:** ②"));
      const adapt = adaptMdTopicToAiQuestion(q, PASSAGE, "KILLER", { direction: "발문" });
      return adapt.ok === true && adapt.aiQuestion?.correctAnswer === "2";
    })(),
  );
  check(
    "W2 키워드 줄 관용: 머리표 정규식에 캡처 그룹이 없다(split 오염 방지)",
    (() => {
      const m = new RegExp(topicKeywordHead("정답")).exec("**정답:** ②");
      return m !== null && m.length === 1;
    })(),
  );
  check(
    "W2 과잉 관용 방지: '정답률:' 처럼 키워드가 접두인 줄은 정답 줄이 아니다",
    parseMdTopic(GOOD.replace("정답: ②", "정답률: 32%\n정답: ②")).answers.join("") === "②",
  );

  // ─────────────────────────────────────────────────────────────────────────
  // W2-B. 라벨 없는 뒷줄 유실 → 잘린 문장 출하 (지적 #1)
  //
  // 재현됐던 사고: 하드랩된 선지·오답해설의 뒷줄이 통째로 버려지는데 개수는
  // 맞으므로 게이트가 CLEAN 을 낸다 → 어댑터 통과 → 후처리도 PASSTHROUGH →
  // **잘린 문장이 학생·교사 표면에 그대로 출하된다.** 개수 오류로조차 보이지
  // 않는 최악의 유실이다.
  // ─────────────────────────────────────────────────────────────────────────
  const FULL_OPTION_1 =
    "the rising popularity of heat-resistant street trees in the densest districts of modern cities";
  check(
    "W2 연속 줄 접기: 하드랩된 선지의 뒷절이 살아남는다",
    (() => {
      const text = GOOD.replace(
        `① ${OPTION_TEXTS[0]}`,
        "① the rising popularity of heat-resistant street trees\n   in the densest districts of modern cities",
      );
      const q = snapOf(text);
      return q.options.length === 5 && q.options[0].text === FULL_OPTION_1;
    })(),
    snapOf(
      GOOD.replace(
        `① ${OPTION_TEXTS[0]}`,
        "① the rising popularity of heat-resistant street trees\n   in the densest districts of modern cities",
      ),
    ).options[0].text,
  );
  check(
    "W2 연속 줄 접기: 하드랩된 오답 해설의 뒷절이 살아남는다",
    (() => {
      const text = GOOD.replace(
        WRONG1,
        "① 도입부 소재 함정으로,\n   However 이전의 통념에 갇힌 선지입니다.",
      );
      const q = snapOf(text);
      return (
        q.wrong.length === 4 &&
        q.wrong[0].text === "도입부 소재 함정으로, However 이전의 통념에 갇힌 선지입니다." &&
        gateMdTopic(q, PASSAGE, BASE_GATE).length === 0
      );
    })(),
    snapOf(GOOD.replace(WRONG1, "① 도입부 소재 함정으로,\n   However 이전의 통념에 갇힌 선지입니다.")).wrong[0]
      ?.text,
  );
  check(
    "W2 연속 줄 접기: 중첩 불릿 뒷줄('  - …')도 이어 붙인다",
    snapOf(
      GOOD.replace(WRONG1, "① 도입부 소재 함정으로,\n   - However 이전의 통념에 갇힌 선지입니다."),
    ).wrong[0].text === "도입부 소재 함정으로, However 이전의 통념에 갇힌 선지입니다.",
  );
  check(
    "W2 연속 줄 접기: 3줄 하드랩도 순서대로 이어 붙인다",
    snapOf(
      GOOD.replace(WRONG1, "① 도입부 소재 함정으로,\n   논지가 꺾이기 전의 통념일 뿐\n   필자가 반박하려고 꺼낸 배경입니다."),
    ).wrong[0].text === "도입부 소재 함정으로, 논지가 꺾이기 전의 통념일 뿐 필자가 반박하려고 꺼낸 배경입니다.",
  );
  check(
    "W2 연속 줄 접기: 접힌 선지도 어댑터까지 축자로 실린다",
    (() => {
      const q = snapOf(
        GOOD.replace(
          `① ${OPTION_TEXTS[0]}`,
          "① the rising popularity of heat-resistant street trees\n   in the densest districts of modern cities",
        ),
      );
      const ai = adaptMdTopicToAiQuestion(q, PASSAGE, "KILLER", { direction: "발문" }).aiQuestion;
      const opts = (ai?.options ?? []) as Array<{ label: string; text: string }>;
      return opts[0]?.text === FULL_OPTION_1;
    })(),
  );
  // 병행 방어 — 접기가 못 살린 진짜 잘린 해설은 게이트가 반려한다(하한 상향).
  check(
    "W2 병행 방어: 문장으로 성립하지 않는 짧은 오답 해설 반려 + 받은 값 노출",
    (() => {
      const issues = gateOf(GOOD.replace(WRONG1, "① 도입부 소재 함정"));
      return (
        issues.some((i) => i.includes("① 오답 해설이 문장으로 성립하지 않음")) &&
        issues.some((i) => i.includes("도입부 소재 함정"))
      );
    })(),
    gateOf(GOOD.replace(WRONG1, "① 도입부 소재 함정")).join(" / "),
  );
  // 과잉 관용 방지 — 접기가 무관한 산문·다음 섹션을 삼키면 안 된다.
  check(
    "W2 접기 경계: 빈 줄 너머의 산문은 이어 붙이지 않는다",
    (() => {
      const q = snapOf(`${GOOD}\n\n(참고: 위 해설은 채점자용 메모입니다.)`);
      return q.wrong.length === 4 && !q.wrong[3].text.includes("채점자용 메모");
    })(),
    snapOf(`${GOOD}\n\n(참고: 위 해설은 채점자용 메모입니다.)`).wrong[3]?.text,
  );
  check(
    "W2 접기 경계: 다음 섹션 머리표('주제:')는 이어 붙이지 않는다",
    (() => {
      const q = snapOf(`${GOOD}\n주제: 수관의 연속성이 거리 냉각을 좌우한다는 것입니다.`);
      return q.wrong.length === 4 && !q.wrong[3].text.includes("수관의 연속성이 거리");
    })(),
    snapOf(`${GOOD}\n주제: 수관의 연속성이 거리 냉각을 좌우한다는 것입니다.`).wrong[3]?.text,
  );
  check(
    "W2 접기 경계: 첫 라벨 이전의 산문은 여전히 무시된다(직전 항목이 없다)",
    parseMdTopic(GOOD.replace("① the rising", "아래는 선지 다섯 개입니다.\n① the rising")).options
      .length === 5,
  );
  // 파서가 못 읽는 머리표라도 접기까지 삼키면 안 된다 — 필드 유실에 직전 선지
  // 오염이 얹혀 2차 피해가 난다(못 읽는 것보다 나쁘다).
  // 오답 목록은 출력의 꼬리다 — 사족은 전부 마지막 오답 해설에 달라붙고 그대로
  // 학생 표면에 나간다. 유실을 고치면서 새 오염을 들이지 않는지 못 박는다.
  for (const note of [
    "※ 위 해설은 채점자용 메모입니다.",
    "(참고: 선지 순서는 저장 시 재배열됩니다.)",
    "주의: 이 문항은 복수정답 시비가 없습니다.",
    "Note: options are paraphrased.",
  ]) {
    check(
      `W2 접기 경계: 목록 뒤 사족을 마지막 오답 해설에 붙이지 않는다 — ${note.slice(0, 14)}`,
      (() => {
        const q = snapOf(`${GOOD}\n${note}`);
        return (
          q.wrong.length === 4 &&
          q.wrong[3].text === "관점 소거로, 중심 화제는 맞지만 필자의 판단이 빠져 소재에 머무릅니다." &&
          gateMdTopic(q, PASSAGE, BASE_GATE).length === 0
        );
      })(),
      snapOf(`${GOOD}\n${note}`).wrong[3]?.text,
    );
  }
  check(
    "W2 접기 경계: 미지의 장식이 붙은 머리표('【정답】:')도 선지에 달라붙지 않는다",
    (() => {
      const q = snapOf(GOOD.replace("정답: ②", "【정답】: ②"));
      return q.options.length === 5 && q.options.every((o) => !/[가-힣]/.test(o.text));
    })(),
    snapOf(GOOD.replace("정답: ②", "【정답】: ②")).options.map((o) => o.text.slice(0, 20)).join(" | "),
  );

  // ─────────────────────────────────────────────────────────────────────────
  // W2-C. 선두 원문자 무조건 제거 → 비문 출하 (지적 #4)
  //
  // 재현됐던 사고: 오답 해설 `① ②와 달리 …` 에서 라벨 ① 을 뗀 뒤 본문 선두의
  // `②` 까지 이중 라벨로 오인해 지워 `와 달리 …` 라는 비문이 저장됐다. 게이트
  // CLEAN · 후처리 PASSTHROUGH 라 아무도 안 고치고, 셔플 라벨 재매핑
  // (remapCircledMentions) 도 지칭 토큰이 사라져 손댈 대상이 없다.
  // ─────────────────────────────────────────────────────────────────────────
  const MENTION = "① ②와 달리 필자의 판단이 빠져 소재에 머무는 진술입니다.";
  check(
    "W2 지칭 보존: 다른 선지를 지칭하는 오답 해설의 원문자가 살아남는다",
    (() => {
      const q = snapOf(GOOD.replace(WRONG1, MENTION));
      return (
        q.wrong[0].text === "②와 달리 필자의 판단이 빠져 소재에 머무는 진술입니다." &&
        gateMdTopic(q, PASSAGE, BASE_GATE).length === 0
      );
    })(),
    snapOf(GOOD.replace(WRONG1, MENTION)).wrong[0]?.text,
  );
  check(
    "W2 지칭 보존: 어댑터·후처리 경계까지 지칭이 유지된다",
    (() => {
      const q = snapOf(GOOD.replace(WRONG1, MENTION));
      const ai = adaptMdTopicToAiQuestion(q, PASSAGE, "KILLER", { direction: "발문" }).aiQuestion;
      const w = (ai?.wrongOptionExplanations ?? []) as Array<{ label: string; explanation: string }>;
      return w[0]?.label === "1" && w[0].explanation.startsWith("②와 달리");
    })(),
  );
  check(
    "W2 지칭 보존: 다른 라벨의 평숫자 토큰('1) …')도 지우지 않는다",
    snapOf(
      GOOD.replace("③ 범위 이탈로, 지문이 말하지 않은 해결책까지 논의를 넓힌 진술입니다.", "③ 1) 지문이 말하지 않은 해결책까지 넓힌 진술입니다."),
    ).wrong[1].text === "1) 지문이 말하지 않은 해결책까지 넓힌 진술입니다.",
    snapOf(
      GOOD.replace("③ 범위 이탈로, 지문이 말하지 않은 해결책까지 논의를 넓힌 진술입니다.", "③ 1) 지문이 말하지 않은 해결책까지 넓힌 진술입니다."),
    ).wrong[1]?.text,
  );
  check(
    "W2 지칭 보존: 자기 라벨의 이중 표기는 여전히 제거된다(관용 유지)",
    (() => {
      const q = snapOf(GOOD.replace(WRONG1, "① ① 도입부 소재 함정으로, 논지가 꺾이기 전의 통념입니다."));
      return q.wrong[0].text === "도입부 소재 함정으로, 논지가 꺾이기 전의 통념입니다.";
    })(),
    snapOf(GOOD.replace(WRONG1, "① ① 도입부 소재 함정으로, 논지가 꺾이기 전의 통념입니다.")).wrong[0]?.text,
  );
  check(
    "W2 지칭 보존: 단위 함수 — 자기 라벨만 절단, 타 라벨·본문 숫자는 불변",
    stripTopicDecoration("② the rising popularity", "②") === "the rising popularity" &&
      stripTopicDecoration("1) the rising popularity", "①") === "the rising popularity" &&
      stripTopicDecoration("②와 달리 판단이 빠졌습니다.", "①") === "②와 달리 판단이 빠졌습니다." &&
      stripTopicDecoration("②와 달리 판단이 빠졌습니다.", "②") === "②와 달리 판단이 빠졌습니다." &&
      stripTopicDecoration("1990년대의 통념입니다.", "①") === "1990년대의 통념입니다.",
  );
  check(
    "W2 지칭 보존: 스냅 2차 통과에서도 지칭이 다시 깎이지 않는다(멱등)",
    (() => {
      const once = snapOf(GOOD.replace(WRONG1, MENTION));
      const twice = autoSnapTopicOptions(once);
      return twice.question.wrong[0].text === once.wrong[0].text && twice.corrections.length === 0;
    })(),
  );

  // ─────────────────────────────────────────────────────────────────────────
  // W2-D. 정답 축 실패의 파생 메시지 → 재생성 프롬프트 오염 (지적 #3)
  //
  // 재현됐던 사고: answers=[] 이면 게이트가 모든 선지를 비정답으로 간주해
  // "② 오답 해설 누락" 을 함께 낸다 → 라우트가 그 문구를 그대로 [반려 재생성]
  // 프롬프트에 싣는다 → 모델이 순순히 따라 **정답 선지까지 포함한** 오답해설을
  // 만들면 2차 게이트가 개수·정답 누출로 다시 반려 → 재재생성이 없으므로
  // 실패 + 환불 확정. 회복 가능한 1차 실패를 게이트가 스스로 2차 실패로 만든다.
  // ─────────────────────────────────────────────────────────────────────────
  check(
    "W2 게이트: 정답 줄 자체가 없으면 그 사실만 단독 보고(파생 메시지 0)",
    (() => {
      const issues = gateOf(GOOD.replace("정답: ②\n", ""));
      return (
        issues.length === 1 &&
        issues[0].includes("정답 누락") &&
        !issues.some((i) => i.includes("오답 해설 누락"))
      );
    })(),
    gateOf(GOOD.replace("정답: ②\n", "")).join(" / "),
  );
  check(
    "W2 게이트: 선지에 없는 정답 라벨도 파생 메시지를 만들지 않는다",
    (() => {
      const issues = gateOf(GOOD.replace("정답: ②", "정답: ⑧"));
      return (
        issues.length === 1 &&
        issues[0].includes("정답 라벨(⑧)이 선지에 없음") &&
        !issues.some((i) => i.includes("오답 해설 누락"))
      );
    })(),
    gateOf(GOOD.replace("정답: ②", "정답: ⑧")).join(" / "),
  );
  check(
    "W2 게이트: 정답 축이 멀쩡하면 '오답 해설 누락' 은 그대로 나온다(과잉 억제 방지)",
    gateOf(GOOD.replace(/^④ 관점 반전.*$/m, "")).some((i) => i.includes("④ 오답 해설 누락")),
  );
  check(
    "W2 게이트: 정답 축이 깨져도 정답과 무관한 위반은 계속 보고한다",
    (() => {
      const issues = gateOf(
        GOOD.replace("정답: ②\n", "").replace(`③ ${OPTION_TEXTS[2]}`, "③ 도시 나무가 냉방을 대체하는 방법"),
      );
      return (
        issues.some((i) => i.includes("정답 누락")) &&
        issues.some((i) => i.includes("③ 선지에 한국어가 섞임")) &&
        !issues.some((i) => i.includes("오답 해설 누락"))
      );
    })(),
    gateOf(
      GOOD.replace("정답: ②\n", "").replace(`③ ${OPTION_TEXTS[2]}`, "③ 도시 나무가 냉방을 대체하는 방법"),
    ).join(" / "),
  );
}
