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
  PRACTICE_REPORT_MARKER,
  PRIME_REPORT_MARKER,
  PRIME_REPORT_MARKERS,
} from "@/actions/workbench/passage-constants";
import { requireStaffAuth } from "@/lib/auth";
// [E30 §3-2] 견적 단가는 **청구 라우트와 같은 함수**에서만 나온다(E19-2 계약).
// 여기서 5/10 을 리터럴로 쓰면 상수가 바뀌는 날 표기와 청구가 조용히 갈린다.
import { getPracticeSheetCreditCost } from "@/lib/passage-analysis-credit-costs";
import {
  DEFAULT_ANALYSIS_TONE,
  isPartialAnalysisData,
  normalizeAnalysisTone,
  type AnalysisTone,
} from "@/lib/passage-analysis-options";
import { isKoreanPassage } from "@/lib/passage-report/analysis-report/ko-entry";
import { hashContent } from "@/lib/passage-utils";
import { prisma } from "@/lib/prisma";
import { cleanupStaleWorkbenchAiJobs } from "@/lib/workbench-ai-job-stale-cleanup";
import type { StudioActionResult } from "./classes";

export interface StudioClassWorksheetRow {
  reportId: string;
  passageId: string;
  passageTitle: string;
  title: string;
  /** "DRAFT" | "PUBLISHED" | "ARCHIVED" — DB 컬럼은 String(schema 주석 계약) */
  status: string;
  /** PRIME | PRIME_KO | PRIME_FINAL | PRIME_PRACTICE — 뷰의 종류 배지 재료.
   *  ⚠ 원문 마커를 화면에 그대로 쓰지 마라 — 배지 자구 정본은
   *  `lib/studio/sheet-products.ts` 의 SHEET_PLAN_LABEL 한 곳뿐이다(E30 §4-1). */
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
/** 리포트 방어 상한 — 지문당 다중 행이 가능해 링크 상한보다 크다(아래 질의 주석).
 *
 *  ⚠ [E30 §1-6] 마커 집합이 3종 → **4종**(PRIME_PRACTICE 가입)이 됐다. 값은 **900 유지**다
 *  (스펙 §1-6 이 명시 — 여기서 임의로 올리지 않는다). 다만 **여유분 산술은 정정한다**:
 *    · 지문 1건의 동시 마커 상한은 과목 배타라 「영어 3종(PRIME·PRIME_PRACTICE·PRIME_FINAL)」
 *      또는 「국어 1종(PRIME_KO)」 중 하나다.
 *    · E30 **이전** 최악 = 300 × 2(PRIME+FINAL) = 600 → 여유 300.
 *    · E30 **이후** 최악 = 300 × 3            = 900 → 여유 **0**.
 *  즉 실전 가입이 이 상한의 여유를 전부 먹었다. 900행이 정확히 차는 순간
 *  `take` 는 900건을 온전히 돌려주므로 **데이터 손실은 없지만**, 아래 truncated 판정이
 *  `>= REPORT_TAKE` 라서 **잘리지 않았는데 「목록이 잘렸다」 각주가 뜬다**(거짓 경보).
 *  실제 도달 조건은 「한 클래스에 링크 300건 × 전원이 기본+실전+파이널 3장 보유」라
 *  현재 프로덕션(PRIME 617 · PRIME_FINAL 6 · PRIME_PRACTICE 0)에서는 멀지만,
 *  실전이 팔리기 시작하면 3장 보유 지문이 정확히 이 축을 채운다.
 *  → 올릴 때는 **truncated 판정식과 함께** 올려라. 한쪽만 만지면 조용한 거짓말이 남는다. */
const REPORT_TAKE = 900;

/** 상태 배치 조회의 진짜 상한(E29-3) — 클래스 링크 상한과 같은 축을 쓴다. */
const STATE_BATCH_MAX = CLASS_LINK_TAKE;
/** 한 번에 던지는 `in` 목록 크기 — 구판의 하드 상한 50 을 청크 크기로 강등했다. */
const STATE_BATCH_CHUNK = 50;

export async function listStudioClassWorksheets(input: {
  classId: string;
}): Promise<
  // `truncated` 는 E24 신설 **additive** 필드다. 기존 소비처는 무개변이어야 하므로
  // rows 의 자리·이름·의미는 손대지 않는다.
  //
  // [RCA-FINAL-ONEPAGE §4 처방 #24 · RC-4] `reason` 도 additive 다. 「만들었는데
  // 조판 목록에 없다」의 실체 절반은 **클래스 링크 부재**였다(1618학원 실측: 리포트
  // 생성 → 최초 링크까지 17분 47초 invisible / 호랑이학원은 링크 0으로 영구 invisible).
  // PassageReport 에는 클래스 관계가 없어 링크가 0이면 리포트가 아무리 멀쩡해도 이 방에서는
  // 존재하지 않는 문서다 — 그런데 화면은 그 사실을 말하지 않고 그냥 빈 목록을 그렸다.
  // ⚠ `truncated` 와 달리 **옵셔널**로 두는 것이 안전하다: 소비처는 `rows.length === 0`
  // 일 때만 `reason === "no-class-links"` 로 **동등 비교**하므로 undefined 는 「그 사유가
  // 아님」이라는 정의된 값이다. truncated 는 정반대였다(불리언 각주 분기가 undefined 를
  // 만나면 조용히 죽어서 필수로 뒀다). 두 필드의 옵셔널리티가 갈린 이유가 이것이다.
  StudioActionResult<{
    rows: StudioClassWorksheetRow[];
    truncated: boolean;
    reason?: "no-class-links";
  }>
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
      // [#24] 「빈 목록」과 「이 클래스에 담긴 지문이 0개」는 사용자에게 전혀 다른
      // 사건이다(전자 = 학습지를 아직 안 만들었다 / 후자 = 지문 관리에서 먼저 담아야
      // 한다). 사유 없이는 조판 뷰가 이 둘을 가를 수 없어 「만들었는데 없어졌다」로
      // 읽히고, 그 오해는 문의가 아니라 **재생성**(=과금)으로 이어진다.
      return {
        success: true,
        data: { rows: [], truncated: false, reason: "no-class-links" },
      };
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
        // [E30 §1-6] 마커 집합이 4종이 되면서 지문당 동시 상한이 2 → **3**(영어
        // PRIME·PRIME_PRACTICE·PRIME_FINAL)으로 올랐다. 300×3 = 900 = REPORT_TAKE 라
        // **여유분이 0** 이다 — 위 REPORT_TAKE 머리주석의 정정된 산술을 읽어라.
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
  // ── [E30 §3-2] 실전 학습지 3필드(additive) ────────────────────────────────
  /** PRIME_PRACTICE **행** 보유(분리 문서 존재) — 덮어쓰기 경고 재료.
   *
   *  ⚠ 이것은 §1-4 D3-c 의 「이 지문이 실전을 보유했는가」 **읽기 합집합이 아니다.**
   *  합집합은 `(PRIME_PRACTICE 행) OR (PRIME 행 pages 의 learning-worksheet 가
   *  worksheet-grade)` 이고, 후자를 재려면 PRIME 의 `pages` 를 끌어와야 한다 —
   *  이 액션은 그것을 **계약으로 금지**한다(파일 9행 · 아래 primeReports 질의 주석).
   *  그래서 여기서는 **행 존재만** 본다. 결과적으로 레거시 병합본(실전이 PRIME 안에
   *  들어 있는 366건)에서는 `false` 가 나온다 — 그 지문에 실전을 다시 발사하면
   *  ◈5 로 분리 문서가 새로 생기고 부모는 D3-b 로 강등된다(정상 동선이며 손실 0).
   *  「이미 산 걸 또 판다」를 막아야 하는 축은 이 액션이 아니라 D3-c 가 지목한
   *  3곳(passages.ts:666·923 · dossier.ts:249)이고, 그 셋은 이미 pages 를 파싱 중이라
   *  새 질의 비용 0으로 합집합을 만든다. 이 비대칭을 지우려고 여기에 pages 를
   *  되살리지 마라 — 그게 정확히 적대 검수 major ×2 로 폐기된 초판이다. */
  hasPractice: boolean;
  /** 이 지문 1건에 실전을 발사할 때의 **실단가**(◈). 모달은 대상 지문의 이 값을
   *  단순 합산해 총액을 적는다 — `product.unitCost × 지문수` 로는 지문별 가변
   *  단가를 표현할 수 없다(§3-5).
   *  산식은 `getPracticeSheetCreditCost({ hasBasic })` **한 곳**이며 (c) 라우트의
   *  청구도 같은 함수를 읽는다. 표기와 청구가 같은 함수를 읽는 것이 E19-2 계약이다. */
  practiceUnitCost: number;
  /** 실전 발사가 탈 라우트 — `hasBasic ? "worksheet" : "fast"`.
   *  "worksheet" = (c) `POST /api/workbench/passage-reports/prime/{id}/worksheet`
   *                (부모 위에 자식 문서만 · ◈5)
   *  "fast"      = (b) `POST /api/workbench/ai-jobs/passage-analysis/fast`
   *                (기본+실전 한 트랜잭션 · ◈10)
   *
   *  ⚠ TOCTOU 는 **「실청구 ≤ 표기」 방향으로만** 어긋나게 설계돼 있다(§3-3):
   *   · 표기 ◈5 인데 그 사이 기본이 삭제 → (c) 가 404(과금 0). 과다청구 없음.
   *   · 표기 ◈10 인데 그 사이 기본이 생김 → (b) 가 ◈10 청구. 표기와 동일.
   *  그래서 이 값은 스냅숏이어도 안전하다 — 최종 판정은 언제나 라우트가 청구 직전에 한다. */
  practiceRoute: "fast" | "worksheet";
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
    // ── [E29-3] 선택 상한: 하드 실패 → **청크 조회** ─────────────────────────
    // 구판은 51개부터 `success:false` 를 돌려줬고, 모달은 그때 states 를 null 로
    // 둔 채 CTA 를 영구 비활로 잠갔다. 화면에 남는 유일한 조작 「다시 불러오기」는
    // **같은 ids 로 같은 질의를 반복**하므로 절대 성공할 수 없다 — 선택을 줄이라는
    // 안내조차 없어 사용자에겐 「학습지 생성이 고장났다」가 된다(적대 검수 critical).
    // 질의는 전부 인덱스된 `in` 이라 50개씩 나눠 돌리면 그만이다. 진짜 상한은
    // 클래스 링크 상한과 같은 축(300)으로 두고, 그 위에서만 **행동 가능한** 문구로 막는다.
    if (ids.length > STATE_BATCH_MAX) {
      return {
        success: false,
        error: `한 번에 ${STATE_BATCH_MAX}개까지 선택할 수 있습니다. 선택을 줄인 뒤 다시 눌러 주세요(현재 ${ids.length}개).`,
      };
    }
    // 좀비 PROCESSING 잡이 지문을 「분석 중」으로 붙잡아 발사 대상에서 빼는 것을
    // 막는다(E29-3). 쓰기 라우트는 전부 이 청소를 돌리는데 **읽기 액션만 빠져
    // 있었고**, 그 비대칭이 「파이널 CTA 를 눌러도 아무 일도 안 일어난다」의
    // 실측 원인이었다(1618학원에서 10~11분 락 관측). 청소기는 지문 스코프라
    // 비용이 작고, 살아 있는 잡은 6분/15분/2시간 규칙이 보호한다.
    await cleanupStaleWorkbenchAiJobs({
      academyId: staff.academyId,
      domain: "PASSAGE_ANALYSIS",
    }).catch((e) =>
      // 청소 실패가 상태 조회를 죽이면 안 된다 — 최악이어도 구판과 같은 동작이다.
      console.warn("[getStudioSheetStates] stale cleanup failed", e),
    );

