export const meta = {
  name: 'qbank-crossreview',
  description: 'Codex 저작 유닛에 Claude 교차검수 — 블라인드 풀이 → 적대검수 → critical 반증',
  phases: [
    { title: 'Review', detail: '유닛별 블라인드 풀이 + 5렌즈 적대검수' },
    { title: 'Verify', detail: 'critical 발견마다 독립 반증자' },
  ],
}

const A = typeof args === 'string' ? JSON.parse(args) : (args || {})
const UNITS = Array.isArray(A) ? A : (A.units || [])
if (!UNITS.length) throw new Error('검수할 유닛이 없다 — args 로 유닛 배열을 넘겨라')

// ⚠ 저작이 끝나지 않은 유닛에 검수를 걸면 **구판본을 검수**하게 된다.
//    실전 사고: 저작 풀이 q20/q22 를 재저작하는 중에 이 워크플로를 발사해,
//    critical 지적 2건이 "이미 수리된 옛 판본" 사유로 기각됐다(타임스탬프로 확인됨).
//    검수자에게 최신 확인을 시키는 것(프롬프트 ③)은 완화책이고, 근본 해법은 겹치지 않게 거는 것이다.
log(`⚠ 확인 사항: 아래 유닛에 대한 저작·수리 풀이 **모두 종료**된 상태여야 한다.`)
log(`   진행 중이면 검수가 구판본을 읽는다 — qbank/logs/ 의 풀 로그로 완료를 먼저 확인하라.`)

const REVIEW_SCHEMA = {
  type: 'object',
  required: ['passageId', 'subType', 'grade', 'blindSolve', 'findings'],
  properties: {
    passageId: { type: 'string' },
    subType: { type: 'string' },
    grade: { type: 'string', enum: ['A', 'B', 'C', 'D', 'F'] },
    blindSolve: {
      type: 'array',
      items: {
        type: 'object',
        required: ['item', 'myAnswer', 'confidence', 'matchesIntended'],
        properties: {
          item: { type: 'number' },
          myAnswer: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          matchesIntended: { type: 'boolean' },
          competingOption: { type: 'string' },
        },
      },
    },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['item', 'severity', 'axis', 'summary', 'evidence'],
        properties: {
          item: { type: 'number' },
          severity: { type: 'string', enum: ['critical', 'major', 'minor'] },
          axis: { type: 'string' },
          summary: { type: 'string' },
          evidence: { type: 'string' },
          fix: { type: 'string' },
        },
      },
    },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['refuted', 'reason'],
  properties: {
    refuted: { type: 'boolean' },
    reason: { type: 'string' },
    severityAdjusted: { type: 'string', enum: ['critical', 'major', 'minor', 'none'] },
  },
}

