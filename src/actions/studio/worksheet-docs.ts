"use server";

// ============================================================================
// 클래스 스튜디오 — 학습지 조판(합성 뷰) 문서 로더 (docs/class-studio-spec.md §3.10.21)
//
// E21 「학습지 조판」이 우측 섹션에서 활성 문서 1개 + 부착 문서 N개를 한 par-root 로
// 합성해 보여 주려면, 체크된 학습지 행들의 **본문(PassageReport.pages)** 이 필요하다.
// 목록 정본(worksheets.ts `listStudioClassWorksheets`)은 스스로 "pages 는 절대 select
// 하지 않는다"는 슬림 계약(worksheets.ts:9·198-202)을 세워 두었으므로, 그 계약을
// 오염시키지 않으려고 **본문 로더만 이 별도 파일**로 뗀다.
//
// ⚠⚠ pages Json 은 **이 액션만** select 한다. **이 액션 외 어디서도 pages 를 select
//     하지 마라.** (과거 적대 검수 major ×2: 소비처 0인 pages 를 지문 50개분 나르던
//     질의가 실제로 있었다 — worksheets.ts:198-202 주석.)
//
// ── E22 개정(26-08-18): 문서 축 하드 상한 6 폐기 ────────────────────────────
// 구 주석은 "pages 가 문서당 수 MB 급"이라는 추정으로 SHEET_COMPOSE_MAX_DOCS(=6)를
// **명시 실패**로 강제했다. 감독 페이로드 실측이 그 추정을 반증했다 —
// **중앙값 49KB · 최대 458KB · 40건 합계 1.9MB**(렌더도 30→300아이템에서
// 890ms→883ms 로 평평). 그래서 상한은 **요청 배치 상한**(SHEET_COMPOSE_DOC_BATCH
// =12)으로 성격이 바뀌었다: 클라가 청크해서 보내므로 정상 경로는 절대 안 걸리고,
// 여기 걸리는 것은 버그성/악의적 대량 id 배열뿐이다(§3.10.22 E22-0 계약 3).
// 슬림 목록 계약(pages 금지)은 상한 폐기와 **무관하게 그대로**다.
//
// 관문 순서는 worksheets.ts·deploy.ts 관용구를 그대로 미러한다:
//   requireStaffAuth → 원시 타입 방어 → 상한 → 클래스 소유 → 리포트 조회 →
//   클래스 링크 검증(교차 클래스 열람 차단) → 스키마 파싱 → 입력 순서 복원.
// ============================================================================

import {
  KO_PRIME_REPORT_MARKER,
  PRIME_REPORT_MARKERS,
} from "@/actions/workbench/passage-constants";
import { requireStaffAuth } from "@/lib/auth";
import { isKoAnalysisReportShape } from "@/lib/passage-report/analysis-report/ko-report-detect";
import {
  analysisReportSchema,
  type AnalysisReport,
} from "@/lib/passage-report/analysis-report/schema";
import { prisma } from "@/lib/prisma";
import type { StudioActionResult } from "./classes";
import { SHEET_COMPOSE_DOC_BATCH } from "./worksheet-docs-constants";

// ⚠ 공유 계약은 이 배치 상수를 **이 파일에서** export 하라고 적었지만,
//   이 모듈은 "use server" 라 async 함수 외 export 가 빌드 에러다
//   (근거: src/actions/workbench/passage-constants.ts:1-3 이 같은 이유로 만들어진
//    플레인 상수 모듈이다). 그래서 상수는 ./worksheet-docs-constants 로 뗐다 —
//   소비처는 `@/actions/studio/worksheet-docs-constants` 에서 import 할 것.

export interface StudioWorksheetDoc {
  reportId: string;
  passageId: string;
  /** 리포트 제목(= 행 라벨). 헤더 문서 칩·「편집 중: {문서명}」 고지에 그대로 쓰인다. */
  title: string;
  /** PRIME | PRIME_FINAL (PRIME_KO 는 아래 사유로 드롭) */
  planMarker: string;
  report: AnalysisReport;
}

/**
 * 드롭된 행의 사유 — **옵셔널 추가 필드**(공유 계약 `{ docs }` 는 그대로 유지).
 *
 * 왜 굳이 돌려주나: §3.10.21 E21-0 이 "고지 없는 합성은 즉시 신뢰 사고"라고 못박았다.
 * 사용자가 체크한 행이 조판에 **소리 없이** 나타나지 않으면 같은 종류의 사고다.
 * 소비처는 이 필드를 무시해도 컴파일·동작이 동일하다(구조적으로 additive).
 */
