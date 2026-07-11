import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import passagesJson from "../src/data/exam-passages/passages.json";
import type { ExamPassage } from "../src/lib/exam-passages/types";
import {
  buildExamPassageWebtoonPrompt,
  examPassageContentHash,
  EXAM_PASSAGE_WEBTOON_STYLE,
} from "../src/lib/exam-passages/webtoon-assets";
import { reviewExamPassageWebtoonImage } from "../src/lib/exam-passages/webtoon-review";
import { prisma } from "../src/lib/prisma";
import {
  deleteWebtoonImage,
  uploadImageBufferToExamPassageWebtoonBucket,
} from "../src/lib/webtoon-storage";
import {
  isWebtoonLanguageId,
  type WebtoonLanguageId,
} from "../src/app/(director)/director/workbench/webtoon/webtoon-page-types";

interface Args {
  execute: boolean;
  force: boolean;
  noAutoApprove: boolean;
  passageId: string;
  language: WebtoonLanguageId;
  imagePath: string;
}

const args = parseArgs(process.argv.slice(2));
const passage = (passagesJson as ExamPassage[]).find((item) => item.id === args.passageId);

async function main() {
  if (!passage) {
    throw new Error(`Unknown exam passage id: ${args.passageId}`);
  }

  const absoluteImagePath = path.resolve(args.imagePath);
  const contentType = contentTypeForPath(absoluteImagePath);
  const imageBuffer = await readFile(absoluteImagePath);
  const prompt = buildExamPassageWebtoonPrompt(passage, args.language);
  const promptHash = createHash("sha256").update(prompt, "utf8").digest("hex");
  const sourceHash = examPassageContentHash(passage);

  console.log(
    `[import-codex-webtoon] passage=${passage.id}, language=${args.language}, image=${absoluteImagePath}, execute=${args.execute}`,
  );

  if (!args.execute) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          passageId: passage.id,
          language: args.language,
          bytes: imageBuffer.byteLength,
          contentType,
          promptHash,
        },
        null,
        2,
      ),
    );
    return;
  }

  const existing = await prisma.examPassageWebtoonAsset.findUnique({
    where: {
      examPassageId_language_style: {
        examPassageId: passage.id,
        language: args.language,
        style: EXAM_PASSAGE_WEBTOON_STYLE,
      },
    },
    select: {
      id: true,
      status: true,
      storagePath: true,
      sourceHash: true,
    },
  });

  if (
    existing &&
    !args.force &&
    existing.status === "APPROVED" &&
    existing.sourceHash === sourceHash
  ) {
    console.log(`[skip] Existing approved asset kept: ${existing.id}`);
    return;
  }

  const asset = await prisma.examPassageWebtoonAsset.upsert({
    where: {
      examPassageId_language_style: {
        examPassageId: passage.id,
        language: args.language,
        style: EXAM_PASSAGE_WEBTOON_STYLE,
      },
    },
    create: {
      examPassageId: passage.id,
      language: args.language,
      style: EXAM_PASSAGE_WEBTOON_STYLE,
      status: "REVIEW_REQUIRED",
      promptSnapshot: prompt,
      promptHash,
      sourceHash,
      sourceMeta: sourceMeta(passage),
      imageModel: "codex-native-imagegen",
      imageSize: null,
      imageQuality: null,
      imageOutputFormat: contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpeg",
      attempts: 1,
    },
    update: {
      status: "REVIEW_REQUIRED",
      promptSnapshot: prompt,
      promptHash,
      sourceHash,
      sourceMeta: sourceMeta(passage),
      imageModel: "codex-native-imagegen",
      imageSize: null,
      imageQuality: null,
      imageOutputFormat: contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpeg",
      rawAtlasUrl: null,
      atlasPredictionId: null,
      errorMessage: null,
      attempts: { increment: 1 },
    },
    select: { id: true, storagePath: true },
  });

  const uploaded = await uploadImageBufferToExamPassageWebtoonBucket({
    imageBuffer,
    assetId: asset.id,
    contentType,
    version: `codex-${Date.now()}`,
  });
  if (asset.storagePath && asset.storagePath !== uploaded.storagePath) {
    await deleteWebtoonImage(asset.storagePath);
  }

  await prisma.examPassageWebtoonAsset.update({
    where: { id: asset.id },
    data: {
      status: "REVIEW_REQUIRED",
      imageUrl: uploaded.publicUrl,
      storagePath: uploaded.storagePath,
      rawAtlasUrl: null,
      atlasPredictionId: null,
      generatedAt: new Date(),
      reviewedAt: null,
      errorMessage: null,
      qaReport: {
        status: "REVIEW_REQUIRED",
        source: "codex-native-imagegen-import",
        localImagePath: absoluteImagePath,
        bytes: uploaded.bytes,
        contentType: uploaded.contentType,
        rule: "Imported image must pass strict text/content/style QA before approval.",
      },
    },
  });

  const review = await reviewExamPassageWebtoonImage({
    passage,
    language: args.language,
    imageUrl: uploaded.publicUrl,
    imageBuffer,
  });
  const status = review.pass && !args.noAutoApprove ? "APPROVED" : "REJECTED";
  await prisma.examPassageWebtoonAsset.update({
    where: { id: asset.id },
    data: {
      status,
      reviewedAt: new Date(review.reviewedAt),
      errorMessage: review.pass ? null : review.reasons.join(" | ").slice(0, 1000),
      qaReport: {
        ...review,
        source: "codex-native-imagegen-import",
        localImagePath: absoluteImagePath,
        approvalPolicy: args.noAutoApprove
          ? "NO_AUTO_APPROVE flag was set; passing images are held for review."
          : "Auto-approved only when strict local OCR checks and vision QA both pass.",
      },
    },
  });

  console.log(
    `[import-codex-webtoon] ${status} asset=${asset.id} url=${uploaded.publicUrl}`,
  );
  if (!review.pass) {
    console.log(JSON.stringify({ reasons: review.reasons, correction: review.correction }, null, 2));
  }
}

function sourceMeta(passage: ExamPassage) {
  return {
    year: passage.year,
    exam: passage.exam,
    grade: passage.grade ?? "고",
    qNumbers: passage.qNumbers,
    type: passage.type,
    typeGroup: passage.typeGroup,
    reconstructionKind: passage.reconstructionKind,
    confidence: passage.confidence,
    wordCount: passage.wordCount,
  };
}

function contentTypeForPath(filePath: string): "image/jpeg" | "image/png" | "image/webp" {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  throw new Error(`Unsupported image extension: ${ext || "(none)"}`);
}

function parseArgs(argv: string[]): Args {
  const valueOf = (name: string) => {
    const found = argv.find((arg) => arg.startsWith(`${name}=`));
    return found ? found.slice(name.length + 1) : null;
  };
  const passageId = valueOf("--passage-id")?.trim();
  const language = valueOf("--language")?.trim();
  const imagePath = valueOf("--image")?.trim();
  if (!passageId) throw new Error("Missing --passage-id=<exam passage id>");
  if (!isWebtoonLanguageId(language)) {
    throw new Error("Missing or invalid --language=KO|KO_EN|EN|EN_KO_GLOSS");
  }
  if (!imagePath) throw new Error("Missing --image=<local image path>");
  return {
    execute: argv.includes("--execute"),
    force: argv.includes("--force"),
    noAutoApprove: argv.includes("--no-auto-approve"),
    passageId,
    language,
    imagePath,
  };
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
