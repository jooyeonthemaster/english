/* eslint-disable no-console */
import { config } from "dotenv";
import { resolve } from "path";
import { writeFileSync } from "fs";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { streamText } from "ai";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const VISUAL_SYSTEM_PROMPT = [
  "You are a Korean English-learning tutor generating a single SVG diagram.",
  "Respond with ONE fenced code block: triple backtick + svg, then a single complete <svg>…</svg>, then triple backtick. Do not add any prose, headers, captions, or additional code blocks before or after the svg block. Output nothing else.",
  "",
  "DIAGRAM DESIGN SYSTEM (strict):",
  "- viewBox: '0 0 880 560'. width='100%' height='100%' preserveAspectRatio='xMidYMid meet'. Always include xmlns='http://www.w3.org/2000/svg' and a descriptive role='img' with <title> and <desc>.",
  "- Background: solid #FFFFFF rect spanning the full viewBox.",
  "- Inner safe area: leave 40px padding on every side. Use an 8px grid; align every shape to the grid.",
  "- Key color palette ONLY (no other colors):",
  "  primary #2563EB, primary-strong #1D4ED8, primary-soft #DBEAFE, accent #60A5FA,",
  "  ink-strong #0F172A, ink #334155, ink-muted #64748B, line #E2E8F0, surface-muted #F8FAFC, success #047857 (sparingly), danger #B91C1C (sparingly).",
  "- Typography: font-family='Pretendard, \"Noto Sans KR\", system-ui, sans-serif'. Title 22px weight 800 #0F172A. Section labels 13px weight 700 letter-spacing 0.04em uppercase #2563EB. Body labels 14px weight 600 #334155. Captions 12px weight 500 #64748B. Always use text-anchor explicitly and dominant-baseline='middle' or 'hanging' to align text precisely.",
  "- Layout: one clear focal hierarchy (title row → diagram body → optional legend/footer). Generous whitespace. Group related nodes with subtle rounded rects (rx=14) using fill='#F8FAFC' stroke='#E2E8F0' stroke-width='1'. Primary nodes use fill='#FFFFFF' stroke='#2563EB' stroke-width='1.5' with rx=12. Highlight nodes use fill='#DBEAFE' stroke='#2563EB'.",
  "- Connectors: straight or orthogonal polylines with stroke='#94A3B8' stroke-width='1.5' and arrow markers. Define a single <defs> arrow marker (id='arrow', viewBox='0 0 10 10', refX=9, refY=5, markerWidth=8, markerHeight=8, orient='auto-start-reverse') with fill='#94A3B8'. Avoid overlapping lines.",
  "- Do not use gradients, shadows, filters, scripts, external images, animations, or interactive handlers. Pure static vector only.",
  "- Korean labels for all human-readable text. Truncate long phrases to fit; never let text overflow node boundaries.",
  "- Balance composition: distribute weight visually; align nodes on shared axes; consistent gaps (multiples of 16px) between sibling nodes.",
  "",
  "CONTENT GUIDANCE:",
  "- Decide the most useful structure for the question (flow, hierarchy, comparison, mapping, timeline, matrix). Pick ONE structure.",
  "- Ground every node strictly in the provided passage analysis. Do not invent facts.",
  "- Include a concise diagram <title> (used as the artifact card title in the UI).",
].join("\n");

const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const modelName = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";
if (!apiKey) {
  console.error("Missing API key");
  process.exit(1);
}

const provider = createGoogleGenerativeAI({ apiKey });

async function main() {
  const start = Date.now();
  const result = streamText({
    model: provider(modelName),
    maxOutputTokens: 12288,
    temperature: 0.15,
    providerOptions: { google: { thinkingConfig: { thinkingBudget: 256 } } },
    system: VISUAL_SYSTEM_PROMPT,
    prompt: JSON.stringify({
      passage: {
        title: "Urban Farming Revolution",
        contentPreview:
          "In cities around the world, a quiet revolution is taking place on rooftops and in abandoned buildings. Urban farming has grown rapidly as people seek fresh, locally grown food. Unlike traditional agriculture, urban farms use innovative techniques such as vertical farming and hydroponics to grow crops in limited spaces. These methods use significantly less water and no soil at all. Beyond providing food, urban farms create green spaces that reduce air pollution and lower temperatures in crowded neighborhoods. Community gardens also bring people together, fostering social connections in areas where neighbors rarely interact.",
      },
      analysis: { structure: { mainIdea: "도시 농업의 부상과 효과", purpose: "정보 전달" } },
      studentQuestion: "이 지문의 핵심 흐름을 시각화 해줘",
    }),
  });

  let firstTokenAt: number | null = null;
  let full = "";
  for await (const chunk of result.textStream) {
    if (firstTokenAt === null) firstTokenAt = Date.now();
    full += chunk;
  }
  const endAt = Date.now();

  console.log(`TTFT: ${firstTokenAt ? firstTokenAt - start : -1} ms`);
  console.log(`Total: ${endAt - start} ms`);
  console.log(`Length: ${full.length} chars`);

  const svgMatch = full.match(/<svg[\s\S]*?<\/svg>/);
  if (!svgMatch) {
    console.log("\n--- RAW OUTPUT ---");
    console.log(full);
    process.exit(2);
  }
  const svg = svgMatch[0];
  console.log(`SVG length: ${svg.length} chars`);
  writeFileSync("scripts/output-test.svg", svg, "utf-8");
  console.log("Wrote scripts/output-test.svg");

  // Quality checks
  const hasViewBox = /viewBox="0 0 880 560"/.test(svg);
  const hasTitle = /<title>/.test(svg);
  const hasDesc = /<desc>/.test(svg);
  const hasBackground = /rect[^/]*fill="#FFFFFF"/i.test(svg) || /rect[^/]*fill="white"/i.test(svg);
  const usesPalette = /#2563EB|#1D4ED8|#DBEAFE|#60A5FA/.test(svg);
  const noForbidden = !/<script|onclick|onload|foreignObject|filter|<animate/i.test(svg);

  console.log("\n--- QUALITY CHECKS ---");
  console.log(`viewBox 0 0 880 560: ${hasViewBox ? "OK" : "MISS"}`);
  console.log(`<title>: ${hasTitle ? "OK" : "MISS"}`);
  console.log(`<desc>: ${hasDesc ? "OK" : "MISS"}`);
  console.log(`white background rect: ${hasBackground ? "OK" : "MISS"}`);
  console.log(`uses key palette: ${usesPalette ? "OK" : "MISS"}`);
  console.log(`no forbidden tags: ${noForbidden ? "OK" : "FAIL"}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
