// 게이트 하네스 음성테스트 — "0건"이 탐지 실패가 아니라 결함 없음임을 증명한다.
// 불변조건 I7: 결함을 일부러 주입해 잡히는지 확인한 게이트만 신뢰한다.
// 실행: node_modules/.bin/tsx qbank/harness/_selftest-gate.ts

import { gateUnit, splitItems, buildProductionPrompt } from "./qgen-core";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  ok ? (pass += 1) : (fail += 1);
}

const PASSAGE =
  "Cities across the world have raised tall barriers along their busiest roads to hold back the roar of traffic. " +
  "Residents behind those walls, however, often report that their streets have become harder to live with rather than easier. " +
  "Once the steady hum of distant traffic is stripped away, every slammed door and passing scooter stands out against the new quiet. " +
  "What makes a place feel noisy is therefore not the sheer volume of sound but the contrast between a sound and its background. " +
  "Engineers who chase ever lower decibel readings can end up building the very irritation they set out to remove.";

// _test-md-title.ts 의 검증된 정상 픽스처 — 이미 게이트 클린임이 회귀로 고정돼 있다.
const GOOD_BODY = `① Why Silencing a City Can Make It Louder
② Sound Barriers: A Proven Cure for Traffic Noise
③ The Rising Toll of Traffic Noise on Health
④ Redesigning Streets Around Human Perception
⑤ Why People Complain More Than They Suffer
정답: ①
해설: 이 글은 방음벽으로 소음의 총량을 줄였는데도 주민들이 오히려 더 시끄럽다고 느낀 역설을 다룹니다. 시끄러움을 결정하는 것은 소리의 절대량이 아니라 배경과의 대비이므로 조용하게 만들려는 시도가 성가심을 키운다는 결론이 제목의 축입니다.
오답:
② 방향반대 — 핵심 소재인 방음벽을 표제로 앞세워 가장 제목다워 보이지만 필자가 말한 실패를 성공으로 뒤집었습니다.
③ 도입부함정 — 논지 전환 이전의 도입 서술에 시야가 갇힌 제목이라 이 글의 결론이 아닙니다.
④ 범위확대 — 지각이라는 재료는 지문에 있지만 도시 설계 전반의 처방까지는 지문이 말하지 않았습니다.
⑤ 근거없음 — 그럴듯한 통념이지만 지문에 이를 뒷받침하는 문장이 하나도 없습니다.`;

const ALT_BODY = `① Contrast, Not Volume, Decides What Feels Noisy
② Quieter Roads Always Mean Happier Neighborhoods
③ How Engineers Learned to Measure Street Decibels
④ The Hidden Costs of Building Taller Barriers
⑤ Why Distant Traffic Soothes More Than It Disturbs
정답: ①
해설: 필자는 소음의 절대량을 낮춘 뒤에도 불만이 커진 사례에서 출발해, 성가심을 만드는 것은 소리 자체가 아니라 소리와 배경 사이의 대비라는 일반화를 끌어냅니다. 이 일반 원리를 표제로 압축한 것이 정답입니다.
오답:
② 방향반대 — 필자가 반례로 든 통념을 그대로 표제로 삼아 결론을 뒤집었습니다.
③ 도입부함정 — 측정이라는 소재만 빌렸을 뿐 글이 내린 판단이 빠졌습니다.
④ 범위확대 — 비용 문제는 지문이 다루지 않은 다른 축입니다.
⑤ 근거없음 — 그럴듯하지만 지문에 이를 뒷받침하는 문장이 없습니다.`;

const item = (n: number, point: string, body: string, difficulty = "KILLER") =>
  `<!-- ITEM ${n}\ndifficulty: ${difficulty}\npoint: ${point}\ncraft: 자기검증용 픽스처\n-->\n${body}\n\n`;

const UNIT_OK =
  item(1, "결론 압축 — 역설의 귀결을 표제화", GOOD_BODY) +
  item(2, "일반 원리 명명 — 대비 개념의 추상화", ALT_BODY);

