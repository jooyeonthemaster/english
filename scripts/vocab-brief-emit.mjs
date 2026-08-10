// 트랜치 워크플로 스크립트에서 **에이전트가 받는 브리프 원문 그대로** 를 뽑아낸다.
//
// 왜: 무인 하네스(`vocab-claude-forever.sh`)는 Workflow 도구를 못 쓴다(헤드리스 `claude -p` 에
//     그 도구가 없다 — 2026-08-03 실측). 그래서 같은 일을 `claude -p` 로 시키는데, 이때
//     **브리프를 손으로 다시 쓰면 검증된 경로에서 이탈한다.** 트랜치 스크립트가 이미 정본
//     스펙·견본·지문을 인라인해 두었으므로, 그 안의 `brief(id)` 를 그대로 호출해 찍는다.
//
// 어떻게: 트랜치 스크립트는 ESM + 워크플로 전역(phase/agent/parallel)에 의존하므로 import 할 수 없다.
//         실행부(맨 끝 `log('트랜치 발사…')` 이후)를 잘라내고 선언부만 Function 으로 평가한다.
//
//   node scripts/vocab-brief-emit.mjs <트랜치스크립트> <지문ID>
//   node scripts/vocab-brief-emit.mjs <트랜치스크립트> --ids    # 그 트랜치의 ID 목록
import fs from 'fs'

const [, , scriptPath, id] = process.argv
if (!scriptPath || !id) {
  console.error('usage: vocab-brief-emit.mjs <tranche.js> <passageId|--ids>')
  process.exit(2)
}

let src = fs.readFileSync(scriptPath, 'utf8')

// 실행부 절단 — 선언(meta/ROOT/OUT/IDS/SCHEMA/PDATA/brief)만 남긴다.
const MARKER = "log('트랜치 발사"
const cut = src.indexOf(MARKER)
if (cut < 0) {
  console.error('실행부 마커를 못 찾았다 — 템플릿이 바뀌었다. 조립기와 함께 점검하라.')
  process.exit(1)
}
src = src.slice(0, cut).replace(/^export const meta/m, 'const meta')

// 절단선 앞에도 워크플로 전역(phase/log 등) 호출이 섞여 있다. 무해한 스텁으로 주입한다 —
// 선언부만 필요하므로 이들이 실제로 하는 일은 없어도 된다.
const GLOBALS = ['phase', 'log', 'agent', 'parallel', 'pipeline', 'workflow', 'budget', 'args']
let mod
try {
  const noop = () => undefined
  mod = new Function(...GLOBALS, `${src}\nreturn { brief, IDS, PDATA }`)(
    ...GLOBALS.map((g) => (g === 'budget' ? { total: null, spent: () => 0, remaining: () => 0 } : g === 'args' ? undefined : noop)),
  )
} catch (e) {
  console.error(`선언부 평가 실패: ${e.message}`)
  process.exit(1)
}

const { brief, IDS } = mod
if (typeof brief !== 'function' || !Array.isArray(IDS)) {
  console.error('brief/IDS 를 못 찾았다')
  process.exit(1)
}

if (id === '--ids') {
  process.stdout.write(IDS.join('\n') + '\n')
  process.exit(0)
}

if (!IDS.includes(id)) {
  console.error(`${id} 는 이 트랜치에 없다`)
  process.exit(1)
}

const out = brief(id)
process.stdout.write(Array.isArray(out) ? out.join('\n') : String(out))
