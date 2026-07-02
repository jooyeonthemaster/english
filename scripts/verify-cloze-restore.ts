/**
 * 원문 생략 복원 가드 — 실전 학습지 어휘빈칸/어법선택 본문에서 빠진 원문 문장을 제자리에 복원하는지 검증.
 *   npx tsx scripts/verify-cloze-restore.ts
 *
 * 불변식:
 *  - 누락이 없으면 입력을 한 글자도 바꾸지 않는다(무회귀).
 *  - 누락된 원문 문장은 '원문 그대로' 본문에 다시 나타난다(원문 생략 0).
 *  - AI 가 넣은 빈칸/선택지는 보존된다(절대 버리지 않음).
 */
import {
  restoreClozePassageOriginal,
  clozePassageCoverageIssues,
} from "@/lib/passage-report/analysis-report/worksheet-surface";

const S1 = "Within liberal culture, the value of fairness outweighs the preservation of family integrity.";
const S2 = "In contrast, Confucian cultures believe that the family assumes a fundamental role in human flourishing.";
const S3 = "Therefore, some societies may choose to impose restrictions on individual rights and freedoms.";
const ORIG = [S1, S2, S3];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
let fail = 0;
const log = (ok: boolean, msg: string) => { if (!ok) { fail++; console.log("  ✗ " + msg); } };
const has = (hay: string, needle: string) => norm(hay).includes(norm(needle));

// 1) 누락 0 → 입력 그대로(무회귀)
{
  const ai =
    "Within liberal (1) __________, the value of fairness outweighs the preservation of family integrity. " +
    "In contrast, Confucian cultures believe that the family assumes a fundamental (2) __________ in human flourishing. " +
    "Therefore, some societies may choose to impose (3) __________ on individual rights and freedoms.";
  const out = restoreClozePassageOriginal(ai, ORIG);
  log(out === ai, `[누락0] 무회귀 위반 — 입력과 달라짐:\n    in : ${ai}\n    out: ${out}`);
  log(clozePassageCoverageIssues("vocab", ai, ORIG).length === 0, "[누락0] 검증기가 거짓양성(누락 없음을 누락으로 보고)");
}

// 2) 중간 문장(S2) 누락 → 제자리(S1 뒤, S3 앞)에 원문 복원
{
  const ai =
    "Within liberal (1) __________, the value of fairness outweighs the preservation of family integrity. " +
    "Therefore, some societies may choose to impose (2) __________ on individual rights and freedoms.";
  const out = restoreClozePassageOriginal(ai, ORIG);
  log(has(out, S2), "[중간누락] S2 원문이 복원되지 않음(원문 생략)");
  log(has(out, "(1) __________") && has(out, "(2) __________"), "[중간누락] AI 빈칸이 보존되지 않음");
  const iS1 = norm(out).indexOf(norm("Within liberal"));
  const iS2 = norm(out).indexOf(norm("In contrast, Confucian cultures"));
  const iS3 = norm(out).indexOf(norm("Therefore, some societies"));
  log(iS1 >= 0 && iS2 > iS1 && iS3 > iS2, `[중간누락] 복원 위치가 어긋남 (S1=${iS1}, S2=${iS2}, S3=${iS3})`);
  log(clozePassageCoverageIssues("vocab", ai, ORIG).length === 1, "[중간누락] 검증기가 누락을 못 잡음");
}

// 3) 첫 문장(S1) 누락 → 맨 앞에 원문 복원
{
  const ai =
    "In contrast, Confucian cultures believe that the family assumes a fundamental (1) __________ in human flourishing. " +
    "Therefore, some societies may choose to impose (2) __________ on individual rights and freedoms.";
  const out = restoreClozePassageOriginal(ai, ORIG);
  log(has(out, S1), "[첫문장누락] S1 원문이 복원되지 않음");
  const iS1 = norm(out).indexOf(norm("Within liberal culture"));
  const iS2 = norm(out).indexOf(norm("In contrast, Confucian"));
  log(iS1 >= 0 && iS1 < iS2, "[첫문장누락] S1 이 맨 앞에 복원되지 않음");
}

// 4) 어법 선택 본문([A / B] 옵션)도 동일하게 복원 — 옵션은 매칭에서 무시
{
  const ai =
    "Within liberal culture, the value of fairness [outweighs / outweigh] the preservation of family integrity. " +
    "Therefore, some societies may [choose / chooses] to impose restrictions on individual rights and freedoms.";
  const out = restoreClozePassageOriginal(ai, ORIG);
  log(has(out, "In contrast, Confucian cultures believe"), "[어법선택] 누락된 S2 가 복원되지 않음");
  log(out.includes("[outweighs / outweigh]") && out.includes("[choose / chooses]"), "[어법선택] AI 선택지가 보존되지 않음");
}

// 5) 빈 입력/원문 없음 → 안전
{
  log(restoreClozePassageOriginal("", ORIG) === "", "[엣지] 빈 본문 비안전");
  log(restoreClozePassageOriginal("Some text.", []) === "Some text.", "[엣지] 원문 없음일 때 본문 변형");
}

