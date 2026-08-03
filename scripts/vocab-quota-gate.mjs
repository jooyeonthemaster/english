// 무인 하네스의 쿼터 게이트 — 지금 돌려도 되는지, 안 되면 몇 초 자야 하는지를 한 줄로 답한다.
//
// 왜: 계정 5개를 clauth 가 자동 전환하지만, **전부 소진되면 전환할 곳이 없다.** 그때 무작정
//     재시도하면 실패만 쌓이므로, clauth 가 이미 알고 있는 각 창의 리셋 시각을 읽어
//     가장 이른 리셋까지 자게 한다.
//
// 출력(한 줄):
//   GO <profile> <5h%> <7d%>        — 쓸 수 있는 계정이 있다
//   WAIT <초> <사유>                 — 전부 소진. 그 초만큼 자고 다시 물어라
//   ERR <사유>                       — 판단 불가(데몬 미가동 등). 호출자가 보수적으로 대기한다
import { execSync } from 'child_process'

const CLAUTH = process.env.CLAUTH ?? `${process.env.USERPROFILE}\\.local\\bin\\clauth.exe`
const H5 = Number(process.env.GATE_5H ?? 95) // clauth 의 fallback_threshold 와 같은 값
const D7 = Number(process.env.GATE_7D ?? 98) // clauth 의 weekly 기준과 같은 값
const PAD = Number(process.env.GATE_PAD ?? 180) // 리셋 직후 경계에서 다시 튕기지 않도록 여유

let snap
try {
  snap = JSON.parse(execSync(`"${CLAUTH}" status --json`, { encoding: 'utf8', maxBuffer: 1 << 24 }))
} catch (e) {
  console.log(`ERR clauth-status-실패:${String(e.message).slice(0, 60)}`)
  process.exit(0)
}

const now = Date.now()
const pct = (p, label) => p.windows?.find((w) => w.label === label)?.utilization_pct ?? 0
const resetAt = (p, label) => {
  const t = p.windows?.find((w) => w.label === label)?.resets_at
  const ms = t ? Date.parse(t) : NaN
  return Number.isFinite(ms) ? ms : null
}

// 레인 모드 — 지금 쓸 수 있는 계정 이름을 여유가 큰 순서로 한 줄씩 낸다.
// 무인 하네스는 계정마다 자기 config 디렉터리(레인)를 쓰므로, 이 목록이 곧 동시 레인 수다.
const LANE_MODE = process.argv.includes('--lanes')
// 대화형 세션이 ~/.claude 에서 쓰는 계정은 레인에서 뺀다 — 같은 계정을 두 파일로 쓰면
// 리프레시 토큰 회전이 다시 충돌한다(2026-08-03 사고).
const RESERVED = (process.env.LANE_RESERVED ?? snap.active_profile ?? '').split(',').filter(Boolean)

const live = (snap.profiles ?? []).filter((p) => p.auth_status === 'ok' && !p.disabled)
if (!live.length) {
  console.log('ERR 사용가능한-프로필-없음')
  process.exit(0)
}

// 아직 한 번도 폴링 안 된 계정은 "모른다" — 낙관적으로 쓸 수 있다고 본다(실제로 막히면 재시도 로직이 잡는다).
const usable = live
  .filter((p) => !RESERVED.includes(p.name))
  .filter((p) => !p.windows?.length || (pct(p, '5h') < H5 && pct(p, '7d') < D7))

if (LANE_MODE) {
  // 여유가 큰 순(5h 낮은 순)으로. 없으면 아무것도 안 찍는다 — 호출자가 대기 판단을 한다.
  for (const p of usable.sort((a, b) => pct(a, '5h') - pct(b, '5h'))) console.log(p.name)
  if (!usable.length) {
    const cands = live
      .filter((p) => !RESERVED.includes(p.name))
      .map((p) => (pct(p, '7d') >= D7 ? resetAt(p, '7d') : resetAt(p, '5h')))
      .filter((t) => t && t > now)
      .sort((a, b) => a - b)
    const secs = cands.length ? Math.max(60, Math.ceil((cands[0] - now) / 1000) + PAD) : 900
    console.error(`WAIT ${secs}`)
    process.exit(3) // 3 = 대기 필요. stderr 의 초를 쓰라는 신호.
  }
  process.exit(0)
}

if (usable.length) {
  const best = usable.sort((a, b) => pct(a, '5h') - pct(b, '5h'))[0]
  console.log(`GO ${best.name} ${pct(best, '5h')} ${pct(best, '7d')}`)
  process.exit(0)
}

// 전부 소진 — 각 계정이 "다시 쓸 수 있게 되는" 가장 이른 시각을 구한다.
// 5h 가 막은 계정은 5h 리셋에, 7d 가 막은 계정은 7d 리셋에 풀린다.
const candidates = []
for (const p of live) {
  const blocked7d = pct(p, '7d') >= D7
  const t = blocked7d ? resetAt(p, '7d') : resetAt(p, '5h')
  if (t && t > now) candidates.push({ name: p.name, t, why: blocked7d ? '7d' : '5h' })
}

if (!candidates.length) {
  // 리셋 시각을 아무도 안 알려줬다(창이 아예 안 열린 상태 등). 짧게 자고 다시 본다.
  console.log('WAIT 900 리셋시각-미상')
  process.exit(0)
}

candidates.sort((a, b) => a.t - b.t)
const first = candidates[0]
const secs = Math.max(60, Math.ceil((first.t - now) / 1000) + PAD)
console.log(`WAIT ${secs} ${first.name}의-${first.why}창-리셋대기`)