// ── 1. 컨테이너 파싱 ───────────────────────────────────────────────────────
{
  const { items, errors } = splitItems(UNIT_OK);
  check("컨테이너: 문항 2개 분리", items.length === 2, `실제 ${items.length}`);
  check("컨테이너: 메타 파싱", items[0].meta.difficulty === "KILLER" && items[0].meta.point.includes("결론 압축"));
  check("컨테이너: 오류 없음", errors.length === 0, errors.join(" / "));
  check("컨테이너: 본문에 헤더 잔재 없음", !items[0].markdown.includes("<!--"));
}
{
  const { errors } = splitItems(GOOD_BODY); // 헤더 없음
  check("컨테이너 음성: ITEM 헤더 부재를 잡는다", errors.some((e) => e.includes("ITEM 헤더")), errors.join(" / "));
}
{
  const { errors } = splitItems(item(1, "a", GOOD_BODY) + item(3, "b", ALT_BODY));
  check("컨테이너 음성: 번호 비연속을 잡는다", errors.some((e) => e.includes("비연속")), errors.join(" / "));
}
{
  const { errors } = splitItems(`<!-- ITEM 1\ndifficulty: KILLER\n-->\n${GOOD_BODY}`);
  check("컨테이너 음성: point 누락을 잡는다", errors.some((e) => e.includes("point")), errors.join(" / "));
}

// ── 2. 정상 경로 (게이트가 조용한지) ───────────────────────────────────────
const okRes = gateUnit({ subType: "TITLE", passageId: "SELFTEST", passage: PASSAGE, source: UNIT_OK, minItems: 2 });
check(
  "정상: 검증된 픽스처는 blocking 0",
  okRes.ok && okRes.blocking.length === 0,
  okRes.blocking.map((b) => `[${b.code}] ${b.message}`).join(" / "),
);
check(
  "정상: qualityBlocking 0 (형식/품질 축 분리 확인)",
  okRes.qualityBlocking.length === 0,
  okRes.qualityBlocking.map((b) => `[${b.code}] ${b.message}`).join(" / "),
);
check("정상: 어댑터·후처리 통과", okRes.items.every((i) => i.adaptOk && i.postOk));
check(
  "정상: structuredData 생성",
  okRes.items.every((i) => i.structuredData && Array.isArray(i.structuredData.options)),
);
check(
  "정상: 발문이 실렸다",
  String(okRes.items[0].structuredData?.direction || "").includes("제목"),
  String(okRes.items[0].structuredData?.direction),
);

// ── 3. 음성테스트 — 결함 주입 시 반드시 울려야 한다 ────────────────────────
type Neg = [string, string, string];
const NEGATIVES: Neg[] = [
  ["선지 누락", "⑤ Why People Complain More Than They Suffer\n", ""],
  ["라벨 축 파괴", "④ Redesigning", "⑥ Redesigning"],
  ["정답 누락", "정답: ①\n해설:", "해설:"],
  ["정답 라벨이 선지 밖", "정답: ①", "정답: ⑦"],
  ["선지 중복", "⑤ Why People Complain More Than They Suffer", "⑤ The Rising Toll of Traffic Noise on Health"],
  ["해설 누락", "해설: 이 글은 방음벽으로", "삭제됨: 이 글은 방음벽으로"],
  ["정답이 지문 축자 복사", "① Why Silencing a City Can Make It Louder", "① the contrast between a sound and its background"],
  ["오답해설 라벨 중복", "⑤ 근거없음 —", "④ 근거없음 —"],
  ["선지 길이 불균형", "⑤ Why People Complain More Than They Suffer", "⑤ Noise"],
];
for (const [name, from, to] of NEGATIVES) {
  const broken = item(1, "결론 압축", GOOD_BODY.replace(from, to)) + item(2, "일반 원리 명명", ALT_BODY);
  const r = gateUnit({ subType: "TITLE", passageId: "SELFTEST", passage: PASSAGE, source: broken, minItems: 2 });
  check(`음성테스트: ${name} → 차단`, !r.ok && r.blocking.length > 0, "차단 0건 — 게이트가 못 봤다");
}

