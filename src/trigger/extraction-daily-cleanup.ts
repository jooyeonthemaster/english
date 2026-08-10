// ============================================================================
// extraction-daily-cleanup — runs once a day, removes old assets.
//
// Retention windows:
//   - Source PDF:            7 days  (ORIGINAL_PDF_RETENTION_DAYS)
//   - Per-page JPGs:        30 days  (PAGE_IMAGE_RETENTION_DAYS)
//   - extractedText text:   90 days  (EXTRACTED_TEXT_RETENTION_DAYS)
//   - AI 지문 생성 원본 페이지: 7 days (AUTHORING_PAGE_RETENTION_DAYS, 아래 §4)
//
// We never delete ExtractionJob rows — they remain for audit/metrics — but
// we null out URL fields once the underlying file is gone.
//
// ⚠️ 이 잡은 **두 계열**을 청소한다. 근거가 다르므로 섞지 말 것.
//   (a) row 기준(§1~3): ExtractionJob 행이 대상을 지목한다.
//   (b) 나이 기준(§4): AI 지문 생성 하이브리드가 올린
//       `{academyId}/passage-authoring/{uuid}/` 는 **어떤 DB row 와도 연결돼
//       있지 않다** — 클라이언트가 서명 URL 로 직접 PUT 하고, 경로 문자열은 생성
//       요청 본문에만 잠깐 실렸다 사라진다. 지목해 줄 행이 없으니 스토리지를 훑어
//       나이로만 판정한다.
//   새 trigger.dev 잡을 만들지 않고 여기에 얹은 이유: 스케줄·배포·환경변수 동기화가
//   이미 서 있고, 대상 버킷(extraction-sources)도 §1 과 같다. 잡을 하나 더 만들면
//   trigger.config 배포 설정만 늘고 얻는 것이 없다.
// ============================================================================

import { schedules, logger } from "@trigger.dev/sdk/v3";
import { prisma } from "@/lib/prisma";
import {
  PASSAGE_AUTHORING_PATH_SEGMENT,
  listStorageEntries,
  removeJobAssets,
  removeStorageObjects,
} from "@/lib/supabase-storage";
import {
  EXTRACTED_TEXT_RETENTION_DAYS,
  ORIGINAL_PDF_RETENTION_DAYS,
  PAGE_IMAGE_RETENTION_DAYS,
} from "@/lib/extraction/constants";

// ── §4 상수 ─────────────────────────────────────────────────────────────────
//
// 왜 extraction/constants.ts 가 아니라 여기인가: 이 자산은 추출 파이프라인 것이
// 아니라 AI 지문 생성 것이고, 유일한 소비자가 이 파일이다. 추출 상수 옆에 두면
// "추출 보존 정책"으로 읽혀 다음 사람이 함께 조정한다.

/**
 * AI 지문 생성 원본 페이지 보존일. **넉넉함이 곧 안전장치다.**
 *
 * 진행 중인 잡의 자료를 지우면 그 생성은 이미지 0장으로 돌아가고(run-job 은 조달
 * 실패를 삼키고 계속 간다), 사용자는 하이브리드 값의 크레딧을 내고 텍스트만으로
 * 만든 지문을 받는다 — 조용한 크레딧 손상이라 아무도 신고하지 못한다.
 * 그래서 실제 수명의 **수십 배**로 잡는다:
 *   · 생성 잡의 최대 수명 = 2시간(workbench-ai-job-stale-cleanup 의 trigger-backed
 *     좀비 컷오프. after() 경로는 15분이라 더 짧다).
 *   · 업로드된 경로를 들고 있는 자료 초안은 **탭 안 React state 에만** 산다
 *     (use-material-drafts — localStorage 저장이 없다). 즉 탭을 닫으면 그 경로를
 *     다시 쓸 주체가 세상에 없다.
 *   · 결과 복구 창(authoring-store-io.RECOVERY_WINDOW_MS)도 24시간이다.
 * 7일은 그 모든 상한 위에 최소 3배 여유를 남긴다. 줄이려면 위 세 값을 먼저 볼 것.
 */