export interface StudioWorksheetDocDrop {
  reportId: string;
  reason: string;
}

/**
 * KO(PRIME_KO) 문서를 v1 합성에서 제외하는 근거 — 스펙에 없는 판단이라 여기 남긴다.
 *
 * 1. 타입 진실성: `preview-parse.ts:22` 는 KO 보고서를 `ko.data as unknown as
 *    AnalysisReport` 로 **캐스팅**해 넘긴다(렌더러가 KO 섹션을 자체 게이트로
 *    디스패치하기 때문에 미리보기에서는 성립). 그러나 조판 합성층(compose-ids /
 *    compose-flow)은 영어 스키마 형상을 전제로 blockMeta·blockOrder 를 재조립하므로,
 *    캐스팅된 문서를 섞으면 타입이 보증하지 않는 경로가 v1 에 그대로 들어온다.
 *    → 이 액션은 캐스팅 없이 `analysisReportSchema.safeParse` 만 쓴다(반환 타입이
 *      진짜 AnalysisReport 임을 파서로 보증). 그 대가로 KO 는 파싱 자체가 실패한다.
 * 2. 계통 일관성: KO 는 파이널 미지원(`prime/[passageId]/route.ts:52` — 국어는 variant
 *    를 무시)이고, 모바일 배포도 PRIME 한정(§3.10.21 E21-5)이다. KO 를 조판만 열어
 *    두면 "조판은 되는데 배포는 안 되는" 비대칭이 하나 더 생긴다.
 * 3. 마커가 PRIME 인데 내용이 KO 인 구버전 행이 있을 수 있으므로 **마커 축과 모양 축
 *    둘 다** 검사한다(`isKoAnalysisReportShape` — subject 리터럴 또는 KO 섹션 kind).
 *
 * KO 조판이 필요해지면 compose 순수층에 KO 형상 검증을 먼저 붙인 뒤 이 게이트를 연다.
 */
const KO_DROP_REASON =
  "국어(PRIME_KO) 학습지는 아직 조판에 함께 올릴 수 없습니다.";

export async function getStudioWorksheetDocs(input: {
  classId: string;
  reportIds: string[];
}): Promise<
  StudioActionResult<{
    docs: StudioWorksheetDoc[];
    dropped?: StudioWorksheetDocDrop[];
  }>
