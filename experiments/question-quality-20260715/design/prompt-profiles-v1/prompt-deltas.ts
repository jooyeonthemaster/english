/**
 * Research-only prompt profiles for GRAMMAR_ERROR and BLANK_INFERENCE.
 *
 * This file is not imported by production.  It deliberately contains complete,
 * exact replacement blocks rather than prose like "make the prompt shorter" so
 * a later sealed runner can hash the actual treatment bytes.
 */

export const GRAMMAR_POSITIVE_CORE_PROMPT = `어법 판단 문항 1개를 만드세요.

## 목표
학생이 문장 구조를 끝까지 추적해야 풀 수 있지만, 정답은 현대 표준 영어와 학교 문법 어느 쪽에서도 이견이 없어야 합니다.

## 설계 순서
1. 원문에서 CORE-10 구조 지점(a~i, k)을 찾고, 원문 형태가 정문인 이유를 먼저 확정합니다.
2. 그중 하나만 정답 지점으로 고릅니다. 원문 어간을 유지한 최소 형태 변형 하나로 비문을 만들고, 가능한 가장 강한 대안 해석으로도 정문이 되지 않는지 확인합니다.
3. 나머지 네 지점은 원문 그대로 둡니다. 각각 실제 구조 판단이 필요한 서로 다른 문법 지점이어야 합니다.
4. 밑줄은 판단 토큰만 1~3단어로 잡고, surroundingText에는 판단에 필요한 전체 의존 구간을 원문 그대로 넣습니다.
5. 정답 해설은 표시된 오형, 구조 근거, 교정형, 가장 강한 반론이 배제되는 이유만 간결하게 설명합니다.

## 난이도
- BASIC: 한 문장 안의 명백한 구조 단서로 판정합니다.
- INTERMEDIATE: 수식어·절 경계를 건너 구조를 추적해야 판정합니다.
- KILLER: 둘 이상의 구조 단서를 결합해야 하며, 정답 지점과 미끼 지점 모두 표면 스캔으로 소거되지 않아야 합니다.

## 현재 스키마 필드 사용
- errorDesign에는 SITE | SOURCE | FRAME | RULE | MUTATION | COUNTERPARSE 순서의 짧은 인증 메모를 씁니다.
- markedExpressions의 유일한 isError=true 항목만 errorDesign의 MUTATION과 일치시킵니다.
- isError=false 항목은 expression과 errorExpression을 원문과 동일하게 둡니다.
- correctAnswer, options, wrongOptionExplanations, explanation, keyPoints를 같은 라벨·표현·pointCode로 동기화합니다.`;

export const GRAMMAR_SITE_CERTIFICATE_DELTA = `## 구조화 site certificate
문항 필드보다 siteCertificate를 먼저 완성합니다.
- certificationStatus가 CERTIFIED일 때만 정답 오류를 심습니다.
- sourceSentenceExact, sourceExpressionExact, surroundingTextExact는 원문 축자 인용입니다.
- pointCode는 CORE-10(a~i, k) 중 하나이며 frame과 governingRule은 실제 표면 구조를 설명합니다.
- mutation.correction은 sourceExpressionExact와 같고, mutation.displayedError만 의도적 오형입니다.
- strongestAlternativeParse를 실제로 시도하고 whyAlternativeFails에 그 해석도 성립하지 않는 통사 근거를 씁니다.
- markedExpressions에서 isError=true인 단 하나의 항목은 인증서의 sourceExpressionExact, displayedError, correction, pointCode, surroundingTextExact와 모두 일치해야 합니다.
- 인증할 안전한 자리가 없으면 certificationStatus=NO_SAFE_SITE로 기록합니다. 연구 게이트는 이 응답을 실패 후보로 계상하고 출하하지 않습니다.`;

