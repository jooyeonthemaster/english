import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// ============================================================================
// A4-조립 — 신유형 12종(화법·작문·매체·국어사·독서론) 레지스트리 편입 검증
// ============================================================================
// (1) 소스 가드: 레지스트리 12종 등록 + 신설 uiGroup("국어 화법·작문·매체")의
//     하드코딩 그룹 목록 4벌(question-type-ui / 생성패널 constants / 필터) 등록.
// (2) 품질코드 전수 커버리지: korean lib 이 발화하는 모든 ko-* 코드가 codes.ts
//     3집합 분류(BLOCKING/WARNING)에 존재하는지 소스 스캔.
// (3) 동작 하니스(tsx): 레지스트리 38종 불변식 · 파생 전파(TYPE_LABELS ·
//     MC_TYPE_IDS · PASSTHROUGH · language · passage-policy · UI 그룹) ·
//     3집합 불변식(RELAXED_BLOCKING ⊇ KO_BLOCKING, SHIP_FIRST 교집합 0) ·
//     12유형 각각 스모크(정상 봉투 = error 0 / 선지 결손·자료 결손 = 차단 발화).
// ============================================================================

const NEW_TYPE_IDS = [
  "KO_RD_THEORY",
  "KO_SP_STRAT",
  "KO_SP_PLAN",
  "KO_SP_AUD",
  "KO_SP_FUNC",
  "KO_SP_DEBATE",
  "KO_WR_PLAN",
  "KO_WR_METHOD",
  "KO_WR_COND",
  "KO_WR_REVISE",
  "KO_MD_LANG",
  "KO_GR_HIST",
];

const NEW_GROUP = "국어 화법·작문·매체";

// ── (1) 소스 가드 ──────────────────────────────────────────────────────────

test("registry/index.ts: 신규 12종 import + MODULES 등록", () => {
  const src = readFileSync(
    path.join(repoRoot, "src", "lib", "korean", "registry", "index.ts"),
    "utf8",
  );
  for (const id of NEW_TYPE_IDS) {
    assert.ok(src.includes(`from "../types/${id}"`), `${id} import 누락`);
    assert.ok(new RegExp(`\\b${id}\\b[,\\s]`).test(src.split("MODULES")[1] ?? ""), `${id} MODULES 등록 누락`);
  }
});

test(`uiGroup "${NEW_GROUP}" 하드코딩 그룹 목록 등록(4곳)`, () => {
  const files = [
    ["src/lib/question-type-ui.ts", 2], // QuestionTypeCategory 유니온 + KO_GROUP_ORDER
    ["src/app/(director)/director/workbench/generate/generation-config-panel-parts/constants.ts", 2], // GROUP_ORDER + GROUP_LABELS
    ["src/components/workbench/question-type-filter.tsx", 1], // KO_UI_GROUPS
    ["src/lib/korean/registry/type-module.ts", 1], // KoTypeMeta.uiGroup 유니온
  ];
  for (const [rel, minCount] of files) {
    const src = readFileSync(path.join(repoRoot, ...rel.split("/")), "utf8");
    const count = src.split(NEW_GROUP).length - 1;
    assert.ok(
      count >= minCount,
      `${rel}: "${NEW_GROUP}" 등장 ${count}회 < ${minCount}회 — 그룹 미등록이면 유형이 UI에서 조용히 소실`,
    );
  }
});

// ── (2) 품질코드 전수 커버리지 (소스 스캔) ─────────────────────────────────

function walkTsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walkTsFiles(p));
    else if (entry.endsWith(".ts")) out.push(p);
  }
  return out;
}

test("korean lib 발화 ko-* 코드 전수가 codes.ts 에 분류되어 있음", () => {
  const codesSrc = readFileSync(
    path.join(repoRoot, "src", "lib", "korean", "quality", "codes.ts"),
    "utf8",
  );
  const registered = new Set([...codesSrc.matchAll(/"(ko-[a-z0-9-]+)"/g)].map((m) => m[1]));

  // sets/ 는 제외 — 세트 레이어는 자체 코드 체계(KoSetLeakageCode·프리셋 id,
  // ko-set-*/ko-suneung-*/ko-naesin-*)를 쓰고 RELAXED_BLOCKING 경로를 타지 않는다.
  const koRoot = path.join(repoRoot, "src", "lib", "korean");
  const emitted = new Set();
  for (const file of walkTsFiles(koRoot)) {
    if (path.dirname(file).endsWith(`${path.sep}sets`)) continue;
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/"(ko-[a-z0-9-]+)"/g)) emitted.add(m[1]);
  }
  const unregistered = [...emitted].filter((c) => !registered.has(c)).sort();
  assert.deepEqual(
    unregistered,
    [],
    `codes.ts 미분류 코드 발견 — relaxed 폴백에서 error 가 warning 강등 출하됨: ${unregistered.join(", ")}`,
  );
});

// ── (3) 동작 하니스 (tsx) — 픽스처는 JSON 파일로 전달 ──────────────────────
// 픽스처 출처: 각 유형 팬아웃의 자가검증 스모크(정상 문항 = error 0 확증분).

