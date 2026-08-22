"use server";

// ============================================================================
// 클래스 스튜디오 — 학습지 평면 조회 (docs/class-studio-spec.md §3.10.16-d)
//
// 스튜디오의 "학습지" 실체 = PassageReport(generationPlan ∈ PRIME_REPORT_MARKERS).
// PassageReport 에는 클래스 관계가 없어 StudioClassPassage 링크 경유 2단 질의로
// 클래스 스코프를 만든다(StudioClassPassage 는 relation-free — 조인 불가).
// pages/theme Json 은 절대 select 하지 않는다(수 MB 급 — 목록 응답 슬림 유지 §12).
// ============================================================================

import {
  FINAL_REPORT_MARKER,
  PRIME_REPORT_MARKER,
  PRIME_REPORT_MARKERS,
} from "@/actions/workbench/passage-constants";
import { requireStaffAuth } from "@/lib/auth";
import {
  DEFAULT_ANALYSIS_TONE,
  isPartialAnalysisData,
  normalizeAnalysisTone,
  type AnalysisTone,
} from "@/lib/passage-analysis-options";
import { isKoreanPassage } from "@/lib/passage-report/analysis-report/ko-entry";
import { hashContent } from "@/lib/passage-utils";
import { prisma } from "@/lib/prisma";
import type { StudioActionResult } from "./classes";

export interface StudioClassWorksheetRow {
  reportId: string;
  passageId: string;
  passageTitle: string;
  title: string;
  /** "DRAFT" | "PUBLISHED" | "ARCHIVED" — DB 컬럼은 String(schema 주석 계약) */
  status: string;
  /** PRIME | PRIME_KO | PRIME_FINAL — 뷰의 종류 배지 재료 */
  planMarker: string;
  updatedAt: string;
  publishedAt: string | null;
  createdAt: string;
}

// ── 방어 상한과 절단 고지 (docs/class-studio-spec.md §3.10.23 E24-⑩) ────────
// 상한 2개는 **named const 로만** 존재한다. `take` 와 `truncated` 판정식이 각자
// 매직넘버를 들면 한쪽만 조정됐을 때 「절단은 실제로 일어났는데 truncated:false」
// 라는 조용한 거짓말이 남는다 — 계기가 죽은 채 초록인 최악의 형태다.
//
// 왜 무고지 절단이 결함인가: E24 가 「학습지 조판」이라는 **전용 방**을 따로 만든
// 이상, 사용자는 그 방의 목록을 클래스 학습지 **전량**으로 읽는다. 거기서 목록이
// 말없이 잘리면 「상한에 걸렸다」가 아니라 「내가 만든 학습지가 사라졌다 / 이 화면이
// 고장났다」로 해석한다. 그 오해는 문의가 아니라 **재생성**으로 이어져 과금까지
// 만든다. 그래서 절단은 숨기지 않고 각주로 고지한다 — 문항 축
// (questions.ts:25·185 `QUESTION_TAKE`/`truncated`)과 동형 계약이다.
/** 클래스 링크 방어 상한 — 목록 정본(passages.ts·questions.ts)과 같은 값을 유지한다. */
const CLASS_LINK_TAKE = 300;
/** 리포트 방어 상한 — 지문당 다중 행이 가능해 링크 상한보다 크다(아래 질의 주석). */
const REPORT_TAKE = 900;

export async function listStudioClassWorksheets(input: {
  classId: string;
}): Promise<
  // `truncated` 는 E24 신설 **additive** 필드다. 기존 소비처는 무개변이어야 하므로
  // rows 의 자리·이름·의미는 손대지 않는다.
  StudioActionResult<{ rows: StudioClassWorksheetRow[]; truncated: boolean }>