// 6) 심한 바꿔쓰기여도 누락이 아니면(토큰 충분히 겹침) 유지 — 복원이 함부로 끼지 않음
{
  const ai =
    "Within liberal culture, the value of fairness outweighs the preservation of family integrity. " +
    "In contrast, Confucian cultures believe that the family assumes a fundamental role in human flourishing. " +
    "Therefore, some societies may choose to impose restrictions on individual rights and freedoms.";
  const out = restoreClozePassageOriginal(ai, ORIG);
  log(out === ai, "[무회귀2] 빈칸 없는 완전한 원문 재현을 건드림");
}

// 7) AI가 두 원문을 한 문장으로 합침(and/세미콜론) — 거짓양성 누락→중복주입 금지 (전역 토큰 검출)
{
  const orig = [
    "The scientist observed the rare bird carefully.",
    "She recorded every detail in her notebook.",
  ];
  const aiMerged =
    "The scientist observed the rare (1) __________ carefully, and she recorded every detail in her notebook.";
  const out = restoreClozePassageOriginal(aiMerged, orig);
  log(out === aiMerged, `[병합] 합쳐진 문장을 누락으로 오판해 중복 주입함:\n    out: ${out}`);
  log((norm(out).match(/recordedeverydetail/g) ?? []).length === 1, "[병합] 문장이 중복 복제됨");
  log(clozePassageCoverageIssues("vocab", aiMerged, orig).length === 0, "[병합] 검증기 거짓양성");
}

// 8) 숫자/소문자로 시작하는 문장 — 분할 실패로 인한 거짓양성 누락 금지
{
  const orig = ["The temperature rose sharply.", "5 degrees were lost overnight."];
  const ai = "The (1) __________ rose sharply. 5 degrees were lost overnight.";
  const out = restoreClozePassageOriginal(ai, orig);
  log(out === ai, `[숫자시작] 무회귀 위반(중복 주입):\n    out: ${out}`);
  log(clozePassageCoverageIssues("vocab", ai, orig).length === 0, "[숫자시작] 검증기 거짓양성(수렴 실패)");

  const orig2 = ["Researchers studied the migration of arctic terns.", "iPhones changed how people communicate daily."];
  const ai2 = "Researchers studied the (1) __________ of arctic terns. iPhones changed how people communicate daily.";
  const out2 = restoreClozePassageOriginal(ai2, orig2);
  log(out2 === ai2, `[소문자시작] 무회귀 위반(중복 주입):\n    out: ${out2}`);
}

// 9) 숫자시작 문장이 '진짜' 누락된 경우 — 정확히 복원
{
  const orig = ["The temperature rose sharply.", "5 degrees were lost overnight."];
  const ai = "The (1) __________ rose sharply.";
  const out = restoreClozePassageOriginal(ai, orig);
  log(has(out, "5 degrees were lost overnight"), "[숫자시작-실제누락] 누락 문장 미복원");
  log(clozePassageCoverageIssues("vocab", ai, orig).length === 1, "[숫자시작-실제누락] 검증기가 못 잡음");
}

// 10) 보일러플레이트(근접 유사 병렬 문장) — 본문에 '존재하는' 문장은 절대 중복 복제되지 않는다(가산 전용)
{
  const orig = [
    "The annual report covered the financial results clearly.",
    "The annual report covered the marketing results clearly.",
    "The annual report covered the safety results clearly.",
  ];
  // financial·safety 는 본문에 있고 marketing 만 빠진 상태 (report 는 둘째 문장에 평문으로 존재)
  const ai =
    "The annual (1) __________ covered the financial results clearly. The annual report covered the safety results clearly.";
  const out = restoreClozePassageOriginal(ai, orig);
  log((norm(out).match(/coveredthefinancialresults/g) ?? []).length === 1, "[보일러플레이트] 존재 문장(financial)이 중복 복제됨");
  log((norm(out).match(/coveredthesafetyresults/g) ?? []).length === 1, "[보일러플레이트] 존재 문장(safety)이 중복 복제됨");
  // 핵심 보장: 부패(중복)는 절대 없어야 한다. (marketing 검출 여부는 근접중복이라 보장하지 않음)
}

// 11) 서로 다른 내용어를 가진 '실제' 지문에서 중간 문장 누락 — 정확히 1회 복원 + 검증기 검출
{
  const orig = [
    "Photosynthesis converts sunlight into chemical energy within plant cells.",
    "Respiration then releases that stored energy to power cellular activity.",
    "Together these processes sustain the carbon cycle across ecosystems.",
  ];
  const ai =
    "Photosynthesis converts sunlight into chemical (1) __________ within plant cells. Together these processes sustain the carbon (2) __________ across ecosystems.";
  const out = restoreClozePassageOriginal(ai, orig);
  log(has(out, "Respiration then releases that stored energy"), "[실지문중간누락] 누락 문장 미복원");
  log((norm(out).match(/respirationthenreleases/g) ?? []).length === 1, "[실지문중간누락] 복원 문장 중복");
  log(clozePassageCoverageIssues("vocab", ai, orig).length === 1, "[실지문중간누락] 검증기 미검출");
}

if (fail === 0) console.log("\n✅ ALL PASS — 원문 생략 복원: 무회귀 · 중간/첫문장 복원 · 빈칸/선택지 보존 · 병합/숫자시작 거짓양성0 · 보일러플레이트 중복0 · 검증기 정확");
else { console.log(`\n❌ ${fail} 건 실패`); process.exit(1); }