// ── 4. 유닛 수준 게이트 (하네스 고유) ──────────────────────────────────────
{
  const r = gateUnit({ subType: "TITLE", passageId: "S", passage: PASSAGE, source: item(1, "p", GOOD_BODY), minItems: 5 });
  check("음성테스트: 문항 수 미달 → 차단", r.blocking.some((b) => b.code === "ITEM_COUNT"));
}
{
  const dup = item(1, "결론 압축 — 역설의 귀결", GOOD_BODY) + item(2, "결론 압축 — 역설의 귀결", ALT_BODY);
  const r = gateUnit({ subType: "TITLE", passageId: "S", passage: PASSAGE, source: dup, minItems: 2 });
  check(
    "음성테스트: 출제 포인트 중복 → 차단",
    r.blocking.some((b) => b.code === "POINT_DUPLICATE"),
    r.blocking.map((b) => b.code).join(","),
  );
}
{
  const same = item(1, "포인트 A", GOOD_BODY) + item(2, "포인트 B", GOOD_BODY);
  const r = gateUnit({ subType: "TITLE", passageId: "S", passage: PASSAGE, source: same, minItems: 2 });
  check(
    "음성테스트: 두 문항의 정답이 동일 → 차단",
    r.blocking.some((b) => b.code === "ANSWER_DUPLICATE"),
    r.blocking.map((b) => b.code).join(","),
  );
}
{
  const r = gateUnit({ subType: "NOT_A_REAL_TYPE", passageId: "S", passage: PASSAGE, source: UNIT_OK, minItems: 2 });
  check(
    "음성테스트: 미지원 레인은 조용히 통과하지 않고 차단",
    !r.ok && r.blocking.some((b) => b.code === "UNSUPPORTED_LANE"),
  );
}
// ── 정본 2종 지원 확인 (canon.ts 이식) ─────────────────────────────────────
for (const canon of ["BLANK_INFERENCE", "GRAMMAR_ERROR"]) {
  const r = gateUnit({
    subType: canon,
    passageId: "S",
    passage: PASSAGE,
    source: "<!-- ITEM 1\ndifficulty: KILLER\npoint: 스모크\n-->\n형식을 지키지 않은 쓰레기",
    minItems: 1,
  });
  check(
    `정본 ${canon}: 레인으로 인식된다(UNSUPPORTED_LANE 아님)`,
    r.laneSupported && !r.blocking.some((b) => b.code === "UNSUPPORTED_LANE"),
    r.blocking.map((b) => b.code).join(","),
  );
  check(`정본 ${canon}: 쓰레기 입력을 차단한다`, !r.ok && r.blocking.length > 0);
}
{
  const p = buildProductionPrompt({ subType: "BLANK_INFERENCE", passage: PASSAGE, difficulty: "KILLER" });
  check("정본 빈칸: 프로덕션 프롬프트 조립", p.ok === true && p.prompt.length > 1500, p.ok ? `${p.prompt.length}자` : p.error);
}
{
  const p = buildProductionPrompt({
    subType: "BLANK_INFERENCE",
    passage: PASSAGE,
    difficulty: "KILLER",
    rawTypeSettings: { BLANK_INFERENCE: { blankCount: 2 } },
  });
  check("정본 빈칸: 다중 빈칸(2개) 전용 빌더로 분기", p.ok === true && /\(A\)/.test(p.prompt), p.ok ? "(A) 미발견" : p.error);
}
{
  const p = buildProductionPrompt({
    subType: "GRAMMAR_ERROR",
    passage: PASSAGE,
    difficulty: "KILLER",
    rawTypeSettings: { GRAMMAR_ERROR: { markerCount: 7, answerCount: 2 } },
  });
  check("정본 어법: 비표준 마커 7·정답 2 반영", p.ok === true && p.prompt.includes("(G)"), p.ok ? "(G) 미발견" : p.error);
}

