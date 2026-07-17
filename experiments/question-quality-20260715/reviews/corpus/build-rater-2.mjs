import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import nextEnv from "@next/env";

const ROOT = process.cwd();
const PRIVATE_PATH = path.join(
  ROOT,
  "experiments/question-quality-20260715/corpus/private/manifest-private.json",
);
const PUBLIC_PATH = path.join(
  ROOT,
  "experiments/question-quality-20260715/corpus/manifest-public.json",
);
const REPO_SOURCE_PATH = path.join(ROOT, "src/data/exam-passages/passages.json");
const OUTPUT_PATH = path.join(
  ROOT,
  "experiments/question-quality-20260715/reviews/corpus/rater-2.json",
);

function decision(status, grammarRichness, blankSuitability, reason, issueCodes = []) {
  return { status, grammarRichness, blankSuitability, reason, issueCodes };
}

const D = decision;

// 독립 수동 판정. private manifest의 배열 순서(1-based sequence)에 대응한다.
const devDecisions = [
  D("EXCLUDE", "normal", "central", "완전한 문장이 아닌 대시 파편이 있고 구식 집단명 인용도 문맥 검토가 필요하다.", ["SOURCE_FRAGMENT", "SENSITIVE_OR_OUTDATED_TERM"]),
  D("PASS", "rich", "central", "관광 산업의 분절에서 통합으로의 변화가 선명하고 복합구문도 충분하다."),
  D("PASS", "rich", "central", "외적 보상이 내적 동기를 소거한다는 논지가 사례와 정확히 맞물린다."),
  D("PASS", "normal", "central", "항상성에서 습관의 균형으로 확장되는 중심 논지가 명료하다."),
  D("PASS", "rich", "central", "원시·현대 사회의 교육과 세대 소외를 비교하는 논리와 구문이 충분하다."),
  D("PASS", "rich", "local", "전기적 사실의 시간 순서가 명확하나 빈칸은 주로 특정 업적 문장에 적합하다."),
  D("PASS", "rich", "central", "이론 교체가 기존 성공까지 설명해야 한다는 핵심 조건이 일관된다."),
  D("PASS", "rich", "central", "과학의 문화 의존성에 대한 두 관점을 대비해 중심 빈칸 설계가 가능하다."),
  D("PASS", "normal", "central", "소셜미디어의 허위정보 위험과 사실검증 책임이라는 주장이 명확하다."),
  D("PASS", "rich", "central", "갈등-연민-양보의 서사가 완결되고 중심 행동을 근거로 추론할 수 있다."),
  D("PASS", "rich", "local", "생애와 업적이 안정적으로 연결되지만 전기문이라 빈칸은 국소 사실에 더 적합하다."),
  D("PASS", "rich", "central", "구체적 합의 확인이 약속 이행을 높인다는 실무 논리가 분명하다."),
  D("PASS", "rich", "central", "사회적 시계의 정의·효과·문화적 변화가 하나의 논지로 수렴한다."),
  D("PASS", "rich", "central", "시의 비의역성과 철학적 진리평가의 긴장이 정교하게 전개된다."),
  D("PASS", "normal", "central", "안경원숭이의 특징에서 서식지 파괴 위험으로 이어지는 구조가 명료하다."),
  D("PASS", "rich", "central", "수면 부족과 생산성 저하의 악순환이 비유와 인과로 충분히 뒷받침된다."),
  D("PASS", "rich", "central", "화석 기록의 존재·부재를 비대칭적으로 해석해야 한다는 논지가 치밀하다."),
  D("PASS", "rich", "central", "패배 경험을 허용해 완벽주의를 완화한 변화가 사례로 명확히 드러난다."),
  D("PASS", "rich", "central", "신체 신호가 다차원 선택을 요약한다는 중심 개념과 예시가 잘 결합된다."),
  D("PASS", "rich", "central", "초기 공론 참여가 대립을 참여로 바꾼다는 주장과 근거가 일관된다."),
  D("PASS", "rich", "central", "관광 수용력의 물리적 한계를 사회·정치적 상대성으로 확장하는 논리가 선명하다."),
  D("PASS", "rich", "central", "르누아르의 답과 행동이 고통보다 지속되는 아름다움이라는 메시지를 완결한다."),
  D("PASS", "rich", "central", "사료의 공백을 역사소설의 발명으로 보완한다는 논지가 일관된다."),
  D("PASS", "rich", "central", "소비 선택을 기업 관행 변화와 연결하는 중심 주장이 사례로 지지된다."),
  D("PASS", "rich", "local", "전기적 서사는 깨끗하지만 핵심 빈칸보다 생애의 특정 전환점 문항에 더 적합하다."),
  D("PASS", "rich", "central", "조리 외주화의 이익을 여러 차원에서 열거하는 구조가 안정적이다."),
  D("PASS", "rich", "central", "음악 비평이 여론을 이끌던 구조에서 반영하는 구조로 바뀐 인과가 명료하다."),
  D("DOMAIN_REVIEW", "rich", "central", "논리 구조는 좋지만 아마존 원주민 정치성과 여성 지배에 관한 광범위한 문화 일반화는 전문가 검토가 필요하다.", ["CULTURAL_DOMAIN_REVIEW"]),
  D("PASS", "normal", "central", "블랙 프라이데이의 환경비용과 대안 행동이라는 주장이 분명하다."),
  D("PASS", "rich", "central", "운동기술 발달이 탐색·인지·숙달감으로 확장되는 인과가 촘촘하다."),
  D("EXCLUDE", "normal", "unsuitable", "정상 지문 뒤에 선지로 보이는 동사구 조각들이 연속으로 붙어 있다.", ["ANSWER_OPTIONS_APPENDED", "NEAR_DUPLICATE"]),
  D("PASS", "rich", "central", "숫자 미신의 문화별 차이를 하나의 주제로 조직하며 문장 표면도 온전하다."),
  D("DOMAIN_REVIEW", "rich", "central", "식량안보 설명은 일관되지만 한국의 작물별 정책 처방과 대외 의존도 판단은 최신 농정 검토가 필요하다.", ["POLICY_DOMAIN_REVIEW"]),
  D("EXCLUDE", "rich", "central", "철자 결합 오류와 문장부호 누락이 있고 같은 숫자 미신 지문의 준중복이다.", ["OCR_CORRUPTION", "NEAR_DUPLICATE"]),
  D("EXCLUDE", "rich", "unsuitable", "조류의 방랑과 성공 압박이라는 무관한 두 지문이 한 레코드로 결합됐다.", ["MERGED_UNRELATED_PASSAGES"]),
  D("EXCLUDE", "rich", "unsuitable", "@·대문자 표식 등 문제용 주석이 본문에 남아 있어 원문 표면이 오염됐다.", ["QUESTION_MARKUP_REMAINS", "NEAR_DUPLICATE"]),
  D("EXCLUDE", "rich", "central", "같은 숫자 미신 지문의 준중복이며 관사 누락(have basis)까지 있다.", ["NEAR_DUPLICATE", "GRAMMAR_ERROR_IN_SOURCE"]),
  D("PASS", "normal", "central", "보편적 설계의 세 사례가 접근성이라는 중심 개념을 안정적으로 뒷받침한다."),
  D("EXCLUDE", "rich", "unsuitable", "몸짓 지문 뒤에 무관한 표본편향 문장과 정답 요약처럼 보이는 문장이 덧붙었다.", ["UNRELATED_SENTENCE_APPENDED", "ANSWER_LIKE_SUMMARY_APPENDED"]),
  D("EXCLUDE", "rich", "central", "관사 누락(has evolutionary root)이 있고 동일 향신료 지문의 준중복 군집에 속한다.", ["GRAMMAR_ERROR_IN_SOURCE", "NEAR_DUPLICATE"]),
  D("EXCLUDE", "normal", "unsuitable", "도난 보장을 전혀 하지 않는데 보험사가 돈을 보낼 때까지 기다린다는 문장이 의미·구문상 모순된다.", ["LOGIC_CORRUPTION", "MALFORMED_SENTENCE"]),
  D("PASS", "rich", "central", "몸짓이 발화와 사고를 선행·지원한다는 근거들이 한 결론으로 수렴한다."),
  D("PASS", "normal", "central", "에리크의 명명 전략과 식민지 쇠퇴가 시간 순서로 자연스럽게 연결된다."),
  D("EXCLUDE", "rich", "unsuitable", "공유 미각의 문맥에 통합되지 않은 반대 문장이 끼어들어 결론과의 연결이 깨진다.", ["INSERTED_DISTRACTOR_SENTENCE", "NEAR_DUPLICATE"]),
  D("PASS", "rich", "central", "변화 환경에서 인간 판단과 통계모형의 결합이 더 정확하다는 실험 논리가 완결된다."),
  D("EXCLUDE", "rich", "central", "관사 누락이 남은 향신료 지문이며 dev·holdout 준중복 군집에 속한다.", ["GRAMMAR_ERROR_IN_SOURCE", "NEAR_DUPLICATE"]),
  D("PASS", "rich", "central", "시트콤의 풍자가 사회적 관용을 촉진했다는 인과가 일관된다."),
  D("PASS", "rich", "central", "무작위 변이와 비무작위 선택으로 신체 구조가 형성된다는 논리가 충분히 전개된다."),
  D("PASS", "rich", "central", "무의식적 위험 탐지 뒤 합리화가 일어난다는 심리 기제가 선명하다."),
  D("PASS", "rich", "central", "교통 분야의 보편적 설계 사례들이 다양한 이용자의 접근성으로 수렴한다."),
  D("PASS", "rich", "central", "완벽한 결과보다 부분적 정책 진전을 택해야 한다는 주장이 구체적 사례로 지지된다."),
  D("EXCLUDE", "rich", "unsuitable", "문장 앞 번호가 원문에 박혀 있고 동일 기억 지문이 여러 레코드·split에 중복된다.", ["SENTENCE_NUMBERING_REMAINS", "NEAR_DUPLICATE"]),
  D("PASS", "rich", "central", "가상세계의 지속적 사회가치가 충분한 참여자 규모에 달렸다는 논지가 명료하다."),
  D("PASS", "rich", "central", "회상과 재인의 차이를 단서 유무로 설명하는 깨끗한 대표본이다."),
  D("PASS", "rich", "central", "가설 검증과 베이지안 갱신을 지식 형성의 반복 과정으로 연결한다."),
  D("EXCLUDE", "rich", "central", "신체 발달 지문이 다른 dev 레코드와 거의 동일해 독립 표본이 아니다.", ["NEAR_DUPLICATE"]),
  D("PASS", "rich", "central", "연령에 따라 달라져야 하는 부모의 정서사회화 지원을 세밀하게 대비한다."),
  D("EXCLUDE", "rich", "central", "과학·베이지안 갱신 지문이 다른 dev 레코드와 토큰 수준에서 사실상 동일하다.", ["NEAR_DUPLICATE"]),
  D("DOMAIN_REVIEW", "rich", "central", "만성 스트레스·해마·코르티솔의 인과 설명이 강해 의학·신경과학적 정확성 검토가 필요하다.", ["MEDICAL_DOMAIN_REVIEW"]),
  D("PASS", "rich", "central", "데이터 무덤을 지식으로 바꾸는 도구 필요성이 문제-기존 한계-대안 순서로 전개된다."),
];

