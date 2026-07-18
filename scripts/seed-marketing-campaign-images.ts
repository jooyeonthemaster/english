// ============================================================================
// SMOAT 2026 캠페인 이미지 31종을 관리자 > 오프라인 홍보에 공용 폴더로 등록한다.
// Supabase Storage와 DB 모두 파일명 기준으로 멱등 upsert한다.
//
//   npx tsx scripts/seed-marketing-campaign-images.ts
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

function loadEnv(file: string) {
  const envPath = path.resolve(process.cwd(), file);
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnv(".env");
loadEnv(".env.local");

const BUCKET = "offline-marketing";
const SOURCE_DIR = path.resolve(process.cwd(), "public/marketing/campaign-2026");
const CAMPAIGN_TITLE = "SMOAT 2026 홍보 이미지";

const FILES = [
  ["01-teacher-evening.png", "출제에 쓰던 밤을 돌려드립니다", "출제 시간 절약 캠페인"],
  ["02-one-passage-many-outputs.png", "지문 하나로 수업의 모든 결과물까지", "서비스 전체 결과물 캠페인"],
  ["03-instant-extraction.png", "찍는 순간 다시 쓸 수 있는 자료로", "자료 추출 기능 캠페인"],
  ["04-report-consultation.png", "다음 학습까지 보여주는 리포트", "학생별 리포트 상담 캠페인"],
  ["05-exam-engine.png", "복잡한 자료를 완성된 시험으로", "AI 출제 엔진 키비주얼"],
  ["06-real-exam-and-worksheet.png", "실제 시험지와 분석 학습지", "실제 SMOAT 출력물 캠페인"],
  ["07-real-question-workspace.png", "실제 문제 관리 워크스페이스", "실제 SMOAT 문제 관리 화면 캠페인"],
  ["08-real-report-editor.png", "실제 시험 리포트 편집기", "실제 SMOAT 리포트 화면과 출력물 캠페인"],
  ["09-real-workflow-showcase.png", "실제 분석부터 시험지 출력까지", "실제 SMOAT 전체 제작 흐름 키비주얼"],
  ["10-classroom-exam-handoff.png", "수업 직전 완성된 시험지", "실제 SMOAT 시험지를 배부하는 교실 캠페인"],
  ["11-teacher-question-review.png", "선생님들의 문항 공동 검토", "실제 SMOAT 문제 관리 화면을 활용한 협업 캠페인"],
  ["12-report-planning-team.png", "상담을 준비하는 원장과 강사", "실제 SMOAT 시험 리포트를 활용한 상담 준비 캠페인"],
  ["13-analysis-lesson-planning.png", "분석 학습지로 설계하는 수업", "실제 SMOAT 분석 학습지를 활용한 수업 연구 캠페인"],
  ["14-webtoon-classroom.png", "웹툰으로 몰입하는 독해 수업", "실제 SMOAT 지문 웹툰을 활용한 교실 캠페인"],
  ["15-academy-team-seminar.png", "하나의 시스템으로 연결되는 교사진", "실제 분석·시험지 편집 화면을 활용한 학원 내부 세미나 캠페인"],
  ["16-one-to-one-analysis-feedback.png", "분석 학습지로 완성하는 1대1 피드백", "실제 SMOAT 분석 학습지를 활용한 개별 지도 캠페인"],
  ["17-parent-report-consultation.png", "점수 다음의 계획을 보여주는 상담", "실제 SMOAT 시험 리포트를 활용한 학부모 상담 캠페인"],
  ["18-mobile-question-extraction.png", "종이 시험지를 편집 가능한 자료로", "실제 SMOAT 자료 추출 화면을 활용한 모바일 촬영 캠페인"],
  ["19-exam-builder-completion.png", "화면에서 편집하고 수업에서 바로 사용", "실제 SMOAT 시험지 편집기와 출력물을 활용한 제작 완료 캠페인"],
  ["20-before-after-transformation.png", "출제 전과 후, 같은 하루의 차이", "수작업 출제와 SMOAT 기반 제작 환경을 대비한 전환 캠페인"],
  ["21-teacher-evening-returned.png", "선생님의 저녁을 다시 돌려드립니다", "완성된 시험지를 두고 제시간에 퇴근하는 교사 캠페인"],
  ["22-exam-architect.png", "시험을 만드는 사람에서 설계하는 사람으로", "실제 시험지와 편집 화면을 건축 설계 언어로 표현한 키비주얼"],
  ["23-teacher-workflow-flatlay.png", "한 책상 위에 완성된 수업의 하루", "시험지·분석지·리포트·웹툰을 한눈에 보여주는 제품 정물 캠페인"],
  ["24-passage-becomes-world.png", "지문이 장면이 되면 이해가 시작됩니다", "실제 시험 지문이 웹툰 학습 콘텐츠로 확장되는 독해 캠페인"],
  ["25-exam-production-orchestra.png", "복잡한 출제 과정을 하나의 리듬으로", "시험 제작의 여러 산출물을 정교하게 지휘하는 교사 키비주얼"],
  ["26-precision-output-macro.png", "완성도는 디테일에서 보입니다", "실제 시험지·분석지·리포트의 인쇄 품질을 강조한 매크로 제품 캠페인"],
  ["27-academy-control-room.png", "학원 전체의 출제와 분석을 한눈에", "실제 SMOAT 화면으로 운영 흐름을 관리하는 학원 팀 캠페인"],
  ["28-student-growth-journey.png", "분석부터 피드백까지 이어지는 성장", "한 학생의 분석 학습·실전 시험·리포트 피드백 여정 캠페인"],
  ["29-every-season-of-teaching.png", "모든 시험 시즌을 하나의 시스템으로", "신학기부터 수능 시즌까지 이어지는 연간 운영 캠페인"],
  ["30-modern-teacher-editorial.png", "앞선 교사의 새로운 기준", "교사의 전문성과 실제 SMOAT 산출물을 결합한 패션 에디토리얼 캠페인"],
  ["31-world-without-smoat.png", "SMOAT 없이 출제한다는 것", "반복되는 수작업과 종이 업무를 블랙코미디로 표현한 문제 인식 캠페인"],
] as const;

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 필요합니다.");
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const prisma = new PrismaClient();

  const { data: existingBucket } = await supabase.storage.getBucket(BUCKET);
  if (existingBucket) {
    const { error } = await supabase.storage.updateBucket(BUCKET, {
      public: true,
      fileSizeLimit: 30 * 1024 * 1024,
      allowedMimeTypes: ["application/pdf", "image/png", "image/jpeg", "image/webp"],
    });
    if (error) throw error;
  } else {
    const { error } = await supabase.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: 30 * 1024 * 1024,
      allowedMimeTypes: ["application/pdf", "image/png", "image/jpeg", "image/webp"],
    });
    if (error) throw error;
  }

  const current = await prisma.offlineMarketingCampaign.findFirst({
    where: { title: CAMPAIGN_TITLE },
  });
  const top = await prisma.offlineMarketingCampaign.findFirst({
    orderBy: { sortOrder: "asc" },
    select: { sortOrder: true },
  });
  const campaign = current ??
    (await prisma.offlineMarketingCampaign.create({
      data: {
        title: CAMPAIGN_TITLE,
        description: "관리자 공용 브랜드·기능 홍보 이미지. 미리보기 후 원본 PNG를 다운로드해 사용하세요.",
        category: "홍보 이미지",
        sortOrder: (top?.sortOrder ?? 0) - 1,
        isActive: true,
      },
    }));

  for (const [index, [fileName, title, description]] of FILES.entries()) {
    const absolutePath = path.join(SOURCE_DIR, fileName);
    if (!fs.existsSync(absolutePath)) throw new Error(`파일 없음: ${absolutePath}`);
    const body = fs.readFileSync(absolutePath);
    const storagePath = `campaign-2026/${fileName}`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, body, { contentType: "image/png", upsert: true });
    if (uploadError) throw uploadError;
    const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);

    const existing = await prisma.offlineMarketingAsset.findFirst({
      where: { campaignId: campaign.id, fileName },
      select: { id: true },
    });
    const data = {
      title,
      description,
      fileUrl: publicData.publicUrl,
      storagePath,
      fileName,
      fileSize: body.byteLength,
      pageCount: null,
      sortOrder: index,
    };
    if (existing) {
      await prisma.offlineMarketingAsset.update({ where: { id: existing.id }, data });
    } else {
      await prisma.offlineMarketingAsset.create({
        data: { ...data, campaignId: campaign.id },
      });
    }
    console.log(`✓ ${fileName}`);
  }

  await prisma.$disconnect();
  console.log(`완료: ${CAMPAIGN_TITLE} / ${FILES.length}개`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