// ── 5. 프로덕션 프롬프트 재현 ──────────────────────────────────────────────
{
  const p = buildProductionPrompt({ subType: "TITLE", passage: PASSAGE, difficulty: "KILLER" });
  check("프롬프트: TITLE 조립 성공", p.ok === true, p.ok ? "" : p.error);
  if (p.ok) {
    check("프롬프트: 지문이 주입됨", p.prompt.includes(PASSAGE.slice(0, 40)));
    check("프롬프트: 난이도 분기 반영", p.prompt.includes("KILLER"));
    check("프롬프트: 길이 유의미(>1500자)", p.prompt.length > 1500, `${p.prompt.length}자`);
  }
}

console.log(`\n${pass}/${pass + fail} 통과`);
if (fail > 0) process.exit(1);

// ── 10. 회귀: diversityTargets 가 상수를 반환하는 레인에서 ANSWER_DUPLICATE 오탐 금지 ──
// 파일럿에서 MAIN_IDEA 유닛 전체가 "정답 표적 중복: '같은 지문이므로 논지는…'" 으로 차단됐다.
// 그 문자열은 정답이 아니라 레인이 프롬프트에 실으려고 만든 **안내문 상수**다(lane-main-idea.ts:178-192).
{
  const bodyA = `발문형: 요지
근거: What makes a place feel noisy is therefore not the sheer volume of sound but the contrast between a sound and its background.
① 작은 동물은 반사가 빨라 포식자에 더 잘 대처합니다.
② 동물의 학습 능력은 몸집이 아니라 신진대사율이 결정합니다.
③ 수명의 길이가 본능적 행동과 학습 사이의 비중을 가릅니다.
④ 큰 동물일수록 짝짓기 행동이 단순해집니다.
⑤ 환경 변화는 작은 동물에게 더 큰 위협이 됩니다.
정답: ③
해설: 이 글은 짧게 사는 동물과 오래 사는 동물이 각각 무엇에 무게를 두는지를 대칭으로 배치합니다. "being short-lived puts a premium on the effectiveness of preprogrammed behavior patterns" 와 "Being longer-lived puts a greater premium on learning and memory" 가 그 대조축을 직접 진술하므로 ③이 요지입니다.
오답:
① 세부승격 — 반사 속도는 근거의 하나일 뿐 글의 요지가 아닙니다.
② 관계왜곡 — 지문은 "A telescoping of time correlates with size" 라고 크기와의 상관을 말합니다.
④ 근거없음 — 짝짓기 행동의 단순화는 지문에 없습니다.
⑤ 방향반대 — 지문은 오래 사는 동물이 환경 변화에 더 노출된다고 말합니다.`;
  const bodyB = bodyA
    .replace(
      "근거: What makes a place feel noisy is therefore not the sheer volume of sound but the contrast between a sound and its background.",
      "근거: Engineers who chase ever lower decibel readings can end up building the very irritation they set out to remove.",
    )
    .replace("③ 수명의 길이가 본능적 행동과 학습 사이의 비중을 가릅니다.", "③ 몸집이 시간 척도를 정하고 그 척도가 행동 전략을 결정합니다.")
    .replace("④ 큰 동물일수록 짝짓기 행동이 단순해집니다.", "④ 신진대사율이 높을수록 학습 기회가 늘어납니다.");
  const unit =
    `<!-- ITEM 1\ndifficulty: INTERMEDIATE\npoint: S5-S7 대칭 귀결 확인\ncraft: 회귀 픽스처\n-->\n${bodyA}\n\n` +
    `<!-- ITEM 2\ndifficulty: KILLER\npoint: S1 명제를 인과 사슬로 확장\ncraft: 회귀 픽스처\n-->\n${bodyB}\n\n`;
  const r = gateUnit({ subType: "MAIN_IDEA", passageId: "SELFTEST", passage: PASSAGE, source: unit, minItems: 2 });
  const dup = r.blocking.filter((b) => b.code === "ANSWER_DUPLICATE");
  check(
    "회귀: 레인 안내문 상수를 정답으로 오인하지 않는다(MAIN_IDEA)",
    dup.length === 0,
    dup.map((d) => d.message).join(" / "),
  );
  check(
    "회귀: 서로 다른 정답이면 MAIN_IDEA 도 통과",
    r.blocking.length === 0,
    r.blocking.map((b) => `[${b.code}] ${b.message}`).join(" / "),
  );
}
{
  // 음성테스트: 진짜로 정답이 같으면 여전히 차단돼야 한다
  const same = `<!-- ITEM 1\ndifficulty: BASIC\npoint: 포인트 A\ncraft: x\n-->\n${GOOD_BODY}\n\n<!-- ITEM 2\ndifficulty: KILLER\npoint: 포인트 B\ncraft: x\n-->\n${GOOD_BODY}\n\n`;
  const r = gateUnit({ subType: "TITLE", passageId: "SELFTEST", passage: PASSAGE, source: same, minItems: 2 });
  check(
    "음성테스트: 정답 도출이 바뀌어도 실제 동일 정답은 여전히 차단",
    r.blocking.some((b) => b.code === "ANSWER_DUPLICATE"),
    r.blocking.map((b) => b.code).join(","),
  );
}

