export const meta = {
  name: 'question-blind-eval',
  description: '문항 배치 독립 블라인드 평가 (솔버2+감사자1+조정자) — args: {evalDir, items}',
  phases: [
    { title: 'Solve+Audit', detail: '문항별 블라인드 솔버 2 + 전체 감사자 1 병렬' },
    { title: 'Adjudicate', detail: '불일치 문항 제3 조정' },
  ],
}

const RUBRIC = 'D:/Desktop/2026project/nara/experiments/question-quality-20260715/RUBRIC.md'
const input = typeof args === 'string' ? JSON.parse(args) : args
const EVAL_DIR = input.evalDir
const items = input.items

const SOLVER_SCHEMA = {
  type: 'object',
  properties: {
    pid: { type: 'string' },
    answer: { type: 'string', description: '선택한 정답 라벨 (문항에 표기된 라벨 그대로)' },
    multipleDefensible: { type: 'boolean' },
    defensibleLabels: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    unsolvable: { type: 'boolean' },
    note: { type: 'string' },
  },
  required: ['pid', 'answer', 'multipleDefensible', 'defensibleLabels', 'confidence', 'unsolvable', 'note'],
}

const AUDITOR_SCHEMA = {
  type: 'object',
  properties: {
    pid: { type: 'string' },
    validity: {
      type: 'object',
      properties: { V1: { type: 'boolean' }, V2: { type: 'boolean' }, V3: { type: 'boolean' }, V4: { type: 'boolean' }, V5: { type: 'boolean' } },
      required: ['V1', 'V2', 'V3', 'V4', 'V5'],
    },
    craft: {
      type: 'object',
      properties: { C1: { type: 'integer' }, C2: { type: 'integer' }, C3: { type: 'integer' }, C4: { type: 'integer' }, C5: { type: 'integer' }, C6: { type: 'integer' } },
      required: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'],
    },
    grade: { type: 'string', enum: ['A', 'B', 'C', 'F'] },
    killerConditionsMet: { type: 'boolean' },
    wroteFile: { type: 'boolean' },
  },
  required: ['pid', 'validity', 'craft', 'grade', 'killerConditionsMet', 'wroteFile'],
}

const ADJ_SCHEMA = {
  type: 'object',
  properties: {
    pid: { type: 'string' },
    finalV2: { type: 'boolean' },
    reason: { type: 'string' },
    wroteFile: { type: 'boolean' },
  },
  required: ['pid', 'finalV2', 'reason', 'wroteFile'],
}

function solverPrompt(item, lens, role) {
  return `너는 한국 수능 영어 문항의 독립 블라인드 검수자다. 파일 ${EVAL_DIR}/blind/${item.pid}.md 를 Read 로 읽고 문항을 직접 풀어라.

렌즈: ${lens}

절차(반드시 순서대로):
1. 지문을 정독한다.
2. 각 선지를 독립적으로 판정한다 — 어법이면 각 밑줄이 문맥에서 어법상 옳은지 지배 규칙(진짜 주어·선행사·병렬 시작점·의미상 주어 등 장거리 단서)을 확인해 판정하고, 빈칸이면 각 선지를 실제로 빈칸에 넣어 문법 결합(seam)과 지문 논리 적합성을 판정한다.
3. 대안 해석(축약 관계절, 분사구문, 도치, 수여동사 수동태의 잔류 목적어 등)이 성립해 표기가 정문이 되는 경우를 적극적으로 탐색하라. 출제 의도를 추측해서 눈감아 주지 마라.
4. 논리적으로 옹호 가능한 정답 후보를 전부 defensibleLabels 에 기록하라. 하나로 좁혀지지 않으면 multipleDefensible=true 로 정직하게 보고하라.
5. 풀이 결과 전체(선지별 판정·근거 포함)를 ${EVAL_DIR}/reviews/${item.pid}.${role}.json 에 Write 로 저장하라. JSON 형식: {"pid","answer","multipleDefensible","defensibleLabels","confidence","perOption":[{"label","verdict","reason"}],"note"}

주의: 이 문항의 정답·해설·출제 모델 정보는 일부러 제공되지 않았다. 오직 지문과 선지만으로 판정하라.
마지막으로 StructuredOutput 으로 요약을 반환하라 (pid="${item.pid}").`
}