const holdoutDecisions = [
  D("PASS", "normal", "local", "선수의 생애와 선행이 명료하지만 빈칸은 업적·사실 단위가 더 적합하다."),
  D("PASS", "rich", "central", "어려운 신발을 완성한 헌신이 결말의 기쁨과 자연스럽게 연결된다."),
  D("PASS", "rich", "central", "유아기의 음악 경험이 문화 이해와 편견 예방으로 확장되는 논지가 일관된다."),
  D("PASS", "rich", "central", "마라톤 서사와 포기 유혹을 이기는 보편적 메시지가 유기적으로 결합된다."),
  D("PASS", "rich", "local", "해양생물학자의 생애가 정확한 시간 순서로 구성되어 국소 빈칸에 적합하다."),
  D("PASS", "rich", "central", "동질적 온라인 네트워크의 정보 필터링 이득과 과잉필터 위험을 정교하게 대비한다."),
  D("PASS", "rich", "central", "신체활동의 원리를 이해시켜 학습자 주도성을 높여야 한다는 논지가 명료하다."),
  D("PASS", "rich", "central", "장소 정체성의 가독성과 방문가능성을 연결하는 개념적 전개가 촘촘하다."),
  D("PASS", "rich", "central", "주의 깊은 관찰이 기억을 강화한다는 주장과 일상 사례가 잘 결합된다."),
  D("PASS", "rich", "central", "압박 자체보다 태도가 삶의 반응을 결정한다는 중심 메시지가 반복적으로 지지된다."),
  D("PASS", "normal", "local", "국가 지리·인구·언어의 사실 나열이 깨끗하지만 중심 추론형 빈칸은 제한적이다."),
  D("PASS", "rich", "local", "과일 껍질에 대한 상반된 두 화자가 명확해 국소 근거 빈칸에는 적합하나 단일 중심명제는 없다."),
  D("PASS", "rich", "central", "과학 교과서가 실패 경로를 지워 단선적 서사를 만든다는 비판이 선명하다."),
  D("PASS", "rich", "central", "말에서는 유용한 상투어가 글에서는 진부해진다는 대비가 명료하다."),
  D("PASS", "rich", "central", "보이지 않는 관리의 가치를 해고 전후의 결과로 설득력 있게 보여준다."),
  D("PASS", "rich", "central", "폐기물 매립지를 밀밭 예술로 바꾼 과정과 공공적 효과가 자연스럽게 이어진다."),
  D("PASS", "rich", "central", "통행료 위기와 꽃 거래의 재치 있는 해결이 완결된 서사를 이룬다."),
  D("DOMAIN_REVIEW", "rich", "central", "소통의 평등에서 공동재산 윤리까지 도출하는 선사사회 일반화는 인류학적 검토가 필요하다.", ["CULTURAL_DOMAIN_REVIEW"]),
  D("PASS", "rich", "local", "백신 개발자의 생애와 업적이 안정적이나 빈칸은 특정 연대·행동에 더 적합하다."),
  D("PASS", "normal", "central", "행복은 구매가 아니라 연습으로 길러야 한다는 비유 구조가 명료하다."),
  D("PASS", "rich", "central", "장난의 실제 피해를 이해시키고 책임을 묻는 교장의 대응이 일관된다."),
  D("PASS", "rich", "local", "화가의 교육·망명·작품 활동을 잇는 전기문으로 국소 빈칸에 적합하다."),
  D("PASS", "rich", "central", "촉각에 시간적 움직임이 필요하다는 실험과 시각 유비가 정확히 연결된다."),
  D("PASS", "rich", "central", "유아기 음악 활동의 정서·사회·인지적 효과가 중심 권고를 지지한다."),
  D("PASS", "rich", "central", "즉시 보상 편향이 장기 저축 예시의 설득력을 약화한다는 논지가 선명하다."),
  D("DOMAIN_REVIEW", "rich", "central", "기후정의 논리는 일관되지만 보조금 규모·산림배출 비중·정책 비용효율은 최신 전문 검토가 필요하다.", ["CLIMATE_POLICY_DOMAIN_REVIEW"]),
  D("PASS", "rich", "central", "기업 봉사가 조직몰입을 약화하지 않고 강화한다는 반전 논지가 명료하다."),
  D("PASS", "normal", "central", "맞벌이와 가사분담 변화가 구체적 생활 사례로 자연스럽게 전개된다."),
  D("PASS", "rich", "central", "오답을 허용해야 수학적 오개념이 드러난다는 교육 논리가 치밀하다."),
  D("PASS", "normal", "central", "자동화가 여가를 늘리지 않고 소비자에게 노동을 전가했다는 대비가 분명하다."),
  D("EXCLUDE", "rich", "central", "dev의 숫자 미신 지문과 거의 동일해 holdout 독립성이 깨진다.", ["CROSS_SPLIT_NEAR_DUPLICATE"]),
  D("EXCLUDE", "rich", "unsuitable", "정상 문단 뒤에 정답 요약과 복수의 오답 문장이 선지처럼 붙어 있다.", ["ANSWER_OPTIONS_APPENDED", "NEAR_DUPLICATE"]),
  D("EXCLUDE", "rich", "unsuitable", "문항 지시문·기호·단어표·정의 선지가 본문에 통째로 포함됐다.", ["FULL_QUESTION_SCAFFOLD", "OCR_CORRUPTION", "NEAR_DUPLICATE"]),
  D("EXCLUDE", "rich", "unsuitable", "동일 문항 스캐폴드의 중복본이며 추가 OCR 표식까지 남아 있다.", ["FULL_QUESTION_SCAFFOLD", "OCR_CORRUPTION", "NEAR_DUPLICATE"]),
  D("EXCLUDE", "scarce", "unsuitable", "첫 문장이 중간에서 잘렸고 빈칸 표식·정답어 조각이 남아 있다.", ["TRUNCATED_SOURCE", "BLANK_MARKUP_REMAINS", "ANSWER_OPTIONS_APPENDED"]),
  D("EXCLUDE", "rich", "unsuitable", "문항 번호·삽입 위치·밑줄 기호·의도적으로 틀린 문법과 질문 문장이 모두 남아 있다.", ["FULL_QUESTION_SCAFFOLD", "DELIBERATE_ERROR_REMAINS", "NEAR_DUPLICATE"]),
  D("PASS", "rich", "central", "측정 가능한 대리변수가 실제 목표를 대체하는 굿하트 법칙을 간결하게 설명한다."),
  D("EXCLUDE", "rich", "unsuitable", "같은 공유경제 문항 스캐폴드의 중복본으로 문제 표식과 인위적 오류가 남아 있다.", ["FULL_QUESTION_SCAFFOLD", "DELIBERATE_ERROR_REMAINS", "NEAR_DUPLICATE"]),
  D("EXCLUDE", "rich", "central", "향신료 지문이 dev의 두 레코드와 사실상 동일해 cross-split 누출을 만든다.", ["CROSS_SPLIT_NEAR_DUPLICATE"]),
  D("PASS", "rich", "central", "모든 것을 동시에 성취할 수 없다는 졸업연설의 중심 교훈과 사례가 일관된다."),
  D("EXCLUDE", "rich", "unsuitable", "대시가 사라져 두 곳의 문장 경계가 깨졌고, dev의 병합 오염 레코드에도 같은 본문이 포함돼 있다.", ["PUNCTUATION_CORRUPTION", "CROSS_SPLIT_TEXT_LEAK"]),
  D("PASS", "rich", "central", "미각의 개인성과 공동 경험을 조화시키는 논지가 매끄럽고 표면도 온전하다."),
  D("EXCLUDE", "rich", "central", "dev 데이터 마이닝 지문의 강한 의역 준중복으로 holdout 독립 표본이 아니다.", ["CROSS_SPLIT_NEAR_DUPLICATE"]),
  D("EXCLUDE", "rich", "central", "dev의 회상·재인 지문과 토큰 수준에서 동일하다.", ["CROSS_SPLIT_NEAR_DUPLICATE"]),
  D("EXCLUDE", "rich", "central", "dev의 신체발달 지문과 거의 동일해 독립 표본으로 사용할 수 없다.", ["CROSS_SPLIT_NEAR_DUPLICATE"]),
  D("PASS", "normal", "central", "벨의 관찰에서 최초 전기 음향 전송까지 인과와 시간 순서가 명확하다."),
  D("EXCLUDE", "rich", "central", "dev 지문과 단어열이 동일하고 clean water. act라는 문장부호 오염도 있다.", ["CROSS_SPLIT_NEAR_DUPLICATE", "PUNCTUATION_CORRUPTION"]),
  D("DOMAIN_REVIEW", "rich", "central", "표면과 논리 구조는 깨끗하지만 과일 섭취와 해마·피질 부피를 잇는 건강 주장은 전문 검증이 필요하다.", ["MEDICAL_DOMAIN_REVIEW"]),
  D("EXCLUDE", "rich", "central", "다른 holdout 데이터 지문과 단어열이 동일하고 인용부호 뒤 문장부호도 유실됐다.", ["NEAR_DUPLICATE", "PUNCTUATION_CORRUPTION"]),
  D("EXCLUDE", "rich", "central", "dev의 스트레스·해마 지문과 거의 동일해 holdout 오염을 만든다.", ["CROSS_SPLIT_NEAR_DUPLICATE"]),
  D("PASS", "rich", "central", "공유경제의 이상과 영리 플랫폼 현실을 대조하며 결론까지 일관된다."),
  D("EXCLUDE", "rich", "unsuitable", "회상·재인 지문을 늘린 뒤 선지 동사구 조각들을 그대로 덧붙였다.", ["ANSWER_OPTIONS_APPENDED", "NEAR_DUPLICATE"]),
  D("PASS", "rich", "central", "왼손잡이의 불편에서 보편적 설계의 기원과 정의로 자연스럽게 확장된다."),
  D("EXCLUDE", "rich", "unsuitable", "논지와 모순되는 문장들이 정답·오답 선지처럼 본문 끝에 연속 부착됐다.", ["ANSWER_OPTIONS_APPENDED", "NEAR_DUPLICATE"]),
  D("PASS", "rich", "central", "패션 분야의 보편적 설계 사례와 사회적 확대 필요성이 일관되게 연결된다."),
  D("PASS", "rich", "central", "닷컴 기업의 광고 교환이 매출만 부풀린 회계 문제를 구체적으로 설명한다."),
  D("PASS", "rich", "central", "손글씨의 감각운동 과정과 깊은 학습을 연결하는 중심 논지가 충분히 전개된다."),
  D("EXCLUDE", "rich", "central", "dev 몸짓 지문과 거의 동일하고 문장 순서만 일부 바뀌어 cross-split 독립성이 없다.", ["CROSS_SPLIT_NEAR_DUPLICATE"]),
  D("PASS", "rich", "central", "비판적 사고를 즉각적 정서 반응에서 벗어나는 정신적 해방으로 설명한다."),
  D("PASS", "rich", "central", "단일 관측의 변동성을 다지점 반복 측정으로 줄인다는 통계 원리가 사례와 잘 맞는다."),
];