    // [E29-3] `in` 목록을 STATE_BATCH_CHUNK 단위로 쪼개 돌린다. `take` 상한도
    // 청크마다 걸리므로 「지문 100개 중 앞 100행만」 같은 조용한 절단이 사라진다.
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += STATE_BATCH_CHUNK) {
      chunks.push(ids.slice(i, i + STATE_BATCH_CHUNK));
    }
    const flat = <T,>(xs: T[][]): T[] => xs.flat();
    const [passages, primeReports, finalReports, practiceReports, activeJobs] =
      await Promise.all([
        Promise.all(
          chunks.map((chunk) =>
            prisma.passage.findMany({
              where: { id: { in: chunk }, academyId: staff.academyId },
              select: {
                id: true,
                subject: true,
                content: true,
                analysis: { select: { analysisData: true, contentHash: true } },
              },
            }),
          ),
        ).then(flat),
        // ⚠ pages 를 **절대 select 하지 않는다**(§12 슬림 응답 — 이 파일 9행이 스스로
        // 세운 계약). 초판은 실전 보유(hasPractice) 판정을 위해 PRIME pages 를 최대
        // 100행 끌어왔는데, 정작 그 필드의 소비처가 0이었다(적대 검수 major ×2).
        // 지문 50개 × 수 MB Json 을 무보상으로 나르던 것이라 필드째 폐기하고 질의는
        // 마커 존재 여부(스칼라 1필드)로 강등했다.
        //
        // [E30 §3-2] `hasPractice` 축이 여기서 **되살아났다** — 단, 그때와 정반대
        // 방식으로다. 실전이 이제 **자기 행**(PRIME_PRACTICE)을 갖게 됐으므로
        // 「PRIME 의 pages 를 파싱해 worksheet-grade 인지 본다」가 아니라 아래
        // practiceReports 처럼 **행 존재(스칼라 1필드)** 로 판정한다. 이것이 분리
        // 설계를 정당화하는 가장 강한 코드적 근거다 — 폐기됐던 기능이 계약을
        // 어기지 않고 돌아왔다. **여기에 pages 를 다시 select 하지 마라.**
        Promise.all(
          chunks.map((chunk) =>
            prisma.passageReport.findMany({
              where: {
                passageId: { in: chunk },
                academyId: staff.academyId,
                generationPlan: PRIME_REPORT_MARKER,
                deletedAt: null,
              },
              take: 100,
              select: { passageId: true },
            }),
          ),
        ).then(flat),
        Promise.all(
          chunks.map((chunk) =>
            prisma.passageReport.findMany({
              where: {
                passageId: { in: chunk },
                academyId: staff.academyId,
                generationPlan: FINAL_REPORT_MARKER,
                deletedAt: null,
              },
              take: 100,
              select: { passageId: true },
            }),
          ),
        ).then(flat),
        // [E30 §3-2] 실전 학습지 보유 — 바로 위 finalReports 질의의 **정확한 복제**다
        // (마커 상수 1개만 다르다). 일부러 복제한다: 세 질의가 같은 모양이어야
        // 「파이널은 되는데 실전만 안 보인다」류의 비대칭 결함이 눈으로 잡힌다.
        // ⚠ 단수 마커(PRACTICE_REPORT_MARKER)로 조회한다 — PRIME_REPORT_MARKERS
        // 집합으로 조회하면 기본·국어·파이널까지 섞여 hasPractice 가 전부 참이 된다.
        Promise.all(
          chunks.map((chunk) =>
            prisma.passageReport.findMany({
              where: {
                passageId: { in: chunk },
                academyId: staff.academyId,
                generationPlan: PRACTICE_REPORT_MARKER,
                deletedAt: null,
              },
              take: 100,
              select: { passageId: true },
            }),
          ),
        ).then(flat),
        Promise.all(
          chunks.map((chunk) =>
            prisma.workbenchAiJob.findMany({
              where: {
                passageId: { in: chunk },
                academyId: staff.academyId,
                domain: "PASSAGE_ANALYSIS",
                status: { in: ["PENDING", "PROCESSING"] },
                deletedAt: null,
              },
              select: { passageId: true },
            }),
          ),
        ).then(flat),
      ]);

    const analyzingSet = new Set(
      activeJobs.map((j) => j.passageId).filter((v): v is string => !!v),
    );
    // 보유 판정은 **행 존재**로 강등한다(pages 파싱 폐기 — 위 질의 주석).
    const primeSeen = new Set(primeReports.map((r) => r.passageId));
    const finalSeen = new Set(finalReports.map((r) => r.passageId));
    const practiceSeen = new Set(practiceReports.map((r) => r.passageId));

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
        hasPractice: practiceSeen.has(p.id),
        // [E30 §3-2 · §3-3] 단가와 라우트는 **같은 hasBasic 한 값**에서 파생한다.
        // 두 필드를 서로 다른 술어로 계산하면 「◈5 라고 적고 ◈10 을 청구하는」
        // 조합이 만들어진다 — 표기·라우팅·청구가 갈리는 정확한 지점이다(E19-2).
        practiceUnitCost: getPracticeSheetCreditCost({ hasBasic }),
        //   hasBasic  → (c) worksheet 라우트 = 부모 위에 자식 문서만(◈5)
        //   !hasBasic → (b) fast 라우트 = 기본+실전 한 트랜잭션(◈10)
        // ⚠ 국어 지문은 hasBasic 이 구조적으로 false 다(primeReports 가 단수 "PRIME"
        //   조회라 PRIME_KO 를 세지 않는다) → 여기서 "fast"/◈10 이 나온다. 그러나
        //   국어는 상품 자체가 잠겨 있어(sheet-products koreanSupported:false +
        //   worksheet 라우트 400) 이 값이 청구로 이어지는 경로가 없다 — 이중 안전(§P7).
        practiceRoute: hasBasic ? "worksheet" : "fast",
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