const reviewPrompt = (u) => [
  `너는 수능 영어 문항 **적대적 검수자**다. 아래 유닛을 검수하고 결과를 구조화해 반환하라.`,
  ``,
  `유닛: ${u.passageId} / ${u.subType} (${u.items}문항)`,
  `문항 파일: qbank/out/2027/${u.passageId}/${u.subType}.md`,
  `게이트 결과: qbank/out/2027/${u.passageId}/${u.subType}.gate.json`,
  ``,
  `**필독** (순서대로):`,
  `1. qbank/spec/quality-constitution.md — 특히 §2 실패축, §3 미끼 분류(L1-L7/F1-F7), §8 다섯 렌즈`,
  `2. qbank/spec/craft/00-AUTHORING.md — 저자가 지킨다고 선언한 규약`,
  ``,
  `**이 유닛은 다른 모델(Codex/gpt-5.6)이 저작했다.** 너는 그 모델이 갖지 못한 풀이 경로를 갖고 있다.`,
  `교차 검수의 가치는 전적으로 거기서 나온다 — 저자와 같은 길로 풀면 검수가 아니다.`,
  ``,
  `## 1단계 — 블라인드 풀이 (반드시 먼저, 그리고 정직하게)`,
  `\`정답:\` 줄과 \`해설:\` 줄을 **보기 전에** 문항을 직접 풀어라. 실제로 가려서 풀어라 —`,
  `정답을 본 뒤 "나도 그렇게 풀었다"고 쓰는 것은 이 단계를 무효화한다.`,
  `풀고 나서 의도된 정답과 대조해 \`matchesIntended\` 를 기록하라.`,
  `**불일치가 나오면 그것은 거의 항상 정답 복수 성립(V2)의 직접 증거다.** 숨기지 마라.`,
  `끝까지 남은 경쟁 선지가 있으면 \`competingOption\` 에 그 이유와 함께 적어라.`,
  ``,
  `## 2단계 — 다섯 렌즈 적대 검수`,
  `헌법 §8 의 다섯 렌즈를 각각 적용하라. 축(axis)은 V1(형식)·V2(정답붕괴)·V3(미끼)·`,
  `V4(해설 사실성)·V5(지문 오염)·C5(난이도 정합)·다각화 중 하나로 표기하라.`,
  ``,
  `**해설 검증은 인용을 실제로 대조하라** — 해설이 인용한 영어 표현이 지문에 그대로 있는지,`,
  `해설의 논리 방향이 그 인용과 같은 방향인지. 이 두 가지가 가장 자주 깨진다.`,
  ``,
  `**0건 발견은 검수를 안 한 것이다.** 결함이 있다고 가정하고 찾아라. 다만 근거 없는 지적은 하지 마라 —`,
  `모든 finding 의 \`evidence\` 에 **지문 또는 문항의 실제 문자열을 인용**하라. 인용 없는 지적은 추측이다.`,
  ``,
  `### ⚠ 앞선 검수 라운드에서 지적 16건 중 10건이 반증으로 기각됐다. 그 실패 유형을 피하라.`,
  ``,
  `**① 형식 계약을 결함으로 오인하지 마라 — 기각 사유 1위.**`,
  `이상해 보이는 설계가 사실은 게이트가 **강제한** 것일 수 있다. 실제 사례: 검수자가`,
  `"변형 단락이 원래 연결사를 다른 표현으로 바꿔 게이트를 우회했다"고 지적했으나,`,
  `\`gate-order-variant.ts\` 는 정반대로 **단서를 지우면 반려**하고 그 대체 표현들을 승인 어휘로 열거하고 있었다.`,
  `구조를 지적하기 전에 **해당 유형의 게이트 소스를 열어 그것이 금지인지 강제인지 확인**하라.`,
  ``,
  `**② 정량 주장은 세어 보고 써라 — 기각 사유 2위.**`,
  `"오답 4개 중 3개가 즉사" 같은 주장이 재계산에서 **최대 2개**로 무너졌다.`,
  `배제 휴리스틱을 주장하려면 **그 휴리스틱을 5개 선지에 실제로 적용**해 보라 —`,
  `정답 선지도 같은 표면 특징을 갖고 있으면 그 휴리스틱은 아무것도 소거하지 못한다.`,
  ``,
  `**③ 네가 읽는 파일이 최신인지 확인하라 — 기각 사유 3위.**`,
  `구판본을 검수해 이미 고쳐진 것을 지적한 사례가 2건 있었다.`,
  `\`.md\` 와 \`.gate.json\` 의 수정 시각을 먼저 보고, 인용할 문자열이 **지금 파일에 실재하는지** 확인하라.`,
  ``,
  `**④ 심각도를 부풀리지 마라.** critical 은 "이 문항은 출제하면 안 된다" 는 뜻이다.`,
  `설계 취향 차이·개선 여지는 major 이하다.`,
  ``,
  `## 3단계 — 등급`,
  `A(즉시 출제 가능) / B(minor 만) / C(major 있음) / D(critical 1건) / F(critical 2건 이상)`,
  ``,
  `## 산출`,
  `검수 결과를 \`qbank/out/2027/${u.passageId}/${u.subType}.review.json\` 에 **전면 교체**로 써라`,
  `(기존 파일이 있으면 덮어쓴다 — 부분 수정 금지).`,
  `그리고 같은 내용을 StructuredOutput 으로 반환하라.`,
  `**문항 .md 파일은 절대 수정하지 마라.** 너는 검수자이지 수리자가 아니다.`,
].join('\n')

