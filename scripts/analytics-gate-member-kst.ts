/**
 * 게이트 — 관리자 「회원」 화면 날짜·시각 표시가 서버 시간대와 무관하게 KST 인가.
 *   TZ=UTC npx tsx scripts/analytics-gate-member-kst.ts
 * 종료 코드 0 = 전건 통과, 1 = 실패 있음, 2 = 케이스 0건(계기 고장).
 *
 * 왜 TZ=UTC 로 돌려야 하는가: 개발 머신은 KST 라 timeZone 을 빠뜨린 포매터도
 * 로컬에서는 100% 통과한다. 프로덕션(Vercel)만 UTC 라 가입일·결제일이 하루
 * 이르게 렌더된다 — 이 축은 TZ 를 바꿔야만 드러난다. 스펙 I1.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  formatKstDate,
  formatKstDateTime,
  formatKstDateTimeShort,
} from "../src/lib/admin-kst-format";
import { formatDate as listFormatDate } from "../src/components/admin/members-list-client/formatters";

let pass = 0;
let fail = 0;
function eq(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`);
  }
}

// ── 0. 계기 자체 점검 — UTC 가 아니면 이 게이트는 아무것도 증명하지 못한다 ──
const offsetMin = new Date().getTimezoneOffset();
if (offsetMin !== 0) {
  console.log(
    `SKIP-FAIL 이 게이트는 TZ=UTC 로 실행해야 한다 (현재 오프셋 ${-offsetMin}분).\n` +
      `  실행: TZ=UTC npx tsx scripts/analytics-gate-member-kst.ts`,
  );
  process.exit(2);
}

// ── 1. 경계값 — UTC 15:00 이후는 KST 로 이미 다음 날이다 ──
// PH 입시영어학원 원장 가입 실측값(2026-07-07T23:41:05.939Z) → KST 2026-07-08 08:41
const phSignup = "2026-07-07T23:41:05.939Z";
eq("원장 가입일(날짜)", formatKstDate(phSignup), "2026. 07. 08.");
eq("원장 가입일(날짜+시각)", formatKstDateTime(phSignup), "2026. 07. 08. 08:41");
eq("거래 이력(두 자리 연도)", formatKstDateTimeShort(phSignup), "26. 07. 08. 08:41");
// PH 무통장 결제 실측값(2026-08-16T15:32:00Z) → KST 2026-08-17 00:32
eq("구입 이력 결제일", formatKstDate("2026-08-16T15:32:00.000Z"), "2026. 08. 17.");
// 정확히 15:00Z = KST 자정
eq("KST 자정 경계", formatKstDate("2026-09-17T15:00:00.000Z"), "2026. 09. 18.");
eq("KST 자정 직전", formatKstDate("2026-09-17T14:59:59.999Z"), "2026. 09. 17.");
// 목록 포매터도 같은 값을 내는가(회원 목록 · CSV 와 화면이 갈리면 안 된다)
eq("회원 목록 포매터", listFormatDate(new Date(phSignup)), "2026. 07. 08.");
eq("빈 값", formatKstDate(null), "—");
eq("잘못된 값", formatKstDateTime("not-a-date"), "—");

// ── 2. 회귀 방지 — 표시 파일에 timeZone 없는 toLocale* 가 다시 생기지 않는가 ──
// (포매터를 파일마다 새로 만들면 위 1번은 통과하면서 화면만 조용히 틀어진다)
const GUARDED = [
  "src/components/admin/members-list-client/formatters.ts",
  "src/components/admin/member-detail/member-block.tsx",
  "src/components/admin/member-detail/purchases-section.tsx",
  "src/components/admin/member-detail/transaction-table.tsx",
  "src/components/admin/member-detail/acquisition-card.tsx",
  "src/components/admin/member-detail-client.tsx",
];
// 숫자 포맷(1,234)도 같은 메서드명을 쓰므로, 날짜 옵션이 붙은 호출만 가려낸다.
const CALL = /\.toLocale(Date|Time|)String\s*\(/g;
const NL = String.fromCharCode(10);
const DATE_OPT = /(year|month|day|weekday|hour|minute|second|dateStyle|timeStyle)/;
for (const rel of GUARDED) {
  const src = readFileSync(path.join(process.cwd(), rel), "utf8");
  const offenders: string[] = [];
  let m: RegExpExecArray | null;
  CALL.lastIndex = 0;
  while ((m = CALL.exec(src)) !== null) {
    // 인자 범위를 괄호 균형으로 정확히 잘라낸다.
    let depth = 0;
    let end = m.index + m[0].length;
    for (let i = m.index + m[0].length - 1; i < src.length; i += 1) {
      if (src[i] === "(") depth += 1;
      else if (src[i] === ")") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const args = src.slice(m.index + m[0].length, end);
    const isDateCall = m[1] !== "" || DATE_OPT.test(args);
    if (isDateCall && !/timeZone/.test(args)) {
      offenders.push(String(src.slice(0, m.index).split(NL).length));
    }
  }
  eq(`timeZone 없는 날짜 toLocale* 없음 · ${rel}`, offenders, []);
}

const total = pass + fail;
console.log(`\nanalytics-gate-member-kst: ${pass}/${total} pass`);
if (total === 0) process.exit(2);
process.exit(fail ? 1 : 0);
