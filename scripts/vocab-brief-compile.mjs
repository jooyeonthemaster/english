// 기출 단어 코퍼스 — 추출자 브리프 컴파일러
//
// 왜: 지금까지 브리프가 각 에이전트에게 "docs/vocab-corpus-spec.md 전문을 읽어라"고 시켰다.
//     스펙은 82.5KB 다. 파일 읽기 결과는 그 에이전트 루프의 **매 턴마다 입력으로 다시 과금**되므로
//     턴 8회면 한 지문에 40k 토큰이 320k 로 불어난다(실측 지문당 167~207k 와 일치).
//     세션 한도가 병목인 지금, 이건 곧 처리량이다.
//
// 무엇을: 추출에 **무관한 절을 떼어낸** 스펙 본문을 표준출력으로 낸다.
//   - 떼는 절: §10 sense 병합 규범(4단계) · §11 senseId(6단계) · §12 게이트 운용(감독 절차)
//   - 남기는 절: 감사 배너 · §0~§9 (추출자가 실제로 지켜야 하는 전부)
//
// ⚠️ 사본을 파일로 떠서 쓰지 마라 — 그건 스펙 포크이고 곧 어긋난다.
//    워크플로 빌드 때마다 이 스크립트를 돌려 **그 시점의 정본**을 인라인한다.
import fs from 'fs'
import path from 'path'

const SPEC = path.join(process.cwd(), 'docs/vocab-corpus-spec.md')

/** 추출자에게 불필요한 절 — 제목 접두로 매칭한다. */
const DROP = [
  '10. 4단계 — sense 병합',
  '11. sense 식별자',
  '12. 게이트 운용 규범',
  '13. 추출자 브리프 구성 규범',
  '14. 학생앱 진입점',
]

const lines = fs.readFileSync(SPEC, 'utf8').split('\n')
const out = []
let dropping = false
let droppedBytes = 0
/** 각 DROP 항목이 **입력에서 실제로 제목에 매칭됐는지** 센다. */
const hits = new Map(DROP.map((d) => [d, 0]))

for (const line of lines) {
  if (/^## /.test(line)) {
    const title = line.slice(3).trim()
    const matched = DROP.find((d) => title.startsWith(d))
    dropping = matched !== undefined
    if (matched) hits.set(matched, hits.get(matched) + 1)
  }
  if (dropping) droppedBytes += Buffer.byteLength(line + '\n')
  else out.push(line)
}

const body = out.join('\n')
const kept = Buffer.byteLength(body)
const total = kept + droppedBytes

if (process.argv.includes('--stats')) {
  process.stderr.write(
    `정본 ${total}B → 추출용 ${kept}B (${((kept / total) * 100).toFixed(1)}%) · 제외 ${droppedBytes}B\n`,
  )
}

// 제목이 바뀌면 **조용히 아무것도 안 떼는** 사고를 막는다.
//
// 【음성테스트 실패 2026-07-30】 원래 가드는 "출력 본문에 그 문구가 없으면 성공"으로 셌다.
//   §11 제목을 `sense 식별자`→`sense 아이디`로 바꿔 넣었더니 **종료코드 0으로 통과**했다 —
//   제목이 바뀌면 그 문구는 어차피 출력에 없으니 성공으로 계산된 것이다(가드가 장식이었다).
//   그래서 지금은 **입력 스캔 중 실제 매칭 횟수**를 세고, 0인 항목이 있으면 실패시킨다.
const missed = [...hits].filter(([, n]) => n === 0).map(([d]) => d)
if (missed.length) {
  process.stderr.write(
    `⚠️ 제외 대상 제목을 못 찾았다: ${missed.join(' / ')}\n` +
      `   스펙 제목이 바뀐 것이다. DROP 목록을 갱신하라 — 안 그러면 무관한 절이 브리프에 실려 나간다.\n`,
  )
  process.exit(1)
}

process.stdout.write(body)