> {
  try {
    const staff = await requireStaffAuth();
    // 원시 입력 방어(적대 감사 minor) — StringFilter 객체 주입으로 소유 검증이
    // 임의 클래스에 통과하는 것을 막는다(questions.ts 관용구 미러).
    const classId = typeof input.classId === "string" ? input.classId : "";
    if (!classId) {
      return { success: false, error: "클래스 정보가 올바르지 않습니다." };
    }
    const cls = await prisma.class.findFirst({
      where: { id: classId, academyId: staff.academyId },
      select: { id: true },
    });
    if (!cls) return { success: false, error: "클래스를 찾을 수 없습니다." };

    // 절단 기준을 목록 정본(listStudioClassPassages)과 동일하게 유지 — 값은
    // CLASS_LINK_TAKE 1곳에서만 산다(아래 truncated 판정식이 같은 상수를 읽는다).
    const links = await prisma.studioClassPassage.findMany({
      where: { academyId: staff.academyId, classId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      take: CLASS_LINK_TAKE,
      select: { passageId: true },
    });
    // 조기 반환도 **성공 경로와 같은 형태**로 내보낸다. 형태가 갈리면 소비처가
    // `res.data.truncated` 에서 undefined 를 만나고, 각주 분기가 조용히 죽는다
    // (타입은 옵셔널이 아니라 통과하지도 않는다 — 여기서 형태를 맞추는 게 계약).
    if (links.length === 0) {
      return { success: true, data: { rows: [], truncated: false } };
    }
    const passageIds = links.map((l) => l.passageId);

    const [passages, reports] = await Promise.all([
      prisma.passage.findMany({
        where: { id: { in: passageIds }, academyId: staff.academyId },
        select: { id: true, title: true },
      }),
      prisma.passageReport.findMany({
        where: {
          passageId: { in: passageIds },
          academyId: staff.academyId,
          generationPlan: { in: PRIME_REPORT_MARKERS },
          deletedAt: null,
        },
        orderBy: { updatedAt: "desc" },
        // 방어 상한(적대 감사 minor) — (passageId, generationPlan) 유니크가
        // 없어 지문당 다중 행이 가능하다: CLASS_LINK_TAKE 지문 × 마커 3종 여유분.
        take: REPORT_TAKE,
        select: {
          id: true,
          passageId: true,
          title: true,
          status: true,
          generationPlan: true,
          updatedAt: true,
          publishedAt: true,
          createdAt: true,
        },
      }),
    ]);

    const titleByPassage = new Map(passages.map((p) => [p.id, p.title]));
    const rows: StudioClassWorksheetRow[] = [];
    for (const r of reports) {
      const passageTitle = titleByPassage.get(r.passageId);
      if (passageTitle === undefined) continue; // 지문이 삭제된 리포트는 표시하지 않는다
      rows.push({
        reportId: r.id,
        passageId: r.passageId,
        passageTitle,
        title: r.title,
        status: r.status,
        planMarker: r.generationPlan,
        updatedAt: r.updatedAt.toISOString(),
        publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
      });
    }
    // ⚠ 판정은 **질의 원본 길이**로 한다. rows 는 바로 위에서 「지문이 삭제된
    // 리포트」를 걸러낸 뒤라 rows.length < reports.length 가 정상적으로 발생하고,
    // rows.length 로 재면 900건을 꽉 채워 절단된 응답이 truncated:false 로 나가는
    // 역전이 생긴다. 두 축(링크·리포트) 중 **하나라도** 상한에 닿으면 절단이다 —
    // 링크가 300 에서 잘리면 뒤쪽 지문의 학습지는 질의에 아예 오르지도 못한다.
    const truncated =
      links.length >= CLASS_LINK_TAKE || reports.length >= REPORT_TAKE;
    return { success: true, data: { rows, truncated } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "학습지 목록을 불러오지 못했습니다.",
    };
  }
}

// ============================================================================
// 학습지 3상품 발사 자격·가격 판정 (docs/class-studio-spec.md §3.10.19 E19-2)
//
// 「학습지 만들기」 모달이 오픈 1회 배치 조회한다. **모달이 표기한 가격과 실제
// 청구가 어긋나면 안 되므로** 판정 술어는 실제 발사 라우트
// (app/api/workbench/ai-jobs/passage-analysis/fast/route.ts)의 미러다:
//   · korean       ← isKoreanPassage(passage)         (라우트 317-329 의 400 게이트)
//   · analyzing    ← 활성 PASSAGE_ANALYSIS 잡 존재      (지문당 동시 1잡)
//   · basicCached  ← 라우트 캐시 단락 술어의 미러(아래 3축 주석)
// practice·final 은 라우트가 캐시 단락을 **명시적으로 건너뛰므로** 보유 여부와
// 무관하게 항상 과금이다 — 0크레딧으로 표기하면 거짓 견적이 된다(E19-2).
//
// ⚠ basicCached 는 **3축이 모두 참일 때만** 참이다(§3.10.19 E19-11, 적대 검수
//    critical 2건이 지목한 자리). 한 축이라도 빠지면 표기와 청구가 갈린다:
//    ① 리포트 축 hasBasic — 캐시 단락은 PassageAnalysis(파생 캐시)만 보고 응답하고
//       PassageReport(PRIME, = 사용자가 말하는 "학습지")는 만들지 않는다. 리포트가
//       없으면 캐시를 써도 학습지가 안 생기므로 "무과금"이 아니라 "무산출"이었다.
//       (실DB 표본 400개 중 208개가 이 상태였고 실제 POST 로 재현 확인 → 라우트를
//        E19-11 로 고쳐 리포트 부재 시 단락하지 않게 했다. 여기서도 같은 축을 본다.)
//    ② 과목 축 !korean — 국어 지문은 KO 게이트(route.ts:410-425)가 캐시 조회
//       **이전에** 무조건 5크레딧을 청구하고 자기완결 return 한다. 국어 basic 은
//       구조적으로 무과금이 불가능하다 — 「추가 비용 없음」은 거짓 견적이 된다.
//    ③ 캐시 축 — contentHash 일치 + 부분분석 아님 + 톤 호환.
// ============================================================================

export interface StudioSheetState {
  passageId: string;
  /** 국어 지문 — practice·final 불가(라우트가 400) */
  korean: boolean;
  /** 활성 분석 잡 존재 — 발사 제외 */
  analyzing: boolean;
  /** PRIME 행 보유(기본 학습지 존재) — 덮어쓰기 경고·basicCached 판정 재료 */
  hasBasic: boolean;
  /** PRIME_FINAL 행 보유(파이널 존재) — 덮어쓰기 경고 재료 */
  hasFinal: boolean;
  /** basic 재요청이 캐시 단락으로 **무과금**인가(정확한 견적 — 추정 금지) */
  basicCached: boolean;
}

/** 캐시 데이터에 박힌 톤 마커 — fast 라우트 getAnalysisTone(126-130) 미러.
 *  (라우트가 모듈 export 를 하지 않아 3벌째 복제본 — 술어는 자구 동일.) */
function analysisToneOf(value: unknown): AnalysisTone | null {
  if (!value || typeof value !== "object") return null;
  const raw = (value as Record<string, unknown>)._analysisTone;
  return typeof raw === "string" ? normalizeAnalysisTone(raw) : null;
}

export async function getStudioSheetStates(input: {
  passageIds: string[];
}): Promise<StudioActionResult<StudioSheetState[]>> {
  try {
    const staff = await requireStaffAuth();
    const ids = [...new Set(input.passageIds)].filter(
      (v): v is string => typeof v === "string" && v.length > 0,
    );
    if (ids.length === 0) return { success: true, data: [] };
    // 상한은 getStudioPassageSectionStates 와 동일 — 두 배치 조회가 갈리면
    // 같은 선택이 한쪽에서만 막힌다.
    if (ids.length > 50) {
      return { success: false, error: "한 번에 50개까지 선택할 수 있습니다." };
    }

    const [passages, primeReports, finalReports, activeJobs] = await Promise.all([
      prisma.passage.findMany({
        where: { id: { in: ids }, academyId: staff.academyId },
        select: {
          id: true,
          subject: true,
          content: true,
          analysis: { select: { analysisData: true, contentHash: true } },
        },
      }),
      // ⚠ pages 를 **절대 select 하지 않는다**(§12 슬림 응답 — 이 파일 9행이 스스로
      // 세운 계약). 초판은 실전 보유(hasPractice) 판정을 위해 PRIME pages 를 최대
      // 100행 끌어왔는데, 정작 그 필드의 소비처가 0이었다(적대 검수 major ×2).
      // 지문 50개 × 수 MB Json 을 무보상으로 나르던 것이라 필드째 폐기하고 질의는
      // 마커 존재 여부(스칼라 1필드)로 강등했다.
      prisma.passageReport.findMany({
        where: {
          passageId: { in: ids },
          academyId: staff.academyId,
          generationPlan: PRIME_REPORT_MARKER,
          deletedAt: null,
        },
        take: 100,
        select: { passageId: true },
      }),
      prisma.passageReport.findMany({
        where: {
          passageId: { in: ids },
          academyId: staff.academyId,
          generationPlan: FINAL_REPORT_MARKER,
          deletedAt: null,
        },
        take: 100,
        select: { passageId: true },
      }),
      prisma.workbenchAiJob.findMany({
        where: {
          passageId: { in: ids },
          academyId: staff.academyId,
          domain: "PASSAGE_ANALYSIS",
          status: { in: ["PENDING", "PROCESSING"] },
          deletedAt: null,
        },
        select: { passageId: true },
      }),
    ]);

    const analyzingSet = new Set(
      activeJobs.map((j) => j.passageId).filter((v): v is string => !!v),
    );
    // 보유 판정은 **행 존재**로 강등한다(pages 파싱 폐기 — 위 질의 주석).
    const primeSeen = new Set(primeReports.map((r) => r.passageId));
    const finalSeen = new Set(finalReports.map((r) => r.passageId));

    const rows: StudioSheetState[] = passages.map((p) => {
      const korean = isKoreanPassage(p);
      const hasBasic = primeSeen.has(p.id);
      // 캐시 단락 3축(위 헤더 주석 ①②③) — 하나라도 빠지면 표기와 청구가 갈린다.
      //   ① hasBasic  : PRIME 행이 없으면 라우트가 단락하지 않는다(E19-11 수정 후).
      //   ② !korean   : KO 게이트가 캐시 조회 이전에 무조건 청구하고 return 한다.
      //   ③ 캐시 술어 : contentHash 일치 && !부분분석 && 톤 호환
      //                (스튜디오는 STANDARD·기본 톤으로만 발사하므로 plan 분기는 항상 통과).
      let basicCached = false;
      if (
        !korean &&
        hasBasic &&
        p.analysis &&
        p.analysis.contentHash === hashContent(p.content)
      ) {
        try {
          const cached: unknown = JSON.parse(p.analysis.analysisData);
          const tone = analysisToneOf(cached);
          basicCached =
            !isPartialAnalysisData(cached) &&
            (tone === null || tone === DEFAULT_ANALYSIS_TONE);
        } catch {
          basicCached = false; // 파싱 불가 = 캐시 못 씀(서버도 같은 결론)
        }
      }
      return {
        passageId: p.id,
        korean,
        analyzing: analyzingSet.has(p.id),
        hasBasic,
        hasFinal: finalSeen.has(p.id),
        basicCached,
      };
    });

    return { success: true, data: rows };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "지문 상태를 불러오지 못했습니다.",
    };
  }
}