const FIXTURES = {
  KO_RD_THEORY: {
    passage:
      "초인지는 자신의 읽기 과정을 인식하고 조절하는 능력이다. 점검하기는 읽기 중에 자신의 이해 여부를 확인하는 활동이고, 조정하기는 점검 결과 이해에 실패했다고 판단한 경우에만 다시 읽기나 속도 조절 같은 전략을 동원하는 활동이다. 능숙한 독자는 글의 화제와 자신의 배경지식을 읽기 전에 관련짓는다.",
    difficulty: "BASIC",
    question: {
      questionForm: "MEMO_MAPPING",
      answerFlaw: "CONDITION_DROP",
      direction: "다음은 학생이 작성한 메모이다. ⓐ~ⓔ 중 적절하지 않은 것은?",
      koStimulus: [
        {
          kind: "PLAN_NOTE",
          title: "'우주 탐사의 역사'를 읽고 쓴 메모",
          lines: [
            "읽기 전에 목차를 훑으며 글의 화제를 예측했다.",
            "읽기 전에 우주 탐사에 대한 배경지식을 떠올렸다.",
            "읽는 중에 각 문단의 이해 여부를 스스로 확인했다.",
            "이해가 잘 되는 부분도 매번 처음으로 돌아가 다시 읽었다.",
            "읽은 후에 글의 중심 내용을 요약해 두었다.",
          ],
        },
      ],
      markers: [
        { family: "LATIN_CIRCLED", label: "ⓐ", spanText: "글의 화제를 예측했다", targetSurface: "stimulus" },
        { family: "LATIN_CIRCLED", label: "ⓑ", spanText: "배경지식을 떠올렸다", targetSurface: "stimulus" },
        { family: "LATIN_CIRCLED", label: "ⓒ", spanText: "이해 여부를 스스로 확인했다", targetSurface: "stimulus" },
        { family: "LATIN_CIRCLED", label: "ⓓ", spanText: "매번 처음으로 돌아가 다시 읽었다", targetSurface: "stimulus" },
        { family: "LATIN_CIRCLED", label: "ⓔ", spanText: "중심 내용을 요약해 두었다", targetSurface: "stimulus" },
      ],
      options: [
        { label: "①", text: "ⓐ" },
        { label: "②", text: "ⓑ" },
        { label: "③", text: "ⓒ" },
        { label: "④", text: "ⓓ" },
        { label: "⑤", text: "ⓔ" },
      ],
      correctAnswer: "④",
      explanation:
        "지문은 '조정하기는 점검 결과 이해에 실패했다고 판단한 경우에만 다시 읽기나 속도 조절 같은 전략을 동원하는 활동이다'라고 하였다. ⓓ는 이해가 잘 되는 부분까지 매번 다시 읽었다는 것이므로 조건을 어긴 적용이다.",
      wrongOptionExplanations: [
        { label: "①", explanation: "화제 예측은 읽기 전 활동으로 적절하다." },
        { label: "②", explanation: "배경지식 관련짓기는 지문의 능숙한 독자 행동과 부합한다." },
        { label: "③", explanation: "이해 여부 확인은 점검하기에 해당한다." },
        { label: "⑤", explanation: "요약은 읽은 후 활동으로 적절하다." },
      ],
      evidence: [
        { optionLabel: "①", spanText: "글의 화제와 자신의 배경지식을 읽기 전에 관련짓는다", relation: "SUPPORTS" },
        { optionLabel: "②", spanText: "글의 화제와 자신의 배경지식을 읽기 전에 관련짓는다", relation: "SUPPORTS" },
        { optionLabel: "③", spanText: "점검하기는 읽기 중에 자신의 이해 여부를 확인하는 활동", relation: "SUPPORTS" },
        { optionLabel: "④", spanText: "이해에 실패했다고 판단한 경우에만 다시 읽기나 속도 조절 같은 전략을 동원", relation: "DISTORTS" },
        { optionLabel: "⑤", spanText: "자신의 읽기 과정을 인식하고 조절하는 능력", relation: "SUPPORTS" },
      ],
      points: 3,
      keyPoints: ["초인지", "점검하기와 조정하기의 구분", "조정하기의 조건"],
      tags: ["독서론", "읽기 이론"],
      difficulty: "BASIC",
    },
  },
  KO_SP_STRAT: {
    passage:
      "도시 열섬 현상은 도심의 기온이 주변 지역보다 높아지는 현상이다. 아스팔트와 콘크리트는 낮 동안 태양열을 흡수했다가 밤에 방출하여 도심의 야간 기온을 끌어올린다. 옥상 녹화와 가로수 확충은 증산 작용을 통해 도심의 기온을 낮추는 효과가 있다.",
    difficulty: "BASIC",
    question: {
      direction: "위 발표자의 말하기 방식으로 가장 적절한 것은?",
      stemPolarity: "POSITIVE",
      koStimulus: [
        {
          kind: "SPEECH_SCRIPT",
          lines: [
            "안녕하세요. 이번 시간 발표를 맡은 김지우입니다. 오늘은 도시 열섬 현상에 대해 발표하려고 합니다.",
            "지난여름 밤에도 우리 동네가 유난히 더웠던 경험, 다들 있으시죠? (청중의 반응을 살피며) 저도 그 이유가 궁금해서 이 화제를 골랐습니다.",
            "(화면을 가리키며) 이 지도를 보시면 도심의 기온이 주변보다 3도나 높습니다. 아스팔트가 낮에 머금은 열을 밤에 내뿜기 때문인데요, 옥상에 정원을 만들면 기온을 낮출 수 있다고 합니다.",
            "여러분도 등굣길 가로수의 고마움을 한 번 떠올려 보시길 바라며, 이만 발표를 마치겠습니다. 감사합니다.",
          ],
        },
      ],
      options: [
        { label: "①", text: "청중의 경험을 환기하는 질문을 던져 화제에 대한 관심을 유도하고 있다." },
        { label: "②", text: "전문가의 견해를 인용하여 발표 내용의 신뢰성을 높이고 있다." },
        { label: "③", text: "발표 순서를 미리 안내하여 청중의 이해를 돕고 있다." },
        { label: "④", text: "구체적인 수치를 제시하여 청중의 흥미를 잃게 하고 있다." },
        { label: "⑤", text: "비유적 표현을 활용하여 대상의 특징을 청중에게 강조하고 있다." },
      ],
      correctAnswer: "①",
      wrongOptionDesign: [
        { label: "②", principle: "ACT_ABSENT" },
        { label: "③", principle: "ACT_ABSENT" },
        { label: "④", principle: "PURPOSE_MISMATCH" },
        { label: "⑤", principle: "ACT_ABSENT" },
      ],
      evidence: [
        { optionLabel: "①", spanText: "지난여름 밤에도 우리 동네가 유난히 더웠던 경험, 다들 있으시죠?", relation: "SUPPORTS" },
        { optionLabel: "②", spanText: "옥상에 정원을 만들면 기온을 낮출 수 있다고 합니다", relation: "NOT_MENTIONED" },
        { optionLabel: "③", spanText: "오늘은 도시 열섬 현상에 대해 발표하려고 합니다", relation: "NOT_MENTIONED" },
        { optionLabel: "④", spanText: "이 지도를 보시면 도심의 기온이 주변보다 3도나 높습니다", relation: "DISTORTS" },
        { optionLabel: "⑤", spanText: "아스팔트가 낮에 머금은 열을 밤에 내뿜기 때문인데요", relation: "NOT_MENTIONED" },
      ],
      explanation: "발표자는 도입부에서 청중의 여름밤 경험을 묻는 질문을 던져 화제에 대한 관심을 유도하고 있다.",
      wrongOptionExplanations: [
        { label: "②", explanation: "인용 행위가 발표문에 없다." },
        { label: "③", explanation: "발표 순서 안내가 없다." },
        { label: "④", explanation: "수치 제시는 있으나 효과 서술이 왜곡되었다." },
        { label: "⑤", explanation: "비유적 표현이 발표문에 없다." },
      ],
      keyPoints: ["발표 말하기 방식", "행위-목적 정합", "괄호 지시문 근거"],
      tags: ["화법", "발표"],
      difficulty: "BASIC",
    },
  },
  KO_SP_PLAN: {
    passage: "",
    difficulty: "INTERMEDIATE",
    question: {
      direction: "다음은 발표 전 계획이다. 발표에 반영되지 않은 것은?",
      options: [
        { label: "①", text: "지난 시간에 배운 내용을 환기하고, 발표의 화제가 ‘고맥락 문화’임을 소개해야겠어." },
        { label: "②", text: "‘고맥락 문화’의 개념을 ‘저맥락 문화’와 비교하여 제시해야겠어." },
        { label: "③", text: "‘고맥락 문화’의 상황 중심적인 특징을 예를 중심으로 설명해야겠어." },
        { label: "④", text: "‘고맥락 문화’의 관계 중심적인 특징을 장단점을 중심으로 분석해야겠어." },
        { label: "⑤", text: "발표 주제를 언급하고, ‘고맥락 문화’와 관련하여 청중에게 기대하는 바를 언급해야겠어." },
      ],
      correctAnswer: "④",
      explanation:
        "발표는 관계 중심적 특징을 종결 표현의 예로 설명했을 뿐, 장단점을 중심으로 분석하지 않았다. 따라서 ④의 계획은 발표에 반영되지 않았다. 나머지 계획은 발표문에서 실행 흔적이 확인된다.",
      wrongOptionExplanations: [
        { label: "①", explanation: "지난 시간 내용 환기와 화제 소개가 발표 서두에 실행되었다." },
        { label: "②", explanation: "고맥락·저맥락 문화의 개념 비교가 실행되었다." },
        { label: "③", explanation: "상황 중심적 특징을 초대 손님 예시로 설명하였다." },
        { label: "⑤", explanation: "주제 언급과 청중에게 기대하는 바가 마무리에 실행되었다." },
      ],
      evidence: [
        { optionLabel: "①", relation: "SUPPORTS", spanText: "지난 시간에 대화의 원리에 대해 배운 것 기억하시나요?" },
        { optionLabel: "②", relation: "SUPPORTS", spanText: "명시적 의미에 더 의존하는 문화를 저맥락 문화라고 합니다" },
        { optionLabel: "③", relation: "SUPPORTS", spanText: "예를 들어 손님을 초대하고서" },
        { optionLabel: "④", relation: "NOT_MENTIONED", spanText: "또 다른 특징은 관계 중심적이라는 것입니다" },
        { optionLabel: "⑤", relation: "SUPPORTS", spanText: "여러분도 일상 대화 속 고맥락 문화의 특징을 한번 찾아보시기 바랍니다" },
      ],
      koStimulus: [
        {
          kind: "PLAN_NOTE",
          title: "발표 전 계획",
          lines: [
            "[도입]",
            "◦ 지난 시간에 배운 내용을 환기하고, 발표의 화제가 ‘고맥락 문화’임을 소개해야겠어.",
            "[전개]",
            "◦ ‘고맥락 문화’의 개념을 ‘저맥락 문화’와 비교하여 제시해야겠어.",
            "◦ ‘고맥락 문화’의 상황 중심적인 특징을 예를 중심으로 설명해야겠어.",
            "◦ ‘고맥락 문화’의 관계 중심적인 특징을 장단점을 중심으로 분석해야겠어.",
            "[정리]",
            "◦ 발표 주제를 언급하고, ‘고맥락 문화’와 관련하여 청중에게 기대하는 바를 언급해야겠어.",
          ],
        },
        {
          kind: "SPEECH_SCRIPT",
          title: "발표문",
          lines: [
            "안녕하세요? 지난 시간에 대화의 원리에 대해 배운 것 기억하시나요? 상대의 체면을 중시하는 우리 문화가 고맥락 문화와 관련되어 있다는 사실을 알고 계셨나요? (대답을 듣고) 오늘은 고맥락 문화에 대해 조사한 내용을 발표하겠습니다.",
            "문화인류학자 홀에 따르면 비언어적 표현이나 상황 등에 더 의존하는 문화를 고맥락 문화, 반대로 명시적 의미에 더 의존하는 문화를 저맥락 문화라고 합니다.",
            "고맥락 문화의 특징 중 하나는 상황 중심적이라는 것인데요, 예를 들어 손님을 초대하고서 “차린 것은 없지만 맛있게 드세요.”라고 말하는 경우가 있습니다.",
            "또 다른 특징은 관계 중심적이라는 것입니다. 화자가 청자의 부담을 덜어 주기 위해 종결 표현을 원래 의도와 다르게 사용하는 것입니다.",
            "지금까지 의사소통 방식에 반영된 고맥락 문화의 특징을 살펴보았습니다. 여러분도 일상 대화 속 고맥락 문화의 특징을 한번 찾아보시기 바랍니다. 감사합니다.",
          ],
        },
      ],
      keyPoints: ["계획-실행 대조", "부분 실행 함정", "발표 담화 구조"],
      tags: ["화법", "발표", "계획 반영"],
      difficulty: "INTERMEDIATE",
      speechTopic: "고맥락 문화",
      trapDesign: "MATERIAL_OVERLAP",
    },
  },
  KO_SP_AUD: {
    passage: "소금은 인류의 식생활에서 오래도록 중요한 자리를 차지해 왔다.",
    difficulty: "INTERMEDIATE",
    question: {
      direction: "발표 내용을 바탕으로 할 때, <보기>에 나타난 학생들의 반응에 대한 이해로 가장 적절한 것은?",
      koStimulus: [
        {
          kind: "SPEECH_SCRIPT",
          title: "천일염 이야기",
          lines: [
            "안녕하세요. 오늘 발표를 맡은 ○○입니다. 여러분, 매일 식탁에 오르는 소금이 어떻게 만들어지는지 생각해 보신 적 있나요? 오늘은 천일염의 생산 과정과 소금의 쓰임에 대해 발표하겠습니다.",
            "(자료를 가리키며) 이 사진은 서해안의 염전입니다. 천일염은 바닷물을 염전에 가두고 햇볕과 바람으로 수분을 증발시켜 얻습니다. 보건 당국의 자료에 따르면 천일염 100그램에는 나트륨이 약 33그램 들어 있다고 합니다.",
            "소금은 음식의 간을 맞출 뿐 아니라 배추를 절일 때처럼 채소의 수분을 빼내는 데에도 쓰입니다. 절임 음식을 만들 때 소금물의 농도를 조절하면 식감을 살릴 수 있습니다.",
            "(청중의 반응을 살피며) 끝으로, 소금은 우리 몸에 꼭 필요하지만 과다 섭취는 건강을 해칠 수 있으니 적정량을 지켜 섭취하시길 당부드립니다. 이상으로 발표를 마치겠습니다.",
          ],
        },
      ],
      bogi: {
        label: "보기",
        lines: [
          "학생 1: 천일염이 햇볕과 바람으로 만들어진다는 건 알겠는데, 염전의 증발 방식이 지역마다 어떻게 다른지는 발표에서 다루지 않아 궁금해.",
          "학생 2: 나트륨 함량 수치는 보건 당국 자료라고 했지만 구체적인 출처가 언급되지 않아서 정확한 정보인지 확인이 필요해.",
          "학생 3: 지난 과학 시간에 배운 삼투 현상이 떠올랐어. 집에서 절임 음식을 만들 때 소금물 농도 조절을 유용하게 활용할 수 있겠어.",
        ],
      },
      reactionMap: [
        { student: "학생 1", metatype: "CURIOSITY" },
        { student: "학생 2", metatype: "CREDIBILITY_CHECK" },
        { student: "학생 3", metatype: "BACKGROUND_KNOWLEDGE" },
        { student: "학생 3", metatype: "USEFULNESS_EVAL" },
      ],
      distractorPrinciples: ["METATYPE_MISATTRIBUTION", "NOT_IN_REACTION", "COMBO_HALF_TRUE"],
      options: [
        { label: "①", text: "학생 1은 발표에서 다루지 않은 내용에 대해 궁금증을 드러내고 있다." },
        { label: "②", text: "학생 2는 발표 정보가 실생활에 도움이 되는지 그 유용성을 평가하고 있다." },
        { label: "③", text: "학생 3은 발표 내용과 관련된 자료를 검색해 보려는 추가 탐색을 계획하고 있다." },
        { label: "④", text: "학생 1과 학생 2는 모두 발표에서 언급되지 않은 내용을 짐작하며 궁금증을 형성하고 있다." },
        { label: "⑤", text: "학생 2와 학생 3은 모두 자신이 알고 있던 지식을 떠올리며 발표 내용과 관련짓고 있다." },
      ],
      correctAnswer: "①",
      explanation:
        "학생 1은 '염전의 증발 방식이 지역마다 어떻게 다른지는 발표에서 다루지 않아 궁금해'라고 말하며 발표에서 다루지 않은 내용에 대한 궁금증을 형성하고 있다. 학생 2는 출처를 점검하며 신뢰성을 확인하려 하고, 학생 3은 배경지식을 활성화하며 유용성을 평가하고 있다. 따라서 ①이 적절하다.",
      wrongOptionExplanations: [
        { label: "②", explanation: "학생 2는 수치의 출처를 점검하며 신뢰성을 확인하려는 것이지 유용성을 평가하는 것이 아니다." },
        { label: "③", explanation: "학생 3의 반응에는 추가 자료를 검색하겠다는 계획이 나타나 있지 않다." },
        { label: "④", explanation: "궁금증 형성은 학생 1에게만 성립하고 학생 2는 신뢰성을 점검하고 있다 — '모두'가 깨진다." },
        { label: "⑤", explanation: "배경지식 활성화는 학생 3에게만 성립하고 학생 2의 반응에는 나타나지 않는다." },
      ],
      evidence: [
        { optionLabel: "①", spanText: "발표에서 다루지 않아 궁금해", relation: "SUPPORTS" },
        { optionLabel: "②", spanText: "출처가 언급되지 않아서 정확한 정보인지 확인이 필요해", relation: "DISTORTS" },
        { optionLabel: "③", spanText: "절임 음식을 만들 때 소금물 농도 조절을 유용하게 활용할 수 있겠어", relation: "NOT_MENTIONED" },
        { optionLabel: "④", spanText: "구체적인 출처가 언급되지 않아서", relation: "DISTORTS" },
        { optionLabel: "⑤", spanText: "지난 과학 시간에 배운 삼투 현상이 떠올랐어", relation: "DISTORTS" },
      ],
      keyPoints: ["청중 반응의 메타유형 판별", "반응 주체와 판정의 대응 확인", "조합형 선지의 전칭('모두') 검증"],
      tags: ["화법", "발표", "청중 반응 분석"],
      difficulty: "INTERMEDIATE",
      points: 2,
    },
  },
  KO_SP_FUNC: {
    passage: "도시 열섬 현상은 도심의 기온이 주변보다 높은 현상이다.",
    difficulty: "INTERMEDIATE",
    question: {
      direction: "대화의 흐름을 고려할 때, ㉠~㉤에 대한 설명으로 적절하지 않은 것은?",
      koStimulus: [
        {
          kind: "DIALOGUE",
          label: "(가)",
          lines: [
            "사회자: 오늘은 도시 열섬 현상을 주제로 이야기를 나눠 보겠습니다. 박사님, 열섬 현상이 무엇인가요?",
            "전문가: 도심의 기온이 주변 지역보다 높게 나타나는 현상을 말합니다. 인공 구조물이 열을 흡수했다가 천천히 내보내기 때문입니다.",
            "학생: 그러니까 건물과 도로가 낮 동안 모은 열을 밤에 내놓아서 도심이 더 덥다는 말씀이시군요.",
            "전문가: 정확합니다. 특히 여름철 열대야가 심해지는 주된 원인입니다.",
            "학생: 그런데 옥상 녹화가 정말 기온을 낮출 수 있는지는 의문이 듭니다.",
            "전문가: 좋은 지적입니다. 식물의 증산 작용이 주변 열을 흡수하기 때문에 효과가 있습니다.",
            "학생: 실제로 효과를 본 도시의 구체적인 예를 들어 주실 수 있나요?",
            "전문가: 독일의 한 도시는 옥상 녹화 의무화 이후 도심 평균 기온이 낮아졌다는 조사 결과가 있습니다.",
            "사회자: 말씀을 들어 보니 옥상 녹화 외의 대책도 궁금해지는데요, 바람길 조성으로 화제를 옮겨 보겠습니다.",
            "전문가: 바람길은 교외의 찬 공기가 도심으로 흐르도록 건물 배치를 조정하는 방법입니다.",
            "사회자: 오늘 논의를 종합하면, 열섬 현상은 인공 구조물의 축열이 원인이고 옥상 녹화와 바람길 조성이 대안이라는 것이군요.",
            "전문가: 네, 잘 정리해 주셨습니다.",
          ],
        },
      ],
      markers: [
        { family: "KOR_CIRCLED", label: "㉠", spanText: "그러니까 건물과 도로가 낮 동안 모은 열을 밤에 내놓아서 도심이 더 덥다는 말씀이시군요.", targetSurface: "stimulus" },
        { family: "KOR_CIRCLED", label: "㉡", spanText: "그런데 옥상 녹화가 정말 기온을 낮출 수 있는지는 의문이 듭니다.", targetSurface: "stimulus" },
        { family: "KOR_CIRCLED", label: "㉢", spanText: "실제로 효과를 본 도시의 구체적인 예를 들어 주실 수 있나요?", targetSurface: "stimulus" },
        { family: "KOR_CIRCLED", label: "㉣", spanText: "말씀을 들어 보니 옥상 녹화 외의 대책도 궁금해지는데요, 바람길 조성으로 화제를 옮겨 보겠습니다.", targetSurface: "stimulus" },
        { family: "KOR_CIRCLED", label: "㉤", spanText: "오늘 논의를 종합하면, 열섬 현상은 인공 구조물의 축열이 원인이고 옥상 녹화와 바람길 조성이 대안이라는 것이군요.", targetSurface: "stimulus" },
      ],
      utteranceFunctions: [
        { label: "㉠", functionId: "RESTATE", speaker: "학생", rationale: "전문가의 설명을 자신의 말로 바꾸어 확인" },
        { label: "㉡", functionId: "RAISE_QUESTION", speaker: "학생", rationale: "옥상 녹화의 효과에 의문 제기" },
        { label: "㉢", functionId: "REQUEST_EXAMPLE", speaker: "학생", rationale: "구체적 사례 요청" },
        { label: "㉣", functionId: "TOPIC_SHIFT", speaker: "사회자", rationale: "바람길 조성으로 화제 전환" },
        { label: "㉤", functionId: "SYNTHESIZE", speaker: "사회자", rationale: "논의 전체를 종합" },
      ],
      answerClaimedFunctionId: "SUMMARIZE",
      options: [
        { label: "①", text: "㉠: '학생'이 상대의 설명을 자신의 말로 바꾸어 재진술하고 있다." },
        { label: "②", text: "㉡: '학생'이 옥상 녹화의 효과에 의문을 제기하고 있다." },
        { label: "③", text: "㉢: '학생'이 효과를 본 도시의 구체적인 사례를 요청하고 있다." },
        { label: "④", text: "㉣: '사회자'가 바람길 조성이라는 새로운 내용으로 화제를 전환하고 있다." },
        { label: "⑤", text: "㉤: '사회자'가 직전 발화의 내용을 그대로 요약하고 있다." },
      ],
      correctAnswer: "⑤",
      explanation:
        "㉤에서 사회자는 직전 발화만이 아니라 열섬 현상의 원인과 두 가지 대안을 아울러 결론짓고 있으므로, 이는 요약이 아니라 논의 전체를 종합하는 발화이다. 따라서 ⑤가 적절하지 않다.",
      wrongOptionExplanations: [
        { label: "①", explanation: "직전 전문가 발화를 '그러니까 ~ 말씀이시군요'로 바꾸어 확인하므로 재진술이 맞다." },
        { label: "②", explanation: "'의문이 듭니다'로 상대 설명의 타당성에 의문을 제기하므로 맞다." },
        { label: "③", explanation: "'구체적인 예를 들어 주실 수 있나요'로 사례를 요청하므로 맞다." },
        { label: "④", explanation: "옥상 녹화 논의에서 바람길 조성으로 화제를 옮기므로 화제 전환이 맞다." },
      ],
      evidence: [
        { optionLabel: "①", spanText: "그러니까 건물과 도로가 낮 동안 모은 열을 밤에 내놓아서", relation: "SUPPORTS" },
        { optionLabel: "②", spanText: "정말 기온을 낮출 수 있는지는 의문이 듭니다", relation: "SUPPORTS" },
        { optionLabel: "③", spanText: "구체적인 예를 들어 주실 수 있나요", relation: "SUPPORTS" },
        { optionLabel: "④", spanText: "바람길 조성으로 화제를 옮겨 보겠습니다", relation: "SUPPORTS" },
        { optionLabel: "⑤", spanText: "오늘 논의를 종합하면", relation: "DISTORTS" },
      ],
      keyPoints: ["발화 기능은 앞뒤 발화와의 관계로 판정한다", "종합은 여러 발화를 아우른다", "요약과 종합을 구별한다"],
      tags: ["화법", "발화 기능"],
      difficulty: "INTERMEDIATE",
    },
  },
  KO_SP_DEBATE: {
    passage: "",
    difficulty: "INTERMEDIATE",
    question: {
      direction: "'찬성 1'과 '반대 1'의 입론에 대한 설명으로 가장 적절한 것은?",
      koStimulus: [
        {
          kind: "DEBATE",
          lines: [
            "논제: 교내 매점에서 일회용 컵 사용을 금지해야 한다.",
            "사회자: 오늘은 교내 매점 일회용 컵 문제를 논제로 반대신문식 토론을 시작하겠습니다. 먼저 찬성 측이 입론해 주십시오.",
            "찬성 1: 저희는 일회용 컵 사용 금지에 찬성합니다. 학생회 조사에 따르면 우리 학교에서는 하루 평균 300개의 일회용 컵이 버려집니다. 또한 일회용 컵의 재활용률이 5%에 불과하다는 환경부 통계도 있습니다. 쓰레기 처리 비용을 줄이기 위해 금지가 필요합니다.",
            "반대 2: (자료를 가리키며) 찬성 측이 인용한 재활용률 통계는 전국 평균인데, 우리 학교 상황에도 그대로 적용할 수 있습니까?",
            "찬성 1: 우리 학교는 분리배출 시설이 부족해 전국 평균보다 오히려 낮을 가능성이 큽니다.",
            "사회자: 다음으로 반대 측이 입론해 주십시오.",
            "반대 1: 저희는 금지에 반대합니다. 금지보다 다회용 컵 대여제가 실효적입니다. 인근 고등학교는 대여제 도입 후 일회용 컵 사용량이 40% 줄었다는 사례가 있습니다. 또한 금지는 학생의 선택권을 지나치게 제한한다는 부작용이 있습니다.",
            "찬성 2: 반대 측이 든 인근 학교 사례는 대여제 운영 인력이 확보된 경우인데, 우리 학교도 같은 조건이라고 볼 수 있습니까?",
            "반대 1: 학생 자원봉사 제도를 활용하면 인력 문제는 해결할 수 있습니다.",
          ],
        },
      ],
      debateFocus: "STRATEGY",
      debateIssues: ["일회용 컵 금지의 환경적 효과", "금지 정책의 실행 가능성"],
      distortionPrinciple: "HALF_TRUE",
      options: [
        { label: "①", text: "찬성 1은 구체적 수치의 통계를 인용하고 있고, 반대 1은 인근 학교의 사례를 들어 대안을 제시하고 있다." },
        { label: "②", text: "찬성 1은 용어의 개념을 정의하여 논의 범위를 한정하고 있고, 반대 1은 전문가의 견해를 인용하고 있다." },
        { label: "③", text: "찬성 1은 예상되는 반론을 선제적으로 차단하고 있고, 반대 1은 질문을 통해 청중의 동의를 유도하고 있다." },
        { label: "④", text: "찬성 1은 상대의 발언을 재진술한 뒤 문제점을 지적하고 있고, 반대 1은 정책의 부작용을 부인하고 있다." },
        { label: "⑤", text: "찬성 1은 권위 있는 인물의 견해를 직접 인용하고 있고, 반대 1은 용어의 개념을 정의하고 있다." },
      ],
      correctAnswer: "①",
      wrongOptionExplanations: [
        { label: "②", explanation: "찬성 1은 용어 정의 없이 통계로 입론했다." },
        { label: "③", explanation: "예상 반론 차단과 동의 유도 질문은 담화에 없다." },
        { label: "④", explanation: "재진술 후 지적은 반대 신문 단계의 것이며, 반대 1은 부작용을 오히려 인정한다." },
        { label: "⑤", explanation: "직접 인용과 용어 정의는 담화에 없다." },
      ],
      evidence: [
        { optionLabel: "①", spanText: "하루 평균 300개의 일회용 컵이 버려집니다", relation: "SUPPORTS" },
        { optionLabel: "①", spanText: "대여제 도입 후 일회용 컵 사용량이 40% 줄었다는 사례", relation: "SUPPORTS" },
        { optionLabel: "②", spanText: "재활용률이 5%에 불과하다는 환경부 통계", relation: "DISTORTS" },
        { optionLabel: "③", spanText: "저희는 일회용 컵 사용 금지에 찬성합니다", relation: "NOT_MENTIONED" },
        { optionLabel: "④", spanText: "선택권을 지나치게 제한한다는 부작용", relation: "DISTORTS" },
        { optionLabel: "⑤", spanText: "환경부 통계도 있습니다", relation: "DISTORTS" },
      ],
      explanation: "찬성 1은 '하루 평균 300개'라는 수치 통계를 인용했고, 반대 1은 인근 학교 사례로 대여제라는 대안을 제시했다.",
      keyPoints: ["반대신문식 토론의 입론 전략", "통계 인용과 사례 제시의 구분", "대칭 선지의 전수 검증"],
      tags: ["화법", "토론", "입론"],
      difficulty: "INTERMEDIATE",
    },
  },
  KO_WR_PLAN: {
    passage: "층간 소음 갈등에 대한 참고 기사 지문이다. 공동 주택에서 소음 분쟁이 늘고 있다.",
    difficulty: "INTERMEDIATE",
    question: {
      direction: "초고에 반영된 글쓰기 계획으로 적절하지 않은 것은?",
      options: [
        { label: "①", text: "1문단에서 층간 소음 문제의 심각성을 통계 자료로 제시해야겠어." },
        { label: "②", text: "층간 소음의 발생 원인을 건물 구조와 생활 습관으로 나누어 제시해야겠어." },
        { label: "③", text: "전문가의 견해를 인용하여 해결 방안의 신뢰성을 높여야겠어." },
        { label: "④", text: "층간 소음 저감 매트의 장단점을 비교하여 균형 있게 다뤄야겠어." },
        { label: "⑤", text: "이웃 간 배려를 당부하며 글을 마무리해야겠어." },
      ],
      correctAnswer: "④",
      explanation:
        "④의 계획은 저감 매트의 장단점을 비교하겠다는 것인데, 초고 2문단은 '발소리가 눈에 띄게 줄어드는 장점이 있다'며 장점만 서술하고 단점은 다루지 않았다. 개념은 등장하지만 핵심 행위인 비교가 실행되지 않은 부분 실행이다. 나머지 계획은 각 문단에서 실행 흔적이 확인된다.",
      wrongOptionExplanations: [
        { label: "①", explanation: "1문단이 민원 3,200건 통계로 심각성을 제시해 반영되었다." },
        { label: "②", explanation: "2문단이 건물 구조와 생활 습관으로 원인을 나누어 반영되었다." },
        { label: "③", explanation: "2문단이 김○○ 박사의 말을 직접 인용해 반영되었다." },
        { label: "⑤", explanation: "3문단이 배려를 당부하며 마무리해 반영되었다." },
      ],
      evidence: [
        { optionLabel: "①", relation: "SUPPORTS", spanText: "지난해 우리 지역의 층간 소음 민원은 3,200건으로 3년 전보다 두 배 가까이 늘었다" },
        { optionLabel: "②", relation: "SUPPORTS", spanText: "바닥이 얇은 건물 구조에서 비롯되기도 하고, 늦은 시간에 세탁기를 돌리는 생활 습관에서 비롯되기도 한다" },
        { optionLabel: "③", relation: "SUPPORTS", spanText: "건축음향 전문가 김○○ 박사는 “바닥 완충재를 보강하면 소음이 크게 줄어든다.”라고 말했다" },
        { optionLabel: "④", relation: "DISTORTS", spanText: "층간 소음 저감 매트를 깔면 발소리가 눈에 띄게 줄어드는 장점이 있다" },
        { optionLabel: "⑤", relation: "SUPPORTS", spanText: "서로의 생활을 조금씩 배려하는 마음이 이웃의 밤을 지켜 줄 것이다" },
      ],
      koStimulus: [
        {
          kind: "PLAN_NOTE",
          label: "(가)",
          title: "글쓰기 계획",
          lines: [
            "작문 상황: 학교 신문에 층간 소음 문제를 알리는 글을 쓰려 함.",
            "○ 1문단에서 층간 소음 문제의 심각성을 통계 자료로 제시해야겠어.",
            "○ 층간 소음의 발생 원인을 건물 구조와 생활 습관으로 나누어 제시해야겠어.",
            "○ 전문가의 견해를 인용하여 해결 방안의 신뢰성을 높여야겠어.",
            "○ 층간 소음 저감 매트의 장단점을 비교하여 균형 있게 다뤄야겠어.",
            "○ 이웃 간 배려를 당부하며 글을 마무리해야겠어.",
          ],
        },
        {
          kind: "DRAFT",
          label: "(나)",
          title: "학생의 초고",
          lines: [
            "지난해 우리 지역의 층간 소음 민원은 3,200건으로 3년 전보다 두 배 가까이 늘었다. 밤늦게 울리는 발소리 때문에 잠을 설치는 이웃이 그만큼 많아진 것이다.",
            "층간 소음은 바닥이 얇은 건물 구조에서 비롯되기도 하고, 늦은 시간에 세탁기를 돌리는 생활 습관에서 비롯되기도 한다. 건축음향 전문가 김○○ 박사는 “바닥 완충재를 보강하면 소음이 크게 줄어든다.”라고 말했다. 실제로 층간 소음 저감 매트를 깔면 발소리가 눈에 띄게 줄어드는 장점이 있다.",
            "층간 소음은 제도만으로 해결되지 않는다. 서로의 생활을 조금씩 배려하는 마음이 이웃의 밤을 지켜 줄 것이다.",
          ],
        },
      ],
      trapPrinciple: "PARTIAL_EXECUTION",
      trapAnchor: {
        baitSpan: "층간 소음 저감 매트를 깔면 발소리가 눈에 띄게 줄어드는 장점이 있다",
        missingElement: "장단점 비교 중 단점 서술",
      },
      keyPoints: ["계획-초고 대조", "부분 실행 함정", "반영 근거 앵커"],
      tags: ["작문", "글쓰기 계획 반영"],
      difficulty: "INTERMEDIATE",
    },
  },
  KO_WR_METHOD: {
    passage: "쓰레기 문제에 대한 사용자 소재 지문(참고용).",
    difficulty: "INTERMEDIATE",
    question: {
      direction: "윗글(초고)에 활용된 글쓰기 방식으로 가장 적절한 것은?",
      stemPolarity: "POSITIVE",
      koStimulus: [
        {
          kind: "DRAFT",
          title: "분리배출 실천을 늘리자",
          lines: [
            "우리 학교의 분리배출 실천율은 왜 낮은 것일까? 그것은 배출 기준을 정확히 모르는 학생이 많기 때문이다.",
            "학생회 설문 조사 결과 응답자의 73%가 페트병 라벨을 떼지 않고 버린 경험이 있다고 답했다. 이는 분리배출이 습관으로 자리 잡지 못했음을 보여 준다.",
            "실제로 인근의 한별고는 교실마다 분리배출 안내판을 붙여 실천율을 높였다. 시청도 청사에 라벨 제거 도구를 비치하여 효과를 거두었다.",
            "분리배출은 귀찮은 숙제가 아니라 지구에 보내는 작은 편지이다. 우리 모두 오늘부터 실천에 동참하자.",
          ],
        },
      ],
      usedMethods: ["QUESTION_ANSWER", "STATISTIC_CITATION", "EXAMPLE_LISTING", "ANALOGY"],
      optionDesigns: [
        { label: "①", method: "QUESTION_ANSWER", target: "분리배출 실천율이 낮은 원인", status: "VALID" },
        { label: "②", method: "CONTRAST", target: "분리배출 기준의 차이", status: "METHOD_ABSENT" },
        { label: "③", method: "STATISTIC_CITATION", target: "안내판 설치의 성과", status: "TARGET_MISMATCH" },
        { label: "④", method: "REBUTTAL", target: "실천 방안의 한계", status: "METHOD_ABSENT" },
        { label: "⑤", method: "CHRONOLOGICAL", target: "분리배출 제도의 변천", status: "METHOD_ABSENT" },
      ],
      options: [
        { label: "①", text: "묻고 답하는 방식으로 분리배출 실천율이 낮은 원인을 드러내고 있다." },
        { label: "②", text: "두 학교의 배출 기준을 대조하여 차이를 밝히고 있다." },
        { label: "③", text: "설문 조사 결과의 통계 수치를 인용하여 안내판 설치의 성과를 강조하고 있다." },
        { label: "④", text: "예상되는 반론을 제시하고 반박하며 실천 방안의 설득력을 높이고 있다." },
        { label: "⑤", text: "시기별로 분리배출 제도의 변천 과정을 제시하고 있다." },
      ],
      correctAnswer: "①",
      explanation:
        "초고 1문단은 '왜 낮은 것일까?'라고 스스로 물음을 던진 뒤 그 원인을 답하는 문답 방식으로 내용을 조직하고 있다. 통계는 실천 습관 부재를 보이는 데 쓰였고, 대조·반론 재반박·시기별 전개는 초고에 나타나지 않는다. 따라서 ①이 적절하다.",
      wrongOptionExplanations: [
        { label: "②", explanation: "두 대상을 맞세워 차이를 밝히는 대조는 초고에 쓰이지 않았다." },
        { label: "③", explanation: "통계 인용은 실재하지만 그 대상은 라벨 미제거 실태이지 안내판 설치의 성과가 아니다." },
        { label: "④", explanation: "예상 반론을 가정하고 되받는 부분은 초고에 없다." },
        { label: "⑤", explanation: "시간의 흐름에 따른 전개는 나타나지 않는다." },
      ],
      evidence: [
        { optionLabel: "①", relation: "SUPPORTS", spanText: "분리배출 실천율은 왜 낮은 것일까? 그것은 배출 기준을 정확히 모르는 학생이 많기 때문이다" },
        { optionLabel: "②", relation: "NOT_MENTIONED", spanText: "교실마다 분리배출 안내판을 붙여" },
        { optionLabel: "③", relation: "DISTORTS", spanText: "응답자의 73%가 페트병 라벨을 떼지 않고 버린 경험이 있다고 답했다" },
        { optionLabel: "④", relation: "NOT_MENTIONED", spanText: "우리 모두 오늘부터 실천에 동참하자" },
        { optionLabel: "⑤", relation: "NOT_MENTIONED", spanText: "습관으로 자리 잡지 못했음을 보여 준다" },
      ],
      keyPoints: ["문답 조직의 표지(물음-답)", "방식과 적용 대상의 결합 판정", "통계 인용의 실제 대상 확인"],
      tags: ["작문", "글쓰기 방식", "내용 조직"],
      difficulty: "INTERMEDIATE",
    },
  },
  KO_WR_COND: {
    passage: "지역 축제와 향토 음식에 대한 신문 기사 지문(소재 참고용).",
    difficulty: "INTERMEDIATE",
    question: {
      direction: "<보기>의 조건에 따라 [A]에 들어갈 내용으로 가장 적절한 것은?",
      slotForm: "LAST_SENTENCE",
      koStimulus: [
        {
          kind: "DRAFT",
          label: "[초고]",
          lines: [
            "[작문 상황] 미식 관광에 대해 설명하는 글을 작성하여 학교 신문에 실으려 함.",
            "최근 우리 지역을 찾는 관광객이 부쩍 늘고 있다. 관광객들은 지역의 이름난 음식을 맛보는 데서 나아가 그 음식에 담긴 문화까지 체험하고 싶어 한다.",
            "미식 관광은 지역의 식문화를 보존하는 효과가 있다. 사라져 가던 향토 음식이 관광 자원으로 재조명되면서 조리법과 식재료가 기록되고 전승되기 때문이다.",
            "또한 미식 관광은 지역 경제에 활력을 불어넣는다. 식당과 시장을 찾는 발걸음이 늘면 농가의 판로가 넓어지고 일자리도 생겨난다.",
            "이처럼 미식 관광의 가치는 분명하다. [A]",
          ],
        },
      ],
      bogi: {
        label: "보기",
        lines: [
          "초고의 2, 3문단에 제시된 미식 관광의 각 효과를 포괄할 것.",
          "비유적 표현을 활용할 것.",
        ],
      },
      options: [
        { label: "①", text: "여행이란 결국 인생이라는 긴 길 위에 차려진 한 끼의 밥상이다." },
        { label: "②", text: "미식 관광은 지역의 식문화 보존과 경제 활성화에 두루 기여한다." },
        { label: "③", text: "식문화를 지키고 경제를 살리는 미식 관광은 지역을 일으켜 세우는 두 개의 든든한 기둥이다." },
        { label: "④", text: "농가의 판로를 넓혀 주는 미식 관광은 지역 경제를 데우는 화로이다." },
        { label: "⑤", text: "식문화 보존과 경제 활성화라는 두 효과를 생각하면 미식 관광에 대한 관심은 더욱 커져야 한다." },
      ],
      correctAnswer: "③",
      explanation:
        "③ 은 2문단의 식문화 보존 효과와 3문단의 경제 활성화 효과를 모두 포괄하면서, 미식 관광을 '기둥'에 빗댄 비유적 표현을 활용하여 <보기>의 두 조건을 전부 충족한다.",
      wrongOptionExplanations: [
        { label: "①", explanation: "비유적 표현은 있으나 2, 3문단의 두 효과를 포괄하지 못해 첫 번째 조건을 충족하지 못한다." },
        { label: "②", explanation: "두 효과는 포괄했지만 비유적 표현을 활용하지 않아 두 번째 조건을 충족하지 못한다." },
        { label: "④", explanation: "비유적 표현은 있으나 경제 효과만 담아 2문단의 효과를 포괄하지 못해 첫 번째 조건을 충족하지 못한다." },
        { label: "⑤", explanation: "두 효과는 포괄했지만 비유적 표현을 활용하지 않아 두 번째 조건을 충족하지 못한다." },
      ],
      conditionAnalysis: [
        { label: "①", metConditions: [2], missedConditions: [1] },
        { label: "②", metConditions: [1], missedConditions: [2] },
        { label: "③", metConditions: [1, 2], missedConditions: [] },
        { label: "④", metConditions: [2], missedConditions: [1] },
        { label: "⑤", metConditions: [1], missedConditions: [2] },
      ],
      evidence: [
        { optionLabel: "①", spanText: "초고의 2, 3문단에 제시된 미식 관광의 각 효과를 포괄할 것.", relation: "CONTRADICTS", note: "두 효과 포괄 조건 누락" },
        { optionLabel: "②", spanText: "비유적 표현을 활용할 것.", relation: "CONTRADICTS", note: "비유 조건 누락" },
        { optionLabel: "③", spanText: "지역의 식문화를 보존하는 효과", relation: "SUPPORTS", note: "2문단 효과 반영" },
        { optionLabel: "③", spanText: "지역 경제에 활력을 불어넣는다", relation: "SUPPORTS", note: "3문단 효과 반영" },
        { optionLabel: "④", spanText: "초고의 2, 3문단에 제시된 미식 관광의 각 효과를 포괄할 것.", relation: "CONTRADICTS", note: "부분 포괄" },
        { optionLabel: "⑤", spanText: "비유적 표현을 활용할 것.", relation: "CONTRADICTS", note: "비유 조건 누락" },
      ],
      keyPoints: ["조건 전부 충족 판별", "비유 표현의 실재 확인", "복수 문단 내용 포괄"],
      tags: ["작문", "조건 충족", "고쳐쓰기·생성"],
      difficulty: "INTERMEDIATE",
    },
  },
  KO_WR_REVISE: {
    passage: "환경 문제에 대한 참고 지문이다. 초고와 무관한 소재 참고용 문장들.",
    difficulty: "INTERMEDIATE",
    question: {
      reviseMode: "LOCAL",
      trapPrinciple: "DIRECTION_FLIP",
      direction: "㉠~㉤을 고쳐 쓰기 위한 방안으로 적절하지 않은 것은?",
      koStimulus: [
        {
          kind: "DRAFT",
          title: "급식실 혼잡 개선을 위한 건의문 초고",
          lines: [
            "우리 학교 급식실 앞은 점심시간마다 학생들이 몰려 매우 혼잡하다. 그래서 급식 대기 시간은 줄어들지 않고 있다.",
            "학년별로 배식 시간을 나누면 혼잡을 줄일 수 있다. 미리 사전에 배식 순서를 공지하면 학생들이 몰리는 일도 막을 수 있다.",
            "우리 학교 축구부는 작년 대회에서 우승을 차지했다. 배식 질서 지킴이를 운영하는 것도 좋은 방법이다.",
            "결코 급식실의 혼잡은 우리 모두의 노력으로 해결될 것이다. 학교와 학생회가 함께 실천 방안을 마련하기를 바란다.",
          ],
        },
      ],
      markers: [
        { family: "KOR_CIRCLED", label: "㉠", spanText: "그래서", targetSurface: "stimulus" },
        { family: "KOR_CIRCLED", label: "㉡", spanText: "미리 사전에", targetSurface: "stimulus" },
        { family: "KOR_CIRCLED", label: "㉢", spanText: "우리 학교 축구부는 작년 대회에서 우승을 차지했다.", targetSurface: "stimulus" },
        { family: "KOR_CIRCLED", label: "㉣", spanText: "결코 급식실의 혼잡은 우리 모두의 노력으로 해결될 것이다.", targetSurface: "stimulus" },
        { family: "KOR_CIRCLED", label: "㉤", spanText: "바란다", targetSurface: "stimulus" },
      ],
      options: [
        { label: "①", text: '㉠: 앞 문장과 인과 관계가 성립하지 않으므로 "그러나"로 고친다.' },
        { label: "②", text: '㉡: 의미가 중복된 표현이므로 "미리"로 고친다.' },
        { label: "③", text: "㉢: 글의 중심 화제와 관련 없는 내용이므로 삭제한다." },
        { label: "④", text: '㉣: 부사어와 서술어가 호응하지 않으므로 "반드시"로 고친다.' },
        { label: "⑤", text: '㉤: 건의문의 격식에 맞지 않으므로 "바라. 꼭."으로 고친다.' },
      ],
      correctAnswer: "⑤",
      explanation: "㉤ '바란다'는 건의문의 종결로 자연스러워 고칠 필요가 없다. 오히려 제안된 처방이 격식을 무너뜨린다.",
      wrongOptionExplanations: [
        { label: "①", explanation: "앞뒤 문장이 상반되므로 대조 접속어로 고치는 것이 적절하다." },
        { label: "②", explanation: "'미리'와 '사전에'는 겹말이므로 하나만 남긴다." },
        { label: "③", explanation: "급식실 혼잡이라는 중심 화제에서 벗어난 문장이다." },
        { label: "④", explanation: "'결코'는 부정 서술어와 호응하므로 긍정 문맥에는 '반드시'가 맞다." },
      ],
      evidence: [
        { optionLabel: "①", spanText: "그래서 급식 대기 시간은 줄어들지 않고 있다", relation: "SUPPORTS" },
        { optionLabel: "②", spanText: "미리 사전에 배식 순서를 공지하면", relation: "SUPPORTS" },
        { optionLabel: "③", spanText: "우리 학교 축구부는 작년 대회에서 우승을 차지했다", relation: "SUPPORTS" },
        { optionLabel: "④", spanText: "결코 급식실의 혼잡은 우리 모두의 노력으로 해결될 것이다", relation: "SUPPORTS" },
        { optionLabel: "⑤", spanText: "학교와 학생회가 함께 실천 방안을 마련하기를 바란다", relation: "CONTRADICTS", note: "문면상 고칠 결함이 없다" },
      ],
      keyPoints: ["접속 표현의 논리 호응", "겹말 정리", "문단 통일성"],
      tags: ["작문", "고쳐쓰기"],
      difficulty: "INTERMEDIATE",
    },
  },
  KO_MD_LANG: {
    passage: "걷기는 심폐 기능을 개선하고 우울감을 낮추는 대표적인 유산소 운동이다.",
    difficulty: "INTERMEDIATE",
    question: {
      direction: "㉠~㉤에 드러난 표현 방식에 대한 설명으로 적절하지 않은 것은?",
      koStimulus: [
        {
          kind: "MEDIA_SCREEN",
          title: "○○시 누리집 게시판",
          lines: [
            "［화면 상단 메뉴: 소식 | 참여 마당 | 문의］",
            "제33회 시민 걷기 축제 참가 신청은 이번 주 금요일에 마감됩니다.",
            "보건 전문가들은 꾸준한 걷기가 가장 효과적인 건강 관리법이라고 강조합니다.",
            "여러분은 하루에 몇 걸음이나 걷고 있나요?",
            "따라서 이번 축제는 가족 단위 참가자를 위한 코스를 새로 마련했습니다.",
            "우리 모두 이번 걷기 축제에 동참합시다.",
          ],
        },
      ],
      markers: [
        { family: "KOR_CIRCLED", label: "㉠", spanText: "제33회 시민 걷기 축제 참가 신청은 이번 주 금요일에 마감됩니다.", targetSurface: "stimulus" },
        { family: "KOR_CIRCLED", label: "㉡", spanText: "보건 전문가들은 꾸준한 걷기가 가장 효과적인 건강 관리법이라고 강조합니다.", targetSurface: "stimulus" },
        { family: "KOR_CIRCLED", label: "㉢", spanText: "여러분은 하루에 몇 걸음이나 걷고 있나요?", targetSurface: "stimulus" },
        { family: "KOR_CIRCLED", label: "㉣", spanText: "따라서 이번 축제는 가족 단위 참가자를 위한 코스를 새로 마련했습니다.", targetSurface: "stimulus" },
        { family: "KOR_CIRCLED", label: "㉤", spanText: "우리 모두 이번 걷기 축제에 동참합시다.", targetSurface: "stimulus" },
      ],
      markerForms: [
        { label: "㉠", form: "PASSIVE" },
        { label: "㉡", form: "QUOTATION" },
        { label: "㉢", form: "INTERROGATIVE" },
        { label: "㉣", form: "CONNECTIVE" },
        { label: "㉤", form: "HORTATIVE" },
      ],
      options: [
        { label: "①", text: "㉠: 피동 표현을 사용하여 마감 사실을 행위 주체를 드러내지 않고 객관적으로 전달하고 있다." },
        { label: "②", text: "㉡: 전문가의 말을 인용하여 걷기의 효과에 대한 정보의 신뢰성을 높이고 있다." },
        { label: "③", text: "㉢: 의문형 종결 어미를 사용하여 수용자가 자신의 걸음 수를 떠올리도록 관심을 환기하고 있다." },
        { label: "④", text: "㉣: 접속 표현을 사용하여 앞선 내용과 상반되는 정보로 전환됨을 드러내고 있다." },
        { label: "⑤", text: "㉤: 청유형 종결 어미를 사용하여 수용자의 행사 참여를 유도하고 있다." },
      ],
      correctAnswer: "④",
      explanation:
        "㉣의 '따라서'는 앞 내용을 근거로 한 순접의 접속 표현이므로, 상반되는 정보로의 전환을 드러낸다는 ④의 설명은 적절하지 않다.",
      wrongOptionExplanations: [
        { label: "①", explanation: "'마감됩니다'는 피동 표현으로 행위 주체를 드러내지 않는다." },
        { label: "②", explanation: "전문가의 말을 인용하여 신뢰성을 높이고 있다." },
        { label: "③", explanation: "의문형 종결로 수용자의 관심을 환기하고 있다." },
        { label: "⑤", explanation: "'동참합시다'는 청유형 종결로 참여를 유도한다." },
      ],
      evidence: [
        { optionLabel: "①", spanText: "제33회 시민 걷기 축제 참가 신청은 이번 주 금요일에 마감됩니다.", relation: "SUPPORTS" },
        { optionLabel: "②", spanText: "보건 전문가들은 꾸준한 걷기가 가장 효과적인 건강 관리법이라고 강조합니다.", relation: "SUPPORTS" },
        { optionLabel: "③", spanText: "여러분은 하루에 몇 걸음이나 걷고 있나요?", relation: "SUPPORTS" },
        { optionLabel: "④", spanText: "따라서 이번 축제는 가족 단위 참가자를 위한 코스를 새로 마련했습니다.", relation: "DISTORTS" },
        { optionLabel: "⑤", spanText: "우리 모두 이번 걷기 축제에 동참합시다.", relation: "SUPPORTS" },
      ],
      points: 3,
      keyPoints: ["매체 언어의 표현 방식", "형식 표지와 기능의 결합 판정", "접속 표현의 의미 관계"],
      tags: ["매체", "언어 사용"],
      difficulty: "INTERMEDIATE",
    },
  },
  KO_GR_HIST: {
    passage: "이 지문은 사용되지 않는 소재 참고용 지문이다.",
    difficulty: "INTERMEDIATE",
    question: {
      direction: "<보기>를 바탕으로 윗자료를 탐구한 내용으로 적절하지 않은 것은?",
      koStimulus: [
        {
          kind: "ARCHAIC_TEXT",
          title: "훈민정음 언해(1459)",
          lines: [
            "나랏 말싸미 듕귁에 달아",
            "[현대어 풀이] 나라의 말이 중국과 달라",
            "문자와로 서르 사맛디 아니할쌔",
            "[현대어 풀이] 문자와 서로 통하지 아니하므로",
          ],
        },
      ],
      bogi: {
        label: "보기",
        lines: [
          "중세 국어에서는 주격 조사가 자음 뒤에서 '이', 모음 'ㅣ' 이외의 모음 뒤에서 'ㅣ'로 실현되었다.",
          "중세 국어에서는 앞말의 받침을 뒤 음절의 첫소리로 옮겨 적는 이어적기가 일반적이었다.",
          "중세 국어에서는 두음 법칙이 적용되지 않아 'ㄴ'이 단어 첫머리에 올 수 있었다.",
        ],
      },
      options: [
        { label: "①", text: "'말싸미'는 '말쌈'에 주격 조사 '이'가 결합하며 이어적기로 표기된 것이겠군." },
        { label: "②", text: "'나랏'은 현대 국어와 달리 이어적기가 나타나지 않은 표기이겠군." },
        { label: "③", text: "'듕귁에'는 모음으로 끝나는 체언 뒤라는 점에서 주격 조사가 결합한 형태이겠군." },
        { label: "④", text: "'달아'는 이어적기의 원리에 따라 소리 나는 대로 적은 표기이겠군." },
        { label: "⑤", text: "'아니할쌔'에는 두음 법칙이 적용되지 않은 중세 국어의 특징이 드러나는군." },
      ],
      correctAnswer: "③",
      distortionPrinciple: "FORM_MISANALYSIS",
      explanation:
        "'듕귁에'의 '에'는 부사격 조사이므로 주격 조사가 결합한 형태로 본 ③은 형태 오분석이다. '말싸미'는 '말쌈+이'의 연철 표기이다.",
      wrongOptionExplanations: [
        { label: "①", explanation: "'말쌈+이'의 결합과 연철이 <보기>의 두 개념에 정확히 부합한다." },
        { label: "②", explanation: "'나랏'은 관형격 'ㅅ' 표기로 이어적기 환경이 아니다." },
        { label: "④", explanation: "'달아'는 소리 나는 대로 적은 연철 표기이다." },
        { label: "⑤", explanation: "'아니할쌔'는 두음 법칙과 무관하게 참 진술의 근거가 된다." },
      ],
      evidence: [
        { optionLabel: "①", spanText: "나랏 말싸미 듕귁에 달아", relation: "SUPPORTS" },
        { optionLabel: "②", spanText: "나랏 말싸미", relation: "SUPPORTS" },
        { optionLabel: "③", spanText: "듕귁에 달아", relation: "DISTORTS" },
        { optionLabel: "④", spanText: "듕귁에 달아", relation: "SUPPORTS" },
        { optionLabel: "⑤", spanText: "아니할쌔", relation: "SUPPORTS" },
      ],
      keyPoints: ["주격 조사 이/ㅣ", "이어적기", "두음 법칙 미적용"],
      tags: ["국어사", "중세국어"],
      difficulty: "INTERMEDIATE",
    },
  },
};