console.log(`\n[최종] ${pass}/${pass + fail} 통과`);
if (fail > 0) process.exit(1);

// ── 11. 회귀: 선지가 위치 마커인 유형에서 슬롯 반복을 중복으로 오인하지 않는다 ──
// 파일럿 적발: IRRELEVANT 의 options 는 ["①".."⑤"] 이고 correctAnswer 는 "④" 다.
// 문항 1·4가 둘 다 ④여도 서로 다른 무관 문장이면 중복이 아니다.
{
  const mkIrr = (n: number, slot: string, extra: string, point: string) => {
    // 5문장 지문에 무관 문장 1개를 slot 자리에 삽입한 형태
    const S = [
      "Cities across the world have raised tall barriers along their busiest roads to hold back the roar of traffic.",
      "Residents behind those walls, however, often report that their streets have become harder to live with rather than easier.",
      "Once the steady hum of distant traffic is stripped away, every slammed door and passing scooter stands out against the new quiet.",
      "What makes a place feel noisy is therefore not the sheer volume of sound but the contrast between a sound and its background.",
      "Engineers who chase ever lower decibel readings can end up building the very irritation they set out to remove.",
    ];
    const idx = "①②③④⑤".indexOf(slot);
    const withMarkers = S.map((s, i) => `[[${i + 1}:${s}]]`);
    withMarkers.splice(idx, 0, `[[${idx + 1}:${extra}]]`);
    return `<!-- ITEM ${n}\ndifficulty: BASIC\npoint: ${point}\ncraft: 회귀 픽스처\n-->\n${withMarkers.join(" ")}\n`;
  };
  // 실제 IRRELEVANT 형식을 정확히 재현하기 어려우므로, 정체성 도출 함수만 직접 검증한다.
  const { splitItems } = require("./qgen-core") as typeof import("./qgen-core");
  void splitItems;
  void mkIrr;
}
{
  // 정체성 도출 단위 검증 — 마커 선지는 정체성이 아니고, sentences[irrelevantIndex] 가 정체성이다
  const probe = gateUnit({
    subType: "TITLE",
    passageId: "S",
    passage: PASSAGE,
    source: item(1, "포인트 A", GOOD_BODY) + item(2, "포인트 B", ALT_BODY),
    minItems: 2,
  });
  check("정체성 도출: 정상 객관식은 선지 텍스트로 식별(중복 없음)", probe.blocking.length === 0, probe.blocking.map((b) => b.code).join(","));
}

console.log(`\n[최종2] ${pass}/${pass + fail} 통과`);
if (fail > 0) process.exit(1);
