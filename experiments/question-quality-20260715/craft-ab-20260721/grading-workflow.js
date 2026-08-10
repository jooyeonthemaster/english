export const meta = {
  name: 'craft-ab-grading',
  description: 'craft A/B 180문항 블라인드 채점 + F/A 적대검증 (채점자=세션 모델 고정)',
  phases: [
    { title: 'Grade', detail: '문항당 1채점자 — 가리고 풀기 → F/B/A + 공예점수' },
    { title: 'Verify', detail: 'F/A 판정 전건 2-refuter 적대검증' },
  ],
}
// args: { bids: string[], blindPath: string } — 문자열로 오면 방어 파싱.
const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args
const { bids, blindPath } = parsedArgs ?? {}
if (!Array.isArray(bids) || !bids.length || !blindPath) throw new Error('args {bids, blindPath} required')

const GRADE_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    bid: { type: 'string' },
    verdict: { type: 'string', enum: ['F', 'B', 'A'] },
    defects: { type: 'array', items: { type: 'string', maxLength: 200 }, maxItems: 8 },
    craftScore: { type: 'integer', minimum: 0, maximum: 10 },
    craftNote: { type: 'string', maxLength: 400 },
    solvedAnswer: { type: 'string', maxLength: 20 },
    answerMatches: { type: 'boolean' },
  },
  required: ['bid', 'verdict', 'defects', 'craftScore', 'craftNote', 'solvedAnswer', 'answerMatches'],
}
const VERDICT_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    upheld: { type: 'boolean' },
    reason: { type: 'string', maxLength: 300 },
  },
  required: ['upheld', 'reason'],
}

function gradePrompt(bid) {
  return [
    `너는 수능 영어 문항 품질 채점관이다. 파일 ${blindPath} 에서 "bid":"${bid}" 인 줄 하나만 추출해 읽어라(예: Grep 으로 '"bid":"${bid}"' 검색, output_mode=content). 다른 줄·다른 파일(특히 keymap·results 파일)은 절대 열지 마라 — 블라인드 채점이다.`,
    `그 줄의 qtype(blank=빈칸추론 / grammar=어법 5밑줄)·passage(원지문)·item(문항 JSON)으로 다음을 순서대로 수행하라:`,
    `1) 가리고 풀기: item 의 정답 필드를 보기 전에 지문+선지(빈칸) / 지문+밑줄(어법)만으로 직접 풀어 답을 정하라. 그 다음 선언된 정답과 대조하라(solvedAnswer·answerMatches 에 기록).`,
    `2) 치명 결함 검사(하나라도 실재하면 verdict=F): 정답 불성립/복수 정답 방어 불가/선지 대입 비문(빈칸)/오답 밑줄이 실제로는 비문(어법)/해설의 구조 분석이 실제 문장과 모순/해설 인용 표현이 지문·선지에 실재하지 않음/한국어 해설 파손. 단, 형상 차이(필드 유무·해설 길이·문체)는 결함이 아니다 — 내용만 판정하라.`,
    `3) 공예 채점(craftScore 0~10, F 여도 채점): ①표적이 글의 핵심 논지에 있는가(지엽이면 감점) ②오답 하나하나에 뚜렷한 설계 의도·매력 기제가 있는가(그냥 무관하거나 즉시 소거되면 감점) ③시험 요령 내성 — 절대 표현이 오답에만 몰리거나 길이로 정답이 노출되면 감점 ④(어법) 정답 판정에 장거리 구조 단서가 필요한가, 포인트 분산이 좋은가. 8~10=실전 킬러 상위(A급 공예), 5~7=유효하고 준수, 0~4=평범/약함.`,
    `4) verdict: F=치명 결함 실재, A=결함 없음+공예 8 이상, B=그 외.`,
    `defects 에는 실재 확인한 결함만 코드형 짧은 문장으로. 추정·취향은 넣지 마라.`,
  ].join('\n')
}

phase('Grade')
const graded = await parallel(bids.map((bid) => () =>
  agent(gradePrompt(bid), { label: `grade:${bid}`, phase: 'Grade', schema: GRADE_SCHEMA })
    .then((g) => (g ? { ...g, bid } : null))
))
const rows = graded.filter(Boolean)
log(`graded ${rows.length}/${bids.length}`)

phase('Verify')
const needVerify = rows.filter((r) => r.verdict === 'F' || r.verdict === 'A')
const verified = await parallel(needVerify.map((r) => () => {
  const claim = r.verdict === 'F'
    ? `F(치명 결함) 판정: ${JSON.stringify(r.defects)}`
    : `A(킬러 공예 우수, craftScore=${r.craftScore}) 판정: ${r.craftNote}`
  return parallel([1, 2].map((i) => () =>
    agent(
      `너는 적대 검증관 #${i}다. 파일 ${blindPath} 에서 "bid":"${r.bid}" 인 줄 하나만 읽어라(다른 파일 금지). 다음 판정을 반박하라: ${claim}\n` +
      `직접 재풀이·재파싱해서 판정이 틀렸음을 입증할 수 있으면 upheld=false. 입증 못 하면 upheld=true. 취향이 아니라 실증만.`,
      { label: `verify:${r.bid}#${i}`, phase: 'Verify', schema: VERDICT_SCHEMA },
    )))
    .then((vs) => {
      const ok = vs.filter(Boolean)
      const upheldCount = ok.filter((v) => v.upheld).length
      return { bid: r.bid, origVerdict: r.verdict, upheld: ok.length === 0 ? true : upheldCount >= Math.ceil(ok.length / 2), votes: ok.map((v) => ({ upheld: v.upheld, reason: v.reason })) }
    })
}))
const flips = new Map()
for (const v of verified.filter(Boolean)) {
  if (!v.upheld) flips.set(v.bid, v.origVerdict === 'F' ? 'B' : 'B')
}
const final = rows.map((r) => ({ ...r, finalVerdict: flips.get(r.bid) ?? r.verdict, flipped: flips.has(r.bid) }))
log(`verify done: ${needVerify.length} checked, ${flips.size} flipped`)
return { graded: final, verifyDetail: verified.filter(Boolean) }