> {
  try {
    const staff = await requireStaffAuth();

    // ── 원시 입력 방어 ──────────────────────────────────────────────────────
    // StringFilter 객체({ not: "" } 등)를 그대로 where 에 흘리면 소유 검증이 임의
    // 클래스/리포트에 통과한다(worksheets.ts:48-50 과 같은 관용구).
    const classId = typeof input.classId === "string" ? input.classId : "";
    if (!classId) {
      return { success: false, error: "클래스 정보가 올바르지 않습니다." };
    }
    if (!Array.isArray(input.reportIds)) {
      return { success: false, error: "학습지 정보가 올바르지 않습니다." };
    }
    // 중복 id 는 합성 단계에서 docKey 충돌 → id 유일성 붕괴(§3.10.21 E21-7 함정 2)로
    // 이어지므로 **입력 단에서** 접는다. 순서는 첫 등장 순서를 보존한다.
    const reportIds: string[] = [];
    for (const v of input.reportIds) {
      if (typeof v !== "string" || v.length === 0) continue;
      if (!reportIds.includes(v)) reportIds.push(v);
    }
    if (reportIds.length === 0) return { success: true, data: { docs: [] } };
    // ── 요청 배치 상한(§3.10.22 E22-0 계약 3) ──────────────────────────────
    // 「문서 N장까지만 조판 가능」이라는 **정책 상한이 아니다**. 클라 로더가
    // SHEET_COMPOSE_DOC_BATCH 단위로 청크해서 보내므로 정상 경로는 이 분기에
    // 절대 닿지 않는다 — 여기 걸리는 것은 청크를 건너뛴 버그성 호출이나
    // 임의 대량 id 배열(1회 질의로 pages 수백 건 = 서버 메모리 스파이크)뿐이다.
    // 그래서 초과는 여전히 **잘라서 성공시키지 않고** 명시 실패로 끝낸다:
    // 체크한 문서가 조용히 빠지는 것은 상한 폐기 후에도 신뢰 사고다(E21-0).
    // 문구는 「상한 6장」이 아니라 **재요청 가능한 배치 초과**로 말한다.
    if (reportIds.length > SHEET_COMPOSE_DOC_BATCH) {
      return {
        success: false,
        error: `학습지 본문은 한 번에 ${SHEET_COMPOSE_DOC_BATCH}개씩 나눠 불러옵니다 — 요청이 너무 큽니다.`,
      };
    }

    // ── 클래스 소유 ────────────────────────────────────────────────────────
    const cls = await prisma.class.findFirst({
      where: { id: classId, academyId: staff.academyId },
      select: { id: true },
    });
    if (!cls) return { success: false, error: "클래스를 찾을 수 없습니다." };

    // ── 리포트 본문 조회(이 액션만 pages 를 select 한다) ─────────────────────
    const reports = await prisma.passageReport.findMany({
      where: {
        id: { in: reportIds },
        academyId: staff.academyId,
        generationPlan: { in: PRIME_REPORT_MARKERS },
        deletedAt: null,
      },
      select: {
        id: true,
        passageId: true,
        title: true,
        generationPlan: true,
        pages: true,
      },
    });
    if (reports.length === 0) return { success: true, data: { docs: [] } };

    // ── 클래스 링크 검증 ────────────────────────────────────────────────────
    // PassageReport 에는 클래스 관계가 없다(worksheets.ts:7-8). reportId 만으로
    // 열면 **같은 학원의 다른 클래스** 학습지를 조판에 끌어올 수 있으므로,
    // StudioClassPassage 링크로 이 클래스에 실제로 담긴 지문인지 1회 질의로 확인하고
    // 담기지 않은 것은 드롭한다(교차 클래스 열람 차단).
    const links = await prisma.studioClassPassage.findMany({
      where: {
        academyId: staff.academyId,
        classId,
        passageId: { in: reports.map((r) => r.passageId) },
      },
      select: { passageId: true },
    });
    const linkedPassages = new Set(links.map((l) => l.passageId));

    // ── 파싱 + 입력 순서 복원 ───────────────────────────────────────────────
    // 조판 순서 = 체크 순서가 계약이므로 DB 반환 순서가 아니라 reportIds 순서를 쓴다.
    const byId = new Map(reports.map((r) => [r.id, r]));
    const docs: StudioWorksheetDoc[] = [];
    const dropped: StudioWorksheetDocDrop[] = [];
    for (const id of reportIds) {
      const row = byId.get(id);
      if (!row) {
        dropped.push({ reportId: id, reason: "학습지를 찾을 수 없습니다." });
        continue;
      }
      if (!linkedPassages.has(row.passageId)) {
        dropped.push({
          reportId: id,
          reason: "이 클래스에 담긴 지문의 학습지가 아닙니다.",
        });
        continue;
      }
      // KO 는 마커 축·모양 축 둘 다로 거른다(위 KO_DROP_REASON 주석 3).
      if (
        row.generationPlan === KO_PRIME_REPORT_MARKER ||
        isKoAnalysisReportShape(row.pages)
      ) {
        dropped.push({ reportId: id, reason: KO_DROP_REASON });
        continue;
      }
      // preview-parse 를 쓰지 않는 이유는 KO_DROP_REASON 주석 1 참고 —
      // 여기서는 캐스팅 없는 정식 파싱만 통과시켜 반환 타입을 파서로 보증한다.
      // (PRIME_FINAL 도 영어 스키마로 파싱된다 — prime/[passageId]/route.ts:61 미러.)
      const parsed = analysisReportSchema.safeParse(row.pages);
      if (!parsed.success) {
        dropped.push({
          reportId: id,
          reason: "학습지 내용을 읽을 수 없습니다.",
        });
        continue;
      }
      docs.push({
        reportId: row.id,
        passageId: row.passageId,
        title: row.title,
        planMarker: row.generationPlan,
        report: parsed.data,
      });
    }

    return {
      success: true,
      data: dropped.length > 0 ? { docs, dropped } : { docs },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "학습지 본문을 불러오지 못했습니다.",
    };
  }
}
