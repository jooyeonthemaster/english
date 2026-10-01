// exam-forecast PDF → Supabase 비공개 버킷 `exam-forecast/<slug>/<file>.pdf`.
//
//   node scripts/exam-forecast/upload-pdfs.mjs <slug> <pdf-dir>
//
// 내려받기는 /api/exam-forecast/[slug]/pdf?file=… (원장 세션 확인 후 60초 서명 URL).
// 키: .env.local 의 SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY (값은 출력하지 않는다).
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const [, , slug, dir] = process.argv;
if (!slug || !dir) {
  console.error("usage: upload-pdfs.mjs <slug> <pdf-dir>");
  process.exit(2);
}
const env = Object.fromEntries(
  fs
    .readFileSync(path.resolve(".env.local"), "utf8")
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].trim().replace(/^"|"$/g, "")]),
);
const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 .env.local 에 없다");
const sb = createClient(url, key, { auth: { persistSession: false } });
const BUCKET = "exam-forecast";

const { data: buckets } = await sb.storage.listBuckets();
if (!buckets?.some((b) => b.name === BUCKET)) {
  const { error } = await sb.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 50 * 1024 * 1024, allowedMimeTypes: ["application/pdf"] });
  if (error) throw error;
  console.log("bucket created (private)");
}
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".pdf"));
let ok = 0;
for (const f of files) {
  const body = fs.readFileSync(path.join(dir, f));
  const { error } = await sb.storage.from(BUCKET).upload(`${slug}/${f}`, body, { contentType: "application/pdf", upsert: true, cacheControl: "300" });
  if (error) console.error("FAIL", f, error.message);
  else {
    ok += 1;
    console.log("ok", f, `${(body.length / 1024).toFixed(0)}KB`);
  }
}
console.log(`uploaded ${ok}/${files.length}`);