function normalizeContent(text) {
  return text
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n+ */g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function contentHash(value) {
  return sha256(normalizeContent(value));
}

function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortDeep(child)]),
    );
  }
  return value;
}

function stableStringify(value, space = 2) {
  return `${JSON.stringify(sortDeep(value), null, space)}\n`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function fiveGrams(text) {
  const tokens = text.toLowerCase().match(/[a-z]+/g) ?? [];
  const result = new Set();
  for (let index = 0; index + 4 < tokens.length; index += 1) {
    result.add(tokens.slice(index, index + 5).join(" "));
  }
  return result;
}

function jaccard(left, right) {
  let intersection = 0;
  for (const item of left) if (right.has(item)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

function tally(values) {
  return Object.fromEntries(
    [...new Set(values)]
      .sort()
      .map((value) => [value, values.filter((candidate) => candidate === value).length]),
  );
}

const privateManifest = JSON.parse(fs.readFileSync(PRIVATE_PATH, "utf8"));
const publicManifest = JSON.parse(fs.readFileSync(PUBLIC_PATH, "utf8"));
const repoSource = JSON.parse(fs.readFileSync(REPO_SOURCE_PATH, "utf8"));

assert(devDecisions.length === 60, `dev decisions: ${devDecisions.length}`);
assert(holdoutDecisions.length === 60, `holdout decisions: ${holdoutDecisions.length}`);
assert(privateManifest.splits.dev.length === 60, "private dev manifest is not 60");
assert(privateManifest.splits.holdout.length === 60, "private holdout manifest is not 60");
assert(publicManifest.splits.dev.length === 60, "public dev manifest is not 60");
assert(publicManifest.splits.holdout.length === 60, "public holdout manifest is not 60");

const records = [];
for (const [split, decisions] of [
  ["dev", devDecisions],
  ["holdout", holdoutDecisions],
]) {
  privateManifest.splits[split].forEach((passage, index) => {
    const review = decisions[index];
    assert(contentHash(passage.content) === passage.contentHash, `${split} ${index + 1}: content hash mismatch`);
    records.push({
      reviewer: "rater-2",
      sequence: index + 1,
      split,
      id: passage.id,
      origin: passage.origin,
      contentHash: passage.contentHash,
      status: review.status,
      grammarRichness: review.grammarRichness,
      blankSuitability: review.blankSuitability,
      reason: review.reason,
      issueCodes: review.issueCodes,
    });
  });
}

assert(records.length === 120, `review records: ${records.length}`);
assert(new Set(records.map((record) => record.id)).size === 120, "review IDs are not unique");
assert(new Set(records.map((record) => record.contentHash)).size === 120, "manifest hashes are not unique");

const publicKeys = [
  "automaticStatus",
  "candidateOnly",
  "contentHash",
  "features",
  "id",
  "integrityFlags",
  "manualAudit",
  "origin",
  "provenance",
  "strata",
  "wordCount",
];
let publicRecordMatches = 0;
for (const split of ["dev", "holdout"]) {
  const publicById = new Map(publicManifest.splits[split].map((record) => [record.id, record]));
  for (const privateRecord of privateManifest.splits[split]) {
    const publicRecord = publicById.get(privateRecord.id);
    assert(publicRecord, `${split}: missing public record ${privateRecord.id}`);
    for (const key of publicKeys) {
      assert(
        stableStringify(publicRecord[key]) === stableStringify(privateRecord[key]),
        `${split} ${privateRecord.id}: public/private mismatch at ${key}`,
      );
    }
    publicRecordMatches += 1;
  }
}

const recomputedPublicHash = sha256(stableStringify(publicManifest));
assert(
  recomputedPublicHash === privateManifest.publicManifestSha256,
  "private publicManifestSha256 does not match public manifest",
);

const repoById = new Map(repoSource.map((passage) => [`repo:${passage.id}`, passage]));
const repoRecords = [
  ...privateManifest.splits.dev,
  ...privateManifest.splits.holdout,
].filter((passage) => passage.origin === "repo-official");
for (const passage of repoRecords) {
  const source = repoById.get(passage.id);
  assert(source, `repo source missing: ${passage.id}`);
  assert(contentHash(source.text) === passage.contentHash, `repo source drift: ${passage.id}`);
}

nextEnv.loadEnvConfig(ROOT);
const prismaModule = await import("../../../../src/lib/prisma.ts");
const prisma =
  prismaModule.prisma ??
  prismaModule.default?.prisma ??
  prismaModule.default?.default?.prisma ??
  prismaModule["module.exports"]?.prisma;
assert(prisma, "could not resolve Prisma client export");
const dbRecords = [
  ...privateManifest.splits.dev,
  ...privateManifest.splits.holdout,
].filter((passage) => passage.origin === "db-real");
const dbRows = await prisma.passage.findMany({
  where: { id: { in: dbRecords.map((passage) => passage.id) } },
  select: {
    id: true,
    content: true,
    source: true,
    subject: true,
    sourceMaterial: { select: { type: true, subject: true, title: true } },
  },
});
await prisma.$disconnect();
const dbById = new Map(dbRows.map((row) => [row.id, row]));
for (const passage of dbRecords) {
  const source = dbById.get(passage.id);
  assert(source, `DB source missing: ${passage.id}`);
  assert(contentHash(source.content) === passage.contentHash, `DB source drift: ${passage.id}`);
  assert(source.source || source.sourceMaterial, `DB source metadata missing: ${passage.id}`);
  assert(!source.subject || source.subject === "ENGLISH", `DB subject mismatch: ${passage.id}`);
}

const passages = [
  ...privateManifest.splits.dev.map((passage, index) => ({ ...passage, split: "dev", sequence: index + 1 })),
  ...privateManifest.splits.holdout.map((passage, index) => ({ ...passage, split: "holdout", sequence: index + 1 })),
];
const gramSets = passages.map((passage) => fiveGrams(passage.content));
const duplicateSignals = [];
for (let left = 0; left < passages.length; left += 1) {
  for (let right = left + 1; right < passages.length; right += 1) {
    const similarity = jaccard(gramSets[left], gramSets[right]);
    if (similarity >= 0.45) {
      duplicateSignals.push({
        left: {
          split: passages[left].split,
          sequence: passages[left].sequence,
          id: passages[left].id,
          contentHash: passages[left].contentHash,
        },
        right: {
          split: passages[right].split,
          sequence: passages[right].sequence,
          id: passages[right].id,
          contentHash: passages[right].contentHash,
        },
        tokenFiveGramJaccard: Number(similarity.toFixed(3)),
      });
    }
  }
}
duplicateSignals.sort((left, right) => right.tokenFiveGramJaccard - left.tokenFiveGramJaccard);

const bySplit = {};
for (const split of ["dev", "holdout"]) {
  const splitRecords = records.filter((record) => record.split === split);
  bySplit[split] = {
    total: splitRecords.length,
    status: tally(splitRecords.map((record) => record.status)),
    grammarRichness: tally(splitRecords.map((record) => record.grammarRichness)),
    blankSuitability: tally(splitRecords.map((record) => record.blankSuitability)),
  };
}

const output = {
  schemaVersion: 1,
  reviewer: "rater-2",
  independenceStatement:
    "이 판정은 private/public corpus manifest와 원천 레코드만 사용했다. rater-1.json, research-note.md, 기존 평가 결과는 열람하지 않았다.",
  reviewedAt: "2026-07-15T01:47:19+09:00",
  methodology: {
    statusDefinitions: {
      PASS: "표면·논리·출처가 현재 실험 후보로 사용 가능하다.",
      EXCLUDE: "오염·오류·중복 때문에 현재 실험에서 제외해야 한다.",
      DOMAIN_REVIEW: "표면과 논리는 사용 가능하지만 전문 사실·문화·정책 검토 전에는 투입하지 않는다.",
    },
    grammarRichnessDefinitions: {
      rich: "복수의 안전한 종속·관계·분사·태·일치 구조를 제공한다.",
      normal: "유효한 문법 구조는 있으나 다양성 또는 안전한 표적 수가 보통이다.",
      scarce: "오염을 제외하면 안전하게 표적화할 문법 구조가 매우 제한된다.",
    },
    blankSuitabilityDefinitions: {
      central: "지문 전체의 중심 논리로 정답을 확정할 빈칸을 설계할 수 있다.",
      local: "국소 문맥·사실 빈칸은 가능하지만 중심 추론형 빈칸에는 덜 적합하다.",
      unsuitable: "오염·파편·논리 손상 때문에 빈칸 생성에 사용하면 안 된다.",
    },
    duplicateSignal:
      "영문 소문자 토큰 5-gram 집합의 Jaccard가 0.45 이상인 모든 쌍을 보조 신호로 산출했다. 이는 판정기가 아니라 수동 검수용 신호다.",
  },
  integrity: {
    privateManifest: path.relative(ROOT, PRIVATE_PATH).replaceAll("\\", "/"),
    publicManifest: path.relative(ROOT, PUBLIC_PATH).replaceAll("\\", "/"),
    publicManifestSha256Stored: privateManifest.publicManifestSha256,
    publicManifestSha256Recomputed: recomputedPublicHash,
    publicManifestHashMatches: true,
    privateContentHashesRecomputed: 120,
    privateContentHashMismatches: 0,
    publicPrivateRecordMatches: publicRecordMatches,
    publicPrivateRecordMismatches: 0,
    uniqueIds: new Set(records.map((record) => record.id)).size,
    uniqueContentHashes: new Set(records.map((record) => record.contentHash)).size,
    repoSource: {
      path: path.relative(ROOT, REPO_SOURCE_PATH).replaceAll("\\", "/"),
      requested: repoRecords.length,
      found: repoRecords.length,
      contentHashDrift: 0,
    },
    dbSourceReadOnlyCheck: {
      operation: "Prisma passage.findMany SELECT; no mutation-capable operation used",
      requested: dbRecords.length,
      found: dbRows.length,
      missing: 0,
      contentHashDrift: 0,
      sourceMetadataMissing: 0,
      subjectMismatch: 0,
    },
    duplicateSignalCount: duplicateSignals.length,
    caveat:
      "SHA-256는 120개 모두 고유하지만, 구두점·OCR·문장순서만 다른 준중복이 다수 존재한다. 따라서 hash 고유성만으로 split 독립성을 보장할 수 없다.",
  },
  aggregate: {
    total: records.length,
    status: tally(records.map((record) => record.status)),
    grammarRichness: tally(records.map((record) => record.grammarRichness)),
    blankSuitability: tally(records.map((record) => record.blankSuitability)),
    bySplit,
  },
  duplicateSignals,
  records,
};

fs.writeFileSync(OUTPUT_PATH, stableStringify(output), "utf8");
console.log(
  JSON.stringify(
    {
      output: path.relative(ROOT, OUTPUT_PATH),
      records: records.length,
      aggregate: output.aggregate,
      integrity: output.integrity,
    },
    null,
    2,
  ),
);
