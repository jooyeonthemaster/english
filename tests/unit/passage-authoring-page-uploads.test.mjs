import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// ============================================================================
// AI 지문 생성 — 하이브리드 멀티모달(원본 페이지 함께 보내기) **배선** 계약.
//
// 왜 이 테스트가 있나:
//   이 기능은 서버 스키마·조달·화면 스위치가 전부 준비된 상태에서 **클라이언트
//   경계 한 곳**(payload 매핑) 때문에 통째로 죽어 있던 전력이 있다(authoring-types
//   :54-61 경위 주석). 그다음에는 티켓 발급 라우트 자체가 없어서 켜는 순간 실패
//   토스트가 떴다. 두 사고 모두 "타입은 맞는데 값이 도착하지 않는" 부류라
//   tsc 로는 절대 잡히지 않는다 — 경계마다 필드명·형식을 사실로 고정한다.
//
// 잠그는 사슬(끊기면 증상은 언제나 "켰는데 한 장도 안 실림"이다):
//   ① 클라 티켓 요청 본문  ↔ page-uploads 라우트 zod
//   ② 라우트 응답 필드명    ↔ 클라가 읽는 필드명
//   ③ 라우트가 만드는 경로  ↔ run-job.safeStoragePath 의 3가지 검사
//   ④ 4자리 0채움          ↔ run-job.listPageObjects 의 이름 오름차순 정렬
//   ⑤ 확장자               ↔ run-job.PAGE_IMAGE_EXT
//   ⑥ storagePath/sendPages/pageCount 가 서버 zod 를 **살아서** 통과
//   ⑦ 조달 결과            ↔ generate.ts 의 image 콘텐츠 파트
//
// 소스 스캔을 쓰는 이유: run-job/route 는 prisma·supabase 서비스 클라이언트를
// 최상단에서 끌어와 단위 테스트가 import 할 수 없다. 대신 **실제 소스의 리터럴**을
// 근거로 검사해 재구현 동어반복이 되지 않게 한다.
// ============================================================================

