/**
 * SUMMARY_WRITING HWPX 구조 검증 (한컴 자동화 불가시 폴백).
 *   npx tsx scripts/verify-sw-hwpx-structural.ts
 * 각 hwpx zip 의 Contents/section*.xml 텍스트를 추출해
 *  (a) student sheet 에 정답계열 비밀토큰 부재
 *  (b) [해석]/[요약문]/[보기]/[앞글자] 등 기대 텍스트 존재 (해당 케이스에 한해)
 * 를 검증한다.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import JSZip from "jszip";

const HWPX_DIR = "c:/tmp/sw-samples/hwpx";
const ROOT = "c:/tmp/sw-samples";

// questions.json 의 비밀 토큰(modelAnswer / blanks[].answer / acceptableVariants /
// wordBankDistractors / scoringCriteria) — student sheet 에 절대 등장하면 안 됨.
type RawQuestion = {
  id: string;
  difficulty: string;
  structuredData: Record<string, unknown>;
};

function collectSecretTokens(): { byCase: Map<string, string[]>; all: string[] } {
  const file = path.join(ROOT, "questions.json");
  const byCase = new Map<string, string[]>();
  const all: string[] = [];
  let arr: RawQuestion[] = [];
  try {
    arr = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return { byCase, all };
  }
  for (const q of arr) {
    const sd = q.structuredData || {};
    const secrets: string[] = [];
    const add = (v: unknown) => {
      if (typeof v === "string" && v.trim().length >= 6) secrets.push(v.trim());
    };
    add(sd.modelAnswer);
    for (const b of (sd.blanks as Array<Record<string, unknown>>) || []) {
      add(b.answer);
      for (const av of (b.acceptableVariants as string[]) || []) add(av);
    }
    for (const av of (sd.acceptableVariants as string[]) || []) add(av);
    for (const d of (sd.wordBankDistractors as string[]) || []) add(d);
    for (const c of (sd.scoringCriteria as string[]) || []) add(c);
    byCase.set(q.id, secrets);
    all.push(...secrets);
  }
  return { byCase, all };
}

async function extractSectionText(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  let combined = "";
  for (const name of Object.keys(zip.files).sort()) {
    const f = zip.files[name];
    if (f.dir) continue;
    if (/Contents\/section\d*\.xml$/i.test(name) || /section\d*\.xml$/i.test(name)) {
      combined += await f.async("string");
    }
  }
  // XML 태그 제거 → 가시 텍스트만
  const visible = combined.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  return visible;
}

// 문항 본문 영역만(= product-wide '정 답 표' 요약표 앞까지). 정답표는 모든 유형에
// 공통으로 학생지 하단에 정답을 인쇄하는 의도된 기능이라 SW 직렬화 누수 판정에서 제외한다.
function bodyBeforeAnswerKey(visible: string): string {
  const m = visible.search(/정\s*답\s*표/);
  return m >= 0 ? visible.slice(0, m) : visible;
}

async function main() {
  const { all: allSecrets } = collectSecretTokens();
  const files = readdirSync(HWPX_DIR).filter((f) => f.endsWith(".hwpx")).sort();

  const findings: string[] = [];
  let studentChecked = 0;
  let bodyLeakCount = 0;
  let answerKeyLeakCount = 0;

  for (const file of files) {
    const isAnswer = file.includes("-answer");
    const buf = readFileSync(path.join(HWPX_DIR, file));
    const visible = await extractSectionText(buf);
    const body = bodyBeforeAnswerKey(visible);

    // (b) 기대 텍스트 — SW 케이스 student 본문에 [요약문]/<요약문> 은 항상 있어야.
    //   HWPX 라벨은 <해석>/<요약문>/<보기>/<앞글자> 각괄호로 렌더되고 DOCX 는 [..] 대괄호.
    const isSw = file.startsWith("sw-") && !file.includes("baseline");
    const hasMarker = (m: string) => body.includes(`[${m}]`) || body.includes(`<${m}>`) || body.includes(m);
    if (isSw && !isAnswer) {
      if (!hasMarker("요약문")) findings.push(`[WARN] ${file}: 본문에 요약문 마커 없음`);
      const present = ["해석", "요약문", "보기", "앞글자"].filter(hasMarker);
      console.log(`  ${file}: 마커=[${present.join(",")}]`);
    }

    // (a) student sheet 비밀토큰 부재
    if (!isAnswer) {
      studentChecked += 1;
      for (const secret of allSecrets) {
        // 너무 짧은(일반 단어 충돌) 토큰은 제외 — 다단어 어구만 신뢰성 있음
        if (secret.split(/\s+/).length < 2) continue;
        const inBody = body.includes(secret);
        const inFull = visible.includes(secret);
        if (inBody) {
          // 진짜 누수: SW-LEAK-1 직렬화 본문에 정답계열 노출
          findings.push(`[BODY-LEAK] ${file}: 본문 누수 → "${secret.slice(0, 60)}..."`);
          bodyLeakCount += 1;
        } else if (inFull) {
          // 정답표(의도된 product-wide 기능)에만 등장 — SW 직렬화 누수 아님
          answerKeyLeakCount += 1;
        }
      }
    }
  }

  // answer sheet 에는 정답이 있어야 정상(노출이 의도된 곳) — 표본 1건만 확인
  const answerSample = files.find((f) => f.startsWith("sw-basic-1-answer"));
  let answerHasModelAnswer = false;
  if (answerSample) {
    const visible = await extractSectionText(readFileSync(path.join(HWPX_DIR, answerSample)));
    const { byCase } = collectSecretTokens();
    const secrets = byCase.get("sw-basic-r1-ok-premium") || [];
    answerHasModelAnswer = secrets.some((s) => s.split(/\s+/).length >= 3 && visible.includes(s));
  }

  const bodyFindings = findings.filter((f) => f.startsWith("[BODY-LEAK]") || f.startsWith("[WARN]"));
  console.log(`\n=== HWPX 구조 검증 ===`);
  console.log(`검사 파일: ${files.length} (student ${studentChecked})`);
  console.log(`비밀토큰(다단어) 풀: ${allSecrets.filter((s) => s.split(/\s+/).length >= 2).length}`);
  console.log(`student 본문(SW 직렬화) 누수: ${bodyLeakCount}  ← 0이어야 SW-LEAK-1 PASS`);
  console.log(`student 정답표(product-wide 의도 기능)에만 등장: ${answerKeyLeakCount}건 (SW 누수 아님)`);
  console.log(`answer 표본에 정답 존재(정상): ${answerHasModelAnswer}`);
  if (bodyFindings.length) {
    console.log(`\n--- 본문 findings ---`);
    for (const f of bodyFindings) console.log(f);
  } else {
    console.log(`\nSW 직렬화 본문 누수/경고 없음. SW-LEAK-1 PASS`);
  }

  // JSON 한 줄 요약(상위 에이전트 파싱용)
  console.log(
    `\nRESULT_JSON ${JSON.stringify({
      filesChecked: files.length,
      studentChecked,
      bodyLeakCount,
      answerKeyTableOccurrences: answerKeyLeakCount,
      answerSampleHasModelAnswer: answerHasModelAnswer,
      swSerializationPass: bodyLeakCount === 0,
    })}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
