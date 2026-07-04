import { readFileSync, writeFileSync } from "node:fs";

import { generateText } from "ai";

import { model } from "../src/lib/ai";

const PATH = "c:/Users/jooye/Desktop/2026project/nara/public/평택1618학원선생님_01085081434_20260529140405.m4a";
const OUT = "c:/tmp/call-transcript.txt";

(async () => {
  const data = readFileSync(PATH);
  console.log(`audio: ${(data.length / 1e6).toFixed(1)}MB`);
  const t = Date.now();
  try {
    const r = await generateText({
      model,
      maxOutputTokens: 16000,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `다음은 한국어 전화 통화 녹음입니다 (영어 학원 원장/선생님과의 통화, 지문 분석 보고서 관련).
정확하게 한국어로 전사(받아쓰기)해 주세요.
- 화자를 구분해 [화자A], [화자B] 처럼 표기 (가능하면 원장/선생님 추정)
- 들리는 내용을 빠짐없이, 구어체 그대로
- 중간중간 대략적인 흐름이 끊기지 않게`,
            },
            { type: "file", data, mediaType: "audio/mp4" },
          ],
        },
      ],
    });
    const ms = Date.now() - t;
    writeFileSync(OUT, r.text, "utf8");
    console.log(`OK in ${ms}ms, ${r.text.length}자, usage:`, r.usage);
    console.log("\n===== 전사 (앞 1500자 미리보기) =====\n");
    console.log(r.text.slice(0, 1500));
  } catch (e) {
    console.log(`FAIL in ${Date.now() - t}ms:`, String(e).slice(0, 800));
  }
})();