const harnessSource = `
// tsx runs these .ts modules as CommonJS, so destructure named exports off default.
import registry from "@/lib/korean/registry";
import codes from "@/lib/korean/quality/codes";
import dispatch from "@/lib/korean/quality/dispatch";
import renderModel from "@/lib/korean/core/render-model";
import questionTypeUi from "@/lib/question-type-ui";
import genConstants from "@/app/api/ai/generate-questions-auto/_lib/constants";
import runGenConstants from "@/app/api/ai/generate-questions-auto/_lib/run-question-generation-constants";
import questionQuality from "@/lib/question-quality";
import optionsValidator from "@/lib/question-quality/validators/options";
import postprocessTypes from "@/lib/question-postprocess/types";
import languageSettings from "@/lib/question-type-generation-settings/language";
import passagePolicy from "@/components/exams/paper-builder/passage-policy";
import editGuards from "@/lib/question-ai-edit/edit-guards";
import { readFileSync } from "node:fs";

const { KO_TYPE_REGISTRY, KO_TYPE_IDS, koTypeIdsByGroup, koMcTypeIds } = registry;
const { KO_BLOCKING_CODES, KO_WARNING_CODES, KO_EDIT_BLOCKING_CODES } = codes;
const { validateKoQuestion } = dispatch;
const { serializeKoQuestion } = renderModel;
const { QUESTION_TYPE_UI, QUESTION_TYPE_GROUPS_KO } = questionTypeUi;
const { TYPE_LABELS } = genConstants;
const { RELAXED_BLOCKING_QUALITY_CODES } = runGenConstants;
const { SHIP_FIRST_WARNING_CODES } = questionQuality;
const { MC_TYPE_IDS } = optionsValidator;
const { PASSTHROUGH_TYPES } = postprocessTypes;
const { defaultLanguageSettingsForType } = languageSettings;
const { shouldRenderSourcePassageInsideQuestion } = passagePolicy;
const { BLOCKING_EDIT_CODES } = editGuards;

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) passed += 1;
  else failures.push(detail ? name + " — " + detail : name);
}

const NEW_TYPE_IDS = ${JSON.stringify(NEW_TYPE_IDS)};
const NEW_GROUP = ${JSON.stringify(NEW_GROUP)};
const FIXTURES: Record<string, { passage: string; difficulty: string; question: Record<string, unknown> }> =
  JSON.parse(readFileSync(process.env.KO_FIXTURES_PATH as string, "utf8"));

// ═══ 1. 레지스트리 38종 편입 + 그룹 분포 ═══
check("레지스트리 38종", KO_TYPE_IDS.length === 38, String(KO_TYPE_IDS.length));
for (const id of NEW_TYPE_IDS) check("등록: " + id, !!KO_TYPE_REGISTRY[id]);
{
  const groups = koTypeIdsByGroup();
  check("그룹: 독서 8", (groups["국어 독서"] ?? []).length === 8);
  check("그룹: 문학 9", (groups["국어 문학"] ?? []).length === 9);
  check("그룹: 문법 8", (groups["국어 문법"] ?? []).length === 8);
  check("그룹: 화작매 10", (groups[NEW_GROUP] ?? []).length === 10);
  check("그룹: 서답형 3", (groups["국어 서답형"] ?? []).length === 3);
  const known = new Set(["국어 독서", "국어 문학", "국어 문법", NEW_GROUP, "국어 서답형"]);
  const stray = Object.keys(groups).filter((g) => !known.has(g));
  check("미등록 uiGroup 없음(조용한 UI 소실 방지)", stray.length === 0, stray.join(","));
}

// ═══ 2. 파생 전파 (레지스트리 파생 루프 확인) ═══
for (const id of NEW_TYPE_IDS) {
  check("TYPE_LABELS: " + id, typeof TYPE_LABELS[id] === "string" && TYPE_LABELS[id].length > 0);
  check("QUESTION_TYPE_UI: " + id, QUESTION_TYPE_UI[id]?.id === id);
  check("MC_TYPE_IDS: " + id, MC_TYPE_IDS.has(id));
  check("PASSTHROUGH_TYPES: " + id, PASSTHROUGH_TYPES.has(id));
  const lang = defaultLanguageSettingsForType(id);
  check("language ko/ko: " + id, lang.stemLanguage === "ko" && lang.optionLanguage === "ko");
  const mod = KO_TYPE_REGISTRY[id];
  check(
    "passage-policy flow: " + id,
    shouldRenderSourcePassageInsideQuestion(id) === mod.meta.includesPassage,
    "includesPassage=" + String(mod.meta.includesPassage),
  );
}
check("koMcTypeIds 35종(신규 12 전부 MC5)", koMcTypeIds().length === 35, String(koMcTypeIds().length));
{
  const g = QUESTION_TYPE_GROUPS_KO.find((x: { group: string }) => x.group === NEW_GROUP);
  check("QUESTION_TYPE_GROUPS_KO 에 화작매 그룹", !!g && g.items.length === 10, String(g?.items?.length));
}

// ═══ 3. 품질코드 3집합 불변식 ═══
{
  const blocking = new Set<string>(KO_BLOCKING_CODES);
  const warning = new Set<string>(KO_WARNING_CODES);
  check("BLOCKING ∩ WARNING = ∅", [...blocking].every((c) => !warning.has(c)));
  check(
    "KO_BLOCKING ⊆ RELAXED_BLOCKING(relaxed 강등 방지)",
    [...blocking].every((c) => RELAXED_BLOCKING_QUALITY_CODES.has(c)),
    [...blocking].filter((c) => !RELAXED_BLOCKING_QUALITY_CODES.has(c)).join(","),
  );
  check(
    "KO 코드 ∩ SHIP_FIRST = ∅",
    [...blocking, ...warning].every((c) => !SHIP_FIRST_WARNING_CODES.has(c)),
  );
  check(
    "KO_EDIT_BLOCKING ⊆ BLOCKING_EDIT_CODES",
    KO_EDIT_BLOCKING_CODES.every((c: string) => BLOCKING_EDIT_CODES.has(c)),
  );
  check(
    "SHIP_FIRST ∩ BLOCKING_EDIT = ∅ (edit-guards 불변식)",
    [...BLOCKING_EDIT_CODES].every((c: string) => !SHIP_FIRST_WARNING_CODES.has(c)),
  );
  check("신규: ko-stimulus-missing 은 relaxed 에서도 차단", RELAXED_BLOCKING_QUALITY_CODES.has("ko-stimulus-missing"));
  check("신규: ko-render-fallback 은 relaxed 에서도 차단", RELAXED_BLOCKING_QUALITY_CODES.has("ko-render-fallback"));
  check("신규: ko-stimulus-kind 는 warning 전용", warning.has("ko-stimulus-kind") && !blocking.has("ko-stimulus-kind"));
}

// ═══ 4. 12유형 각각 스모크: 통과(정상 봉투 error 0) / 차단(결손 봉투 발화) ═══
const errorsOf = (typeId: string, question: Record<string, unknown>, passage: string, difficulty: string) =>
  validateKoQuestion({ typeId, question, passage, requestedDifficulty: difficulty })
    .filter((i) => i.severity === "error");

for (const id of NEW_TYPE_IDS) {
  const fx = FIXTURES[id];
  if (!fx) {
    failures.push("픽스처 누락: " + id);
    continue;
  }
  const mod = KO_TYPE_REGISTRY[id];

  // (a) 스키마 통과 + 규격 밖 봉투 거부
  const parsed = mod.schema.safeParse(fx.question);
  check(
    id + ": schema.parse(정상)",
    parsed.success,
    parsed.success ? "" : JSON.stringify((parsed as { error: { issues: unknown[] } }).error.issues.slice(0, 2)),
  );
  check(id + ": schema 빈 봉투 거부", !mod.schema.safeParse({}).success);

  // (b) 통과 케이스 — 공통 게이트 + 유형 validate 합산 error 0
  const passErrors = errorsOf(id, fx.question, fx.passage, fx.difficulty);
  check(
    id + ": 정상 봉투 error 0",
    passErrors.length === 0,
    JSON.stringify(passErrors.map((i) => i.code + ":" + i.message.slice(0, 40))),
  );

  // (c) 차단 케이스 1 — 선지 3개로 절단 → ko-option-count 발화 (validate 크래시는 dispatch 가 흡수)
  const truncated = { ...fx.question, options: (fx.question.options as unknown[]).slice(0, 3) };
  check(
    id + ": 선지 결손 차단(ko-option-count)",
    errorsOf(id, truncated, fx.passage, fx.difficulty).some((i) => i.code === "ko-option-count"),
  );

  // (d) 차단 케이스 2 — 자체자료 결손 → ko-stimulus-missing 발화
  //     (usesStimulus=required 는 공통 게이트, KO_RD_THEORY 메모형은 유형 validate)
  const noStim = { ...fx.question, koStimulus: undefined };
  check(
    id + ": 자료 결손 차단(ko-stimulus-missing)",
    errorsOf(id, noStim, fx.passage, fx.difficulty).some((i) => i.code === "ko-stimulus-missing"),
  );

  // (e) 렌더모델 — 크래시 없이 조립 + 지문 동봉이 meta 와 정합 + 직렬화 무크래시
  try {
    const model = mod.toRenderModel(fx.question, { passage: fx.passage });
    check(id + ": render 선지 5", (model.options?.length ?? 0) === 5);
    check(
      id + ": render 지문 동봉 = meta.includesPassage",
      (model.passage !== undefined) === (mod.meta.includesPassage && fx.passage.length > 0),
    );
    const text = serializeKoQuestion(model);
    check(id + ": serialize 비어있지 않음", typeof text === "string" && text.length > 0);
  } catch (error) {
    failures.push(id + ": toRenderModel/serialize 크래시 — " + String(error));
  }
}

process.stdout.write(JSON.stringify({ passed, failed: failures.length, failures }));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".ko-new-types-harness.mts");
  const fixturesPath = path.join(tmpDir, ".ko-new-types-fixtures.json");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    writeFileSync(fixturesPath, JSON.stringify(FIXTURES), "utf8");
    const raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "", KO_FIXTURES_PATH: fixturesPath },
    });
    return JSON.parse(raw);
  } finally {
    for (const p of [harnessPath, fixturesPath]) {
      try {
        rmSync(p);
      } catch {
        // ignore
      }
    }
  }
}

test("ko new 12 types: registry/propagation/codes invariants + per-type pass/block smoke", () => {
  const summary = runHarness();
  assert.equal(
    summary.failed,
    0,
    `ko-new-types failures: ${JSON.stringify(summary.failures, null, 1)}`,
  );
  assert.ok(summary.passed >= 140, `expected ≥140 checks, got ${summary.passed}`);
});