const AUTHORING_PAGE_RETENTION_DAYS = 7;

/** 한 번의 런이 훑는 업로드 프리픽스 수 상한. 초과분은 다음 날 회수된다
 *  (일일 잡을 30분씩 붙잡아 두는 것보다 하루 늦게 지우는 편이 낫다). */
const MAX_AUTHORING_PREFIXES_PER_RUN = 400;

/** 버킷 루트에서 훑는 학원 폴더 수 상한. 루트를 쓰는 이유는 DB 에서 사라진
 *  학원의 프리픽스도 회수하기 위해서다(academy row 로 훑으면 영구 잔존한다). */
const MAX_ACADEMY_FOLDERS_PER_RUN = 500;

/** 업로드 프리픽스 하나 안의 파일 수 상한. 발급 상한이 4장(page-uploads.MAX_PAGES)
 *  이라 넉넉한 값이다. */
const MAX_FILES_PER_AUTHORING_PREFIX = 50;

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

interface AuthoringSweepResult {
  /** 검사한 업로드 프리픽스 수. */
  scanned: number;
  /** 비운 프리픽스 수. */
  purged: number;
  /** 실제로 삭제된 오브젝트 수. */
  removed: number;
  /** 아직 어린 프리픽스(= 진행 중일 수 있어 건드리지 않음). */
  keptYoung: number;
  /** created_at 을 못 읽어 판정을 보류한 프리픽스. 계속 늘면 조사 대상이다. */
  keptUnknownAge: number;
  /** 상한에 걸려 이번 런에서 다 못 훑었는가. */
  truncated: boolean;
}

/**
 * §4 나이 기준 청소. `{academyId}/passage-authoring/{uuid}/` 를 훑어 **프리픽스
 * 안의 가장 최근 파일**이 컷오프보다 오래됐을 때만 통째로 지운다.
 *
 * 왜 "가장 최근"인가: 한 프리픽스의 4장은 같은 순간에 올라가지만, 한 장이라도
 * 최근이면 그 묶음은 아직 살아 있는 것으로 본다. 나이를 못 읽은 파일이 하나라도
 * 있으면 아예 건드리지 않는다 — 모르면 지우지 않는 쪽이 크레딧 손상보다 싸다.
 *
 * 스토리지 실패는 전부 값(빈 목록·삭제 0건)으로 흡수된다(supabase-storage 관습).
 * 여기서 던지면 §1~3 이 이미 끝난 런이 통째로 실패로 기록된다.
 */
async function sweepAuthoringPageUploads(
  cutoff: Date,
): Promise<AuthoringSweepResult> {
  const out: AuthoringSweepResult = {
    scanned: 0,
    purged: 0,
    removed: 0,
    keptYoung: 0,
    keptUnknownAge: 0,
    truncated: false,
  };
  const cutoffMs = cutoff.getTime();

  const academyFolders = await listStorageEntries("", MAX_ACADEMY_FOLDERS_PER_RUN);
  for (const academy of academyFolders) {
    if (!academy.isFolder) continue;
    if (out.scanned >= MAX_AUTHORING_PREFIXES_PER_RUN) {
      out.truncated = true;
      break;
    }

    const base = `${academy.name}/${PASSAGE_AUTHORING_PATH_SEGMENT}`;
    const uploads = await listStorageEntries(
      base,
      MAX_AUTHORING_PREFIXES_PER_RUN - out.scanned,
    );

    for (const upload of uploads) {
      if (!upload.isFolder) continue;
      if (out.scanned >= MAX_AUTHORING_PREFIXES_PER_RUN) {
        out.truncated = true;
        break;
      }
      out.scanned += 1;

      const dir = `${base}/${upload.name}`;
      const files = (
        await listStorageEntries(dir, MAX_FILES_PER_AUTHORING_PREFIX)
      ).filter((entry) => !entry.isFolder);
      if (files.length === 0) continue;

      let newestMs = 0;
      let ageUnknown = false;
      for (const file of files) {
        if (!file.createdAt) {
          ageUnknown = true;
          break;
        }
        newestMs = Math.max(newestMs, file.createdAt.getTime());
      }
      if (ageUnknown) {
        out.keptUnknownAge += 1;
        continue;
      }
      if (newestMs >= cutoffMs) {
        out.keptYoung += 1;
        continue;
      }

      const removed = await removeStorageObjects(
        files.map((file) => `${dir}/${file.name}`),
      );
      out.removed += removed;
      if (removed > 0) out.purged += 1;
    }
  }

  return out;
}