export const BLANK_POSITIVE_CORE_PROMPT = `빈칸 추론 문항 1개를 만드세요.

## 목표
모든 선지가 같은 문법 자리에 자연스럽게 들어가고 같은 소재권에서 경쟁하지만, 지문 논리를 끝까지 대조하면 정답 하나만 남아야 합니다.

## 설계 순서
1. 빈칸 문장의 담화 역할과 정답이 완성할 의미축을 먼저 정합니다.
2. 정답을 증명하는 원문 근거를 고릅니다. BASIC은 직접 재진술, INTERMEDIATE는 두 문장 연결, KILLER는 전체 논지가 수렴하는 둘 이상의 근거를 사용합니다.
3. 네 오답은 정답과 같은 품사·절 형식·극성·길이·문체로 씁니다. 각 오답은 본문 개념을 빌리되 관계, 범위, 주체, 원인, 태도 중 한 축만 어긋나게 합니다.
4. 각 오답마다 왜 매력적인지와 어느 근거가 결정적으로 배제하는지를 하나씩 대응시킵니다. 같은 이유로 탈락하는 오답은 다시 씁니다.
5. 모든 선지를 실제 prefix + option + suffix로 결합해 문법 seam을 확인한 뒤, 정답과 오답 해설을 작성합니다.

## 난이도
- BASIC: 근거가 보이되 무관한 선지로 난도를 낮추지 않습니다.
- INTERMEDIATE: 가까운 두 근거의 관계를 연결해야 합니다.
- KILLER: 정답은 압축된 추상 재진술이고, 오답은 강한 학생이 5~15초 고민할 한 축짜리 근접오류여야 합니다.

## 현재 스키마 필드 사용
- blankDesign에는 AXIS | EVIDENCE | SLOT | O1 | O2 | O3 | O4 순서의 짧은 설계 메모를 씁니다.
- originalExpression과 surroundingText는 원문 축자 인용이며, visible option의 모드는 blankAnswerMode 계약을 따릅니다.
- options, correctAnswer, wrongOptionExplanations, explanation은 동일한 근거·라벨·오류축을 공유합니다.`;

export const BLANK_OPTION_LEDGER_DELTA = `## 구조화 option-intent ledger
문항 필드보다 blankBlueprint를 먼저 완성합니다.
- target.answerMeaningAxis에는 정답이 보존해야 할 명제·관계·범위·극성을 한 문장으로 씁니다.
- target.evidenceAnchors는 원문 축자 인용이며, target.slotContract는 빈칸 좌우 경계와 모든 선지가 맞춰야 할 문법 형식을 고정합니다.
- optionIntentLedger.correctIntent는 정확히 1개, distractorIntents는 정확히 4개를 포함합니다. 다섯 라벨은 중복 없이 1~5를 한 번씩 사용하며, 각 proposedText는 뒤의 같은 라벨 option.text와 문자 그대로 같아야 합니다.
- 각 distractor는 본문에서 빌린 개념, 단 하나의 주된 오류축, 정답과의 오류거리, 결정적 배제 근거, 정답과 동시에 참일 수 없는 이유를 기록합니다.
- KILLER distractor는 semanticOverlap=HIGH이고 distortionCount=ONE이어야 합니다. 표면 극성이나 길이만으로 소거되는 intent는 다시 설계합니다.
- 각 proposedText를 prefix + proposedText + suffix로 결합해 seam이 모두 자연스러운지 확인합니다. 연구 게이트가 이 결합을 다시 계산합니다.`;

export const EXACT_PROMPT_PROFILES = {
  G2_POSITIVE_COMPACT: GRAMMAR_POSITIVE_CORE_PROMPT,
  G3_SITE_CERTIFICATE: `${GRAMMAR_POSITIVE_CORE_PROMPT}\n\n${GRAMMAR_SITE_CERTIFICATE_DELTA}`,
  B2_POSITIVE_COMPACT: BLANK_POSITIVE_CORE_PROMPT,
  B3_OPTION_INTENT_LEDGER: `${BLANK_POSITIVE_CORE_PROMPT}\n\n${BLANK_OPTION_LEDGER_DELTA}`,
} as const;

export type ExactPromptProfileId = keyof typeof EXACT_PROMPT_PROFILES;