const verifyPrompt = (u, f) => [
  `너는 **반증 전문가**다. 아래 검수 지적이 **틀렸음을 입증**하는 것이 네 임무다.`,
  ``,
  `대상: qbank/out/2027/${u.passageId}/${u.subType}.md 의 문항 ${f.item}`,
  `지적 축: ${f.axis}`,
  `지적 내용: ${f.summary}`,
  `제시된 근거: ${f.evidence}`,
  ``,
  `실제 파일과 지문을 열어 대조하라. 다음 중 하나라도 해당하면 \`refuted: true\` 다:`,
  `- 근거로 인용된 문자열이 실제 파일에 없다(검수자의 환각)`,
  `- 지문·해설을 다시 읽으면 지적이 성립하지 않는다`,
  `- 이미 해결돼 있다(검수자가 옛 판본을 봤다)`,
  `- 형식 계약상 의도된 동작을 결함으로 오인했다`,
  ``,
  `**불확실하면 \`refuted: true\` 를 기본값으로 하라.** 확신을 갖고 살아남은 지적만 수리 대상이다.`,
  `다만 지적이 명백히 옳으면 정직하게 \`refuted: false\` 로 하고, 심각도가 과장·축소됐다면`,
  `\`severityAdjusted\` 로 교정하라.`,
].join('\n')

phase('Review')
log(`교차검수 시작 — ${UNITS.length}유닛 (Codex 저작 → Claude 검수, 불변조건 I4)`)

const results = await pipeline(
  UNITS,
  (u) => agent(reviewPrompt(u), {
    label: `review:${u.subType}@${u.passageId.slice(-3)}`,
    phase: 'Review',
    schema: REVIEW_SCHEMA,
    agentType: 'quality-engineer',
  }),
  async (rev, u) => {
    if (!rev) return { unit: u, ok: false }
    const crits = (rev.findings || []).filter((f) => f.severity === 'critical')
    if (!crits.length) return { unit: u, review: rev, confirmed: [], refuted: 0 }
    const verdicts = await parallel(crits.map((f) => () =>
      agent(verifyPrompt(u, f), {
        label: `verify:${u.subType}#${f.item}`,
        phase: 'Verify',
        schema: VERDICT_SCHEMA,
      }).then((v) => ({ finding: f, verdict: v }))
    ))
    const live = verdicts.filter(Boolean).filter((v) => v.verdict && !v.verdict.refuted)
    return {
      unit: u,
      review: rev,
      confirmed: live.map((v) => ({ ...v.finding, why: v.verdict.reason })),
      refuted: crits.length - live.length,
    }
  }
)

const ok = results.filter(Boolean).filter((r) => r.review)
const grades = {}
let blindMismatch = 0, critRaw = 0, critConfirmed = 0, critRefuted = 0
const mismatches = []
for (const r of ok) {
  grades[r.review.grade] = (grades[r.review.grade] || 0) + 1
  for (const b of r.review.blindSolve || []) {
    if (!b.matchesIntended) {
      blindMismatch++
      mismatches.push(`${r.unit.subType}#${b.item} → 검수자 답 ${b.myAnswer} (확신 ${b.confidence})`)
    }
  }
  critRaw += (r.review.findings || []).filter((f) => f.severity === 'critical').length
  critConfirmed += r.confirmed.length
  critRefuted += r.refuted
}

log(`완료 — 등급 ${JSON.stringify(grades)} · 블라인드 불일치 ${blindMismatch}건 · critical ${critRaw}건 중 ${critConfirmed}건 확정(${critRefuted}건 반증 기각)`)

return {
  reviewed: ok.length,
  requested: UNITS.length,
  grades,
  blindMismatch,
  mismatches,
  criticals: { raw: critRaw, confirmed: critConfirmed, refuted: critRefuted },
  perUnit: ok.map((r) => ({
    passageId: r.unit.passageId,
    subType: r.unit.subType,
    grade: r.review.grade,
    confirmedCriticals: r.confirmed.length,
    findings: (r.review.findings || []).length,
  })),
}
