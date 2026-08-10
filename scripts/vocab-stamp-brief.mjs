// 산출물에 **어느 브리프로 뽑혔는지** 찍는다.
//
// 왜: 오늘 브리프 개정(§2.6) 효과를 재려다 두 번 틀렸다. 산출물이 자기 출처를 안 들고 있어서
//     **파일 mtime 으로 추정**해야 했고, 균등 분위·"최근 N시간" 구간이 개정 경계를 가로질러
//     효과가 희석돼 "개정이 무력하다"고 읽혔다(SPEC §12.4). 그리고 수리 대상을 정할 때도
//     같은 이유로 낡은 목록을 재사용해 결함 435건 중 33건만 잡았다(§12.5).
//     `specVersion` 이 이미 있었지만 3,533건 전부 `"v3"` 상수라 출처 정보가 0이었다.
//
// 설계 — **에이전트에게 시키지 않는다.** 스크립트가 자기 브리프의 해시를 알고 있으므로
//   산출 직후 결정론적으로 찍는다. 토큰 0, 오기 0, 에이전트가 잊을 여지 0.
//   entries 는 건드리지 않는다(게이트의 UNKNOWN_KEY 는 entries 에만 걸린다 — verify:371).
//
//   node scripts/vocab-stamp-brief.mjs <파일> <브리프해시> <브리프라벨> <ISO시각>
import fs from 'fs'

const [file, hash, label, at] = process.argv.slice(2)
if (!file || !hash) { console.error('usage: vocab-stamp-brief.mjs <file> <hash> <label> <iso>'); process.exit(2) }
if (!fs.existsSync(file)) process.exit(0)          // 산출 실패면 조용히 넘어간다(호출자가 판정한다)

let d
try { d = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { process.exit(0) }  // 깨진 산출은 게이트가 잡는다
if (!d || typeof d !== 'object' || Array.isArray(d)) process.exit(0)

d.briefHash = hash
if (label) d.briefLabel = label
if (at) d.extractedAt = at
fs.writeFileSync(file, JSON.stringify(d, null, 2))