export const extractionDailyCleanupTask = schedules.task({
  id: "extraction-daily-cleanup",
  cron: "0 18 * * *", // 18:00 UTC = 03:00 KST
  async run() {
    const pdfCutoff = daysAgo(ORIGINAL_PDF_RETENTION_DAYS);
    const imageCutoff = daysAgo(PAGE_IMAGE_RETENTION_DAYS);
    const textCutoff = daysAgo(EXTRACTED_TEXT_RETENTION_DAYS);

    // 1. Blow away Storage assets for jobs past the image retention window.
    const oldJobs = await prisma.extractionJob.findMany({
      where: {
        completedAt: { lt: imageCutoff, not: null },
        status: { in: ["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"] },
      },
      select: { id: true, academyId: true },
      take: 200,
    });

    let removed = 0;
    for (const job of oldJobs) {
      try {
        await removeJobAssets(job.academyId, job.id);
        removed++;
      } catch (e) {
        logger.warn("cleanup remove failed", {
          jobId: job.id,
          err: (e as Error).message,
        });
      }
    }

    // 2. Null out originalFileUrl past the PDF window (PDF blob is gone).
    const pdfCleared = await prisma.extractionJob.updateMany({
      where: {
        originalFileUrl: { not: null },
        completedAt: { lt: pdfCutoff, not: null },
      },
      data: { originalFileUrl: null },
    });

    // 3. Clear extractedText past the text retention window, but keep the
    //    row (for analytics / token-usage queries).
    const textCleared = await prisma.extractionPage.updateMany({
      where: {
        extractedText: { not: null },
        completedAt: { lt: textCutoff, not: null },
      },
      data: { extractedText: null },
    });

    // 4. AI 지문 생성 원본 페이지 — row 가 없으므로 나이로만 판정한다(파일 상단
    //    (b) 참고). 여기서 던지면 위 세 구간의 성과까지 실패로 기록되므로 삼킨다.
    let authoring: AuthoringSweepResult = {
      scanned: 0,
      purged: 0,
      removed: 0,
      keptYoung: 0,
      keptUnknownAge: 0,
      truncated: false,
    };
    try {
      authoring = await sweepAuthoringPageUploads(
        daysAgo(AUTHORING_PAGE_RETENTION_DAYS),
      );
    } catch (e) {
      logger.warn("authoring page sweep failed", {
        err: (e as Error).message,
      });
    }

    logger.info("daily cleanup", {
      storageRemoved: removed,
      pdfUrlCleared: pdfCleared.count,
      textCleared: textCleared.count,
      authoringPrefixesScanned: authoring.scanned,
      authoringPrefixesPurged: authoring.purged,
      authoringObjectsRemoved: authoring.removed,
      authoringKeptYoung: authoring.keptYoung,
      authoringKeptUnknownAge: authoring.keptUnknownAge,
      authoringTruncated: authoring.truncated,
    });

    return {
      storageRemoved: removed,
      pdfUrlCleared: pdfCleared.count,
      textCleared: textCleared.count,
      authoring,
    };
  },
});