function auditorPrompt(item) {
  return `너는 한국 수능 영어 문항의 독립 품질 감사자다. 다음 두 파일을 Read 로 읽어라:
1. ${RUBRIC} (평가 기준)
2. ${EVAL_DIR}/full/${item.pid}.md (문항 전체: 원지문·렌더 지문·정답·해설 포함)

감사 절차:
1. **V1 무결성**: 렌더 지문이 원지문에서 의도된 변형 외에 손상(문장 접합 파손·중복·누락·고아 문장부호·오탈자)이 없는가. 라벨·마커가 선지와 일치하는가.
2. **V2 정답 유일성**: 선언된 정답 외의 선지가 정답이 될 수 없는지 각 선지를 독립 검증하라. 어법이면 각 밑줄의 실제 통사 구조를 스스로 분석하고(대안 해석 포함), 빈칸이면 각 선지를 빈칸에 넣어 논리·문법을 확인하라.
3. **V3 문법성**: 지문·발문·(정답을 넣은) 완성문이 문법적이고 자연스러운가. 빈칸 seam 비문, 비단어, 오탈자를 점검하라.
4. **V4 해설 사실성**: 해설의 문법 용어·구조 분석이 실제 문장과 일치하는가(명사절 that 을 관계대명사로 부르는 류의 오분석, 존재하지 않는 선행사 지목, 인과 오설명, 비단어·손상 용어, 지문에 없는 내용 첨가, 문장 귀속 오류). 오답 해설이 실제 그 선지 내용과 대응하는가.
5. **V5 필드 동기화**: 정답 라벨·선지·해설·keyPoints 가 서로 모순 없는가.
6. **공예 C1~C6 (각 0~4)**: RUBRIC.md §B 기준. 요청 난이도는 문항 파일의 "요청 난이도" 필드다(C5 판정 기준).
7. **KILLER 조건**: 요청 난이도가 KILLER 인 경우 RUBRIC.md §C(어법)/§D(빈칸)의 추가 조건 충족 여부를 killerConditionsMet 로 판정하라. KILLER 가 아니면 false.

전체 감사 결과(각 V 의 근거, 각 선지의 intent/tempting/decisiveFlaw, 이슈 목록 포함)를 ${EVAL_DIR}/reviews/${item.pid}.auditor.json 에 Write 로 저장하라. JSON 형식: {"pid","validity":{"V1".."V5"},"validityIssues":[{"code","severity","evidence"}],"craft":{"C1".."C6"},"optionAudit":[{"label","intent","temptingBecause","decisiveFlaw"}],"explanationIssues":[],"killerConditionsMet","grade","notes"}

치명(V 실패)은 공예 점수로 상쇄되지 않는다. 확신이 없으면 해당 V 를 false 로 판정하라(보수적).
마지막으로 StructuredOutput 으로 요약을 반환하라 (pid="${item.pid}").`
}

phase('Solve+Audit')
log(`평가 대상 ${items.length}개 문항 × (솔버2+감사자1) @ ${EVAL_DIR}`)

const results = await parallel(items.map((item) => async () => {
  const [s1, s2, aud] = await Promise.all([
    agent(solverPrompt(item, '최상위권 수험생: 실전 풀이 순서로 접근하되 매력적 오답에 실제로 끌려보고 그 유혹을 기록한다', 'solver1'), { label: `solve1:${item.pid}`, phase: 'Solve+Audit', schema: SOLVER_SCHEMA }),
    agent(solverPrompt(item, '문법가/논리학자: 각 선지의 문법성·논리 성립을 형식적으로 증명하듯 판정한다', 'solver2'), { label: `solve2:${item.pid}`, phase: 'Solve+Audit', schema: SOLVER_SCHEMA }),
    agent(auditorPrompt(item), { label: `audit:${item.pid}`, phase: 'Solve+Audit', schema: AUDITOR_SCHEMA }),
  ])
  return { item, s1, s2, aud }
}))

phase('Adjudicate')
const norm = (a) => String(a || '').trim()
const disputes = results.filter(Boolean).filter(({ item, s1, s2, aud }) => {
  if (!s1 || !s2 || !aud) return false
  const key = norm(item.correctAnswer)
  const blindOk = norm(s1.answer) === key && norm(s2.answer) === key && !s1.multipleDefensible && !s2.multipleDefensible
  return !blindOk || aud.validity.V2 === false
})
log(`조정 필요 ${disputes.length}건`)

const adjudicated = await parallel(disputes.map(({ item, s1, s2, aud }) => () =>
  agent(`너는 정답 유일성 분쟁의 최종 조정자다. 다음 파일을 모두 Read 로 읽어라:
1. ${EVAL_DIR}/blind/${item.pid}.md (문항)
2. ${EVAL_DIR}/full/${item.pid}.md (정답·해설 포함 전체)
3. ${EVAL_DIR}/reviews/${item.pid}.solver1.json, ${EVAL_DIR}/reviews/${item.pid}.solver2.json, ${EVAL_DIR}/reviews/${item.pid}.auditor.json

분쟁 요약: 선언된 정답=${item.correctAnswer}, 솔버1=${s1.answer}(복수:${s1.multipleDefensible}, 후보:[${(s1.defensibleLabels || []).join(',')}]), 솔버2=${s2.answer}(복수:${s2.multipleDefensible}, 후보:[${(s2.defensibleLabels || []).join(',')}]), 감사자 V2=${aud.validity.V2}

임무: 각 쟁점 선지의 문법성/논리 성립을 처음부터 독립적으로 재검증하고, 선언된 정답이 유일한 정답인지 최종 판정하라. 솔버들이 놓친 대안 해석이나 과잉 판정(성립하지 않는 대안 해석을 성립한다고 우긴 경우)을 모두 검토하라. 판정 근거 전체를 ${EVAL_DIR}/reviews/${item.pid}.adjudicator.json 에 Write 로 저장하라: {"pid","finalV2","winningAnswer","reason","perDispute":[{"label","claim","verdict","evidence"}]}
StructuredOutput 으로 요약 반환 (pid="${item.pid}").`, { label: `adj:${item.pid}`, phase: 'Adjudicate', schema: ADJ_SCHEMA })
))

const adjOk = adjudicated.filter(Boolean)
return {
  evalDir: EVAL_DIR,
  evaluated: results.filter(Boolean).length,
  disputes: disputes.map(d => d.item.pid),
  adjudicated: adjOk.map(a => ({ pid: a.pid, finalV2: a.finalV2 })),
}