const harnessSource = `
import { readFileSync } from "node:fs";
import path from "node:path";

import schemaMod from "@/lib/passage-authoring/schema";
import promptsMod from "@/lib/passage-authoring/prompts";

const { authoringMaterialSchema, authoringRequestSchema } = schemaMod as any;
const { selectAuthoringMaterialsWithBudget } = promptsMod as any;

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed += 1;
  else failures.push(name);
}

const read = (...parts: string[]) =>
  readFileSync(path.join(process.cwd(), ...parts), "utf8").replace(/\\r\\n/g, "\\n");

const routeSrc = read("src", "app", "api", "workbench", "passage-authoring", "page-uploads", "route.ts");
const readersSrc = read("src", "lib", "passage-authoring", "material-readers.ts");
const runJobSrc = read("src", "lib", "passage-authoring", "run-job.ts");
// 조달은 26-08-04 에 run-job 밖으로 나왔다 — 두 레인(잡·생중계)이 공유하기 위해서다.
const pageImagesSrc = read("src", "lib", "passage-authoring", "page-images.ts");
const streamRouteSrc = read("src", "app", "api", "workbench", "passage-authoring", "stream", "route.ts");
const generateSrc = read("src", "lib", "passage-authoring", "generate.ts");
const storageSrc = read("src", "lib", "supabase-storage.ts");
const cleanupSrc = read("src", "trigger", "extraction-daily-cleanup.ts");
const storeSrc = read(
  "src", "app", "(director)", "director", "workbench", "generate", "intake", "authoring",
  "use-authoring-store.ts",
);
const draftsSrc = read(
  "src", "app", "(director)", "director", "workbench", "generate", "intake", "authoring",
  "use-material-drafts.ts",
);
const intakeSrc = read(
  "src", "app", "(director)", "director", "workbench", "generate", "intake", "authoring",
  "material-intake.ts",
);

// ── ① 티켓 요청 본문 ↔ 라우트 zod ─────────────────────────────────────────
// 라우트가 읽는 키와 클라가 싣는 키가 갈라지면 zod 가 400 을 내고, 사용자에게는
// "원본 페이지를 올리지 못했어요" 만 보인다(원인은 화면 어디에도 안 나온다).
check("라우트 zod 가 materialId 를 받는다", routeSrc.includes("materialId: z.string()"));
check("라우트 zod 의 pages 항목이 index 를 받는다", routeSrc.includes("index: z.number().int()"));
check("라우트 zod 의 pages 항목이 contentType 을 받는다", routeSrc.includes("contentType: z.enum("));
check("클라가 materialId 를 싣는다", readersSrc.includes("materialId: args.materialId"));
check("클라가 index 를 배열 위치로 싣는다", readersSrc.includes("pages.map((page, index) => ({"));
check("클라가 contentType 을 싣는다", readersSrc.includes("contentType: page.contentType"));

// 회귀 잠금: 예전에는 티켓 본문과 PUT 헤더가 둘 다 "image/jpeg" 로 못 박혀 있었다.
// preparePhotoBlob 은 작은 PNG·WebP 사진을 **원본 그대로** 돌려주므로, 그러면 PNG
// 바이트가 0000.jpg 로 저장되고 run-job 이 확장자만 보고 image/jpeg 라고 모델에
// 신고한다(라벨 위조). PDF 분기의 "image/jpeg" 는 사실이므로 금지 대상이 아니다 —
// splitPdfToImages 는 언제나 JPEG 로 굽는다. 옛 두 줄만 정확히 집어 막는다.
check(
  "티켓 본문이 페이지별 MIME 을 신고한다(옛 하드코딩 없음)",
  !readersSrc.includes('({ index, contentType: "image/jpeg" })'),
);
check(
  "PUT 헤더도 티켓에 신고한 값을 그대로 쓴다",
  readersSrc.includes('"content-type": page.contentType') &&
    !readersSrc.includes('"content-type": "image/jpeg", "x-upsert"'),
);

// ── ② 응답 필드명 ↔ 클라가 읽는 필드명 ────────────────────────────────────
check("라우트가 { prefix, targets } 를 돌려준다", routeSrc.includes("NextResponse.json({ prefix, targets })"));
check(
  "targets 항목이 index·uploadUrl·path 다",
  routeSrc.includes("{ index: page.index, uploadUrl: target.uploadUrl, path: target.uploadPath }"),
);
check("클라가 data.prefix 를 읽는다", readersSrc.includes("data.prefix"));
check("클라가 data.targets 를 읽는다", readersSrc.includes("data.targets"));
check("클라가 target.uploadUrl 로 PUT 한다", readersSrc.includes("fetch(target.uploadUrl"));
check(
  "클라가 prefix 를 storagePath 로 돌려준다",
  readersSrc.includes("storagePath: data.prefix"),
);

// ── ③ 라우트가 만드는 경로 ↔ safeStoragePath 의 3가지 검사 ────────────────
const prefixTemplate = routeSrc.split("const prefix = \`")[1]?.split("\`")[0] ?? "";
const pathTemplate = routeSrc.split("const path = \`")[1]?.split("\`")[0] ?? "";
check("라우트의 prefix 템플릿을 찾았다", prefixTemplate.length > 0);
check("라우트의 path 템플릿을 찾았다", pathTemplate.length > 0);
check("프리픽스는 academyId 로 시작한다", prefixTemplate.startsWith("\${staff.academyId}/"));
// 네임스페이스 칸은 **발급처와 청소처가 공유하는 상수**여야 한다. 리터럴을 양쪽에
// 손코딩하면 한쪽만 이름이 바뀌었을 때 업로드는 계속 성공하는데
// extraction-daily-cleanup §4 만 조용히 대상 0건이 되어 버킷이 영원히 자란다 —
// 사용자에게 아무 증상도 안 보이는 부류라 사람 눈으로는 절대 안 잡힌다.
check(
  "공유 상수의 값이 passage-authoring 이다",
  storageSrc.includes('export const PASSAGE_AUTHORING_PATH_SEGMENT = "passage-authoring";'),
);
check(
  "라우트가 그 상수를 import 한다",
  routeSrc.includes("PASSAGE_AUTHORING_PATH_SEGMENT") &&
    routeSrc.includes('from "@/lib/supabase-storage"'),
);
check(
  "프리픽스 네임스페이스가 리터럴이 아니라 공유 상수다",
  prefixTemplate.includes("\${PASSAGE_AUTHORING_PATH_SEGMENT}") &&
    !prefixTemplate.includes("/passage-authoring/"),
);
check(
  "청소도 같은 상수를 쓴다",
  cleanupSrc.includes("PASSAGE_AUTHORING_PATH_SEGMENT") &&
    !cleanupSrc.includes('"passage-authoring"'),
);
// 보안 계약: 경로에 사용자 입력(materialId)을 절대 끼우지 않는다.
check("경로에 materialId 가 들어가지 않는다", !prefixTemplate.includes("materialId") && !pathTemplate.includes("materialId"));
check("경로의 마지막 칸은 서버 UUID 다", prefixTemplate.includes("randomUUID()"));

// run-job 이 실제로 거는 검사 3종이 그대로 있는지.
check("safeStoragePath: academyId 프리픽스 검사", pageImagesSrc.includes("path.startsWith(\`\${academyId}/\`)"));
check("safeStoragePath: 상위 이동 차단", pageImagesSrc.includes('path.includes("..")'));
check("safeStoragePath: 길이 상한 500", pageImagesSrc.includes("path.length > 500"));

// 라우트가 발급하는 실제 경로가 그 3종을 통과하는가(형태 시뮬레이션).
const academyId = "acad_01HZX9QK";
const sampleUuid = "8f14e45f-ea1b-4f2b-9f0a-2b7d6a0c1e33";
const samplePrefix = academyId + "/passage-authoring/" + sampleUuid;
const sampleObject = samplePrefix + "/0000.jpg";
check("발급 프리픽스가 academyId/ 로 시작", samplePrefix.startsWith(academyId + "/"));
check("발급 경로에 .. 가 없다", !sampleObject.includes(".."));
check("발급 경로가 500자 상한 안", sampleObject.length <= 500);
// storagePath 는 프리픽스(확장자 없음)라 listPageObjects 가 list 분기로 간다.
check("storagePath 는 확장자가 없는 프리픽스다", !/\\.(jpe?g|png|webp)$/i.test(samplePrefix));

// academyId 가 비면 조용한 무동작이 되므로 라우트가 먼저 막는다.
check("빈 academyId 를 라우트가 거절한다", routeSrc.includes("if (!staff.academyId)"));

// ── ④ 4자리 0채움 ↔ 이름 오름차순 정렬 ────────────────────────────────────
check("라우트가 4자리 0채움을 쓴다", routeSrc.includes('padStart(4, "0")'));
check("조달이 이름 오름차순으로 정렬한다", pageImagesSrc.includes('sortBy: { column: "name", order: "asc" }'));

const padded: string[] = [];
for (let i = 0; i < 12; i += 1) padded.push(String(i).padStart(4, "0") + ".jpg");
const shuffled = [padded[3], padded[11], padded[0], padded[2], padded[10], padded[1]];
const sortedShuffle = [...shuffled].sort();
const expectedOrder = [padded[0], padded[1], padded[2], padded[3], padded[10], padded[11]];
check(
  "0채움 파일명은 이름 오름차순 = 쪽 순서",
  JSON.stringify(sortedShuffle) === JSON.stringify(expectedOrder),
);
// 음성 대조 — 왜 0채움이 계약인지를 고정한다(빼면 10쪽이 2쪽 앞으로 온다).
const unpadded = ["0.jpg", "1.jpg", "2.jpg", "10.jpg"].sort();
check(
  "0채움이 없으면 10 이 2 앞에 온다",
  unpadded.indexOf("10.jpg") < unpadded.indexOf("2.jpg"),
);

// ── ⑤ 확장자 ↔ PAGE_IMAGE_EXT ─────────────────────────────────────────────
check(
  "run-job 의 확장자 정규식이 그대로다",
  pageImagesSrc.includes("const PAGE_IMAGE_EXT = /\\\\.(jpe?g|png|webp)$/i;"),
);
const PAGE_IMAGE_EXT = /\\.(jpe?g|png|webp)$/i;
// 라우트가 실제로 발급할 수 있는 확장자 전부가 인식돼야 한다. 하나라도 빠지면
// list 단계에서 조용히 걸러져 "올렸는데 안 실린다"가 된다.
const routeExts = ["jpg", "png", "webp"];
let everyExtRecognised = true;
for (const ext of routeExts) {
  if (!routeSrc.includes('"' + ext + '"')) everyExtRecognised = false;
  if (!PAGE_IMAGE_EXT.test("0000." + ext)) everyExtRecognised = false;
}
check("라우트가 발급하는 확장자 3종을 run-job 이 전부 인식한다", everyExtRecognised);
check("클라 업로드 MIME 3종이 라우트 zod enum 과 같다", routeSrc.includes('z.enum(["image/jpeg", "image/png", "image/webp"])'));
check("클라가 MIME 을 3종으로 좁힌다", readersSrc.includes("function toPageUploadContentType"));

// ── 쪽 수 상한 (26-08-04 이후 **두 축**이다) ───────────────────────────────
// 예전 계약은 "세 파일이 같은 4"였다. 지금은 성격이 다른 두 상한으로 갈렸다:
//   · 업로드 상한(클라 = 라우트) — 모델 원가 0. 스토리지·렌더 시간만 든다. 20.
//   · 전송 상한(조달)            — 모델 입력 토큰 × 편수. 1편 20 / 2편 이상 4.
// 둘을 다시 한 값으로 합치면 반드시 한쪽이 틀린 이유로 묶인다(각 파일 주석 참조).
check("라우트 업로드 상한 20", routeSrc.includes("const MAX_PAGES = 20;"));
check("클라 업로드 상한 20", readersSrc.includes("export const MAX_SEND_PAGES = 20;"));
check("업로드 상한은 클라·라우트가 같은 값이다", routeSrc.includes("= 20;") && readersSrc.includes("MAX_SEND_PAGES = 20;"));
check("전송 상한 1편 20", pageImagesSrc.includes("export const MAX_PAGE_IMAGES_SINGLE = 20;"));
check("전송 상한 배치 4", pageImagesSrc.includes("export const MAX_PAGE_IMAGES_BATCH = 4;"));
check(
  "전송 상한은 편수로 갈린다",
  pageImagesSrc.includes("count <= 1 ? MAX_PAGE_IMAGES_SINGLE : MAX_PAGE_IMAGES_BATCH"),
);
// 두 호출부가 **반드시** 실제 편수를 넘겨야 한다 — 안 넘기면 배치가 20쪽을 싣고
// 입력 토큰이 5배가 된다(조용한 원가 사고라 화면에 아무 신호도 안 뜬다).
check("잡 레인이 편수를 넘긴다", runJobSrc.includes("count: request.count"));
check("스트림 레인이 편수를 넘긴다", streamRouteSrc.includes("count: request.count"));
check("zod index 상한이 MAX_PAGES-1 에 묶여 있다", routeSrc.includes("max(MAX_PAGES - 1)"));

// ── ⑥ 하이브리드 3필드가 서버 zod 를 살아서 통과한다 ──────────────────────
// 이 기능이 통째로 죽어 있던 원인이 바로 이 경계였다. 타입이 아니라 **값**으로 잠근다.
const storagePath = samplePrefix;
const material = authoringMaterialSchema.parse({
  id: "mat-1",
  role: "EXAM_SAMPLE",
  name: "기출.pdf",
  sourceKind: "FILE_PDF",
  content: "sample content",
  note: "",
  sendPages: true,
  pageCount: 4,
  storagePath,
});
check("서버 zod 가 sendPages 를 보존한다", material.sendPages === true);
check("서버 zod 가 pageCount 를 보존한다", material.pageCount === 4);
check("서버 zod 가 storagePath 를 보존한다", material.storagePath === storagePath);

const request = authoringRequestSchema.parse({
  materials: [
    {
      id: "mat-1",
      role: "EXAM_SAMPLE",
      name: "기출.pdf",
      sourceKind: "FILE_PDF",
      content: "sample content",
      sendPages: true,
      pageCount: 4,
      storagePath,
    },
  ],
  instruction: "표를 살려서 만들어 주세요",
  count: 1,
});
check("요청 스키마까지 sendPages 가 도달한다", request.materials[0].sendPages === true);
check("요청 스키마까지 storagePath 가 도달한다", request.materials[0].storagePath === storagePath);
// 안 보낸 자료가 켜지는 일은 없어야 한다(숨은 자동 결정 금지).
const bare = authoringMaterialSchema.parse({ id: "m2", role: "OTHER", content: "x" });
check("sendPages 기본값은 false", bare.sendPages === false);
check("storagePath 기본값은 없음", bare.storagePath === undefined);

// 클라 payload 매핑이 세 필드를 싣는가 — 여기가 비면 위 zod 는 영원히 기본값만 본다.
check(
  "스토어가 storagePath 없는 sendPages 를 켜지 않는다",
  storeSrc.includes("sendPages: Boolean(m.sendPages && m.storagePath)"),
);
check("스토어가 storagePath 를 싣는다", storeSrc.includes("m.storagePath ? { storagePath: m.storagePath }"));
check("스토어가 pageCount 를 싣는다", storeSrc.includes("pageCount: m.pageCount"));
// 업로드 성공 시에만 경로가 붙고, 실패하면 스위치를 되돌린다(거짓 스위치 금지).
check("업로드 성공이 storagePath 를 채운다", draftsSrc.includes("storagePath: upload.storagePath"));
// 업로드 실패 → 스위치를 되돌린다(거짓 스위치 금지). 한 줄 리터럴이 아니라
// uploadPages 구간 안에서 두 필드가 함께 꺼지는지를 본다 — 26-08-04 에 이 함수가
// ownsStatus 분기를 갖게 되면서 리터럴은 갈라졌지만 불변식은 그대로다.
const uploadPagesBlock = draftsSrc.slice(
  draftsSrc.indexOf("const uploadPages"),
  draftsSrc.indexOf("const patchMaterial"),
);
// ⚠️ 이 하네스는 **템플릿 리터럴 안**이라 정규식 리터럴을 쓰면 백슬래시가 먹힌다
//   (\\s → s). 문자열 검사만 쓸 것.
check(
  "업로드 실패가 스위치를 되돌린다",
  uploadPagesBlock.includes("sendPages: false") &&
    uploadPagesBlock.includes("storagePath: undefined"),
);

// ── ⑦ 조달 결과 ↔ generate.ts 의 image 콘텐츠 파트 ────────────────────────
check("조달은 sendPages 를 본다", pageImagesSrc.includes("if (!material.sendPages) continue;"));
check("조달은 storagePath 를 검증해서 쓴다", pageImagesSrc.includes("safeStoragePath(material.storagePath, academyId)"));
check("조달 결과가 생성 호출로 넘어간다", runJobSrc.includes("pageImages: paged.images"));
check("생성 호출이 image 파트를 만든다", generateSrc.includes('type: "image" as const'));
check("image 파트가 조달 바이트를 싣는다", generateSrc.includes("image: image.data"));
check("image 파트가 mediaType 을 싣는다", generateSrc.includes('mediaType: image.mediaType || "image/jpeg"'));
// 조달 실패가 생성을 죽이면 안 된다(계약 7) — 텍스트 판독본만으로도 만들어야 한다.
check("조달 실패는 삼킨다", runJobSrc.includes("page image procurement aborted"));

// ── ⑧ 생중계 레인도 이미지를 싣는다 (26-08-04) ────────────────────────────
// 예전에는 조달이 run-job 의 module-private 함수라 스트림 레인이 쓸 수 없었고,
// 그래서 그 레인은 "이미지가 있으면 나는 부적격"으로 스스로를 배제했다. 그 결과
// '원본 페이지도 함께 보냄'을 켜면 1편 발주가 조용히 실시간 미리보기를 잃었다.
// 아래 넷이 그 회귀의 재발을 막는다.
check("스트림 레인이 같은 조달 함수를 부른다", streamRouteSrc.includes("await procurePageImages({"));
check("스트림 레인이 이미지 파트를 만든다", streamRouteSrc.includes('type: "image_url" as const'));
check(
  "스트림 레인이 사고 강도에 이미지 장수를 넘긴다",
  streamRouteSrc.includes("imageCount: paged.images.length"),
);
check(
  "스트림 레인이 이미지를 이유로 스스로를 배제하지 않는다",
  !streamRouteSrc.includes("stream lane cannot carry page images"),
);
check(
  "클라 적격성도 sendPages 를 보지 않는다",
  !storeSrc.includes("materials.some((material) => material.sendPages)"),
);

// ── ⑨ 본문 없이 원본만 있는 자료가 살아서 프롬프트까지 간다 (26-08-04) ────
// 사진은 판독을 기다리지 않고 원본만으로 발주된다. 그 경로에서 어느 한 겹이라도
// "본문이 있어야 한다"로 남아 있으면 사진이 통째로 빠진 채 크레딧만 나간다.
const imageOnly = authoringRequestSchema.parse({
  materials: [
    {
      id: "img-1",
      role: "OTHER",
      name: "교재.jpg",
      sourceKind: "FILE_IMAGE",
      sendPages: true,
      storagePath: samplePrefix,
    },
  ],
  count: 1,
});
check("서버 zod 가 본문 없는 원본-only 자료를 받는다", imageOnly.materials.length === 1);
check(
  "예산 선별이 원본-only 자료를 떨구지 않는다",
  selectAuthoringMaterialsWithBudget(imageOnly.materials).length === 1,
);
check(
  "원본-only 자료는 글자 예산을 쓰지 않는다",
  selectAuthoringMaterialsWithBudget(imageOnly.materials)[0].sentChars === 0,
);
// 본문도 원본도 없는 자료는 여전히 막혀야 한다(빈 자료가 거짓 근거를 만든다).
let emptyRejected = false;
try {
  authoringRequestSchema.parse({
    materials: [{ id: "empty-1", role: "OTHER", name: "빈자료" }],
    count: 1,
  });
} catch {
  emptyRejected = true;
}
check("본문도 원본도 없는 자료는 거절된다", emptyRejected);

// ── ⑩ 사진은 OCR 콜을 돌지 않는다 (26-08-04) ──────────────────────────────
// 원본이 그대로 모델에 실리므로 판독은 같은 지면을 두 번 읽는 중복이다. 이 분기가
// 사라지면 사진 한 장마다 판독 콜이 조용히 되살아나 대기·원가가 함께 돌아온다.
check(
  "사진은 판독 큐에 들어가지 않는다",
  draftsSrc.includes('if (draft.sourceKind === "FILE_IMAGE") {') &&
    draftsSrc.includes("{ ownsStatus: true }"),
);
const retryBlock = draftsSrc.slice(draftsSrc.indexOf("const handleRetry"));
const retryImageBranch = retryBlock.indexOf('target.sourceKind === "FILE_IMAGE"');
const retryUploadCall = retryBlock.indexOf("uploadPages(");
const retryEnqueueCall = retryBlock.indexOf("enqueueRead([{ id, file: target.file }])");
check(
  "사진의 다시 시도는 재판독이 아니라 재업로드다",
  retryImageBranch >= 0 &&
    retryUploadCall > retryImageBranch &&
    (retryEnqueueCall < 0 || retryUploadCall < retryEnqueueCall),
);
// PDF 는 반대로 **반드시** 판독을 유지한다 — 원본은 앞 4쪽뿐이라 판독이 20쪽을
// 덮는 유일한 경로다. 사진과 같은 취급으로 묶으면 교재 뒷장이 조용히 사라진다.
check("사진 아닌 자료는 여전히 판독 큐로 간다", draftsSrc.includes("enqueueRead(toRead)"));
check(
  "사진은 원본을 항상 보낸다(지면 형태를 따지지 않는다)",
  intakeSrc.includes('if (input.sourceKind === "FILE_IMAGE") return true;'),
);

console.log(JSON.stringify({ passed, failures }));
`;

test("passage-authoring hybrid page-upload wiring contract", () => {
  const tmpDir = path.join(repoRoot, "tests", ".tmp-passage-authoring");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".page-uploads-harness.mts");
  let raw;
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } finally {
    rmSync(harnessPath, { force: true });
  }
  const lines = raw.trim().split(/\r?\n/);
  const result = JSON.parse(lines[lines.length - 1]);
  assert.deepEqual(result.failures, [], `실패한 검증: ${result.failures.join(", ")}`);
  assert.ok(result.passed > 40, `검증 수가 비정상적으로 적습니다: ${result.passed}`);
});
