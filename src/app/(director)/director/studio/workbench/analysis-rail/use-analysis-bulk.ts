"use client";

// ============================================================================
// 레일 리포트 생성·링크 일괄 작업 훅 — 콘솔(use-analysis-console) 종속 모듈
// (v4, 26-09-02). 정본: docs/exam-analysis-v4-spec.md §2.5(U5 행) · §3 U5-4
//
// 콘솔 500줄 상한 때문에 「리포트 생성(단건·일괄)·답안 링크 일괄·공유 링크 일괄·
// 공유 표 복사」를 이리로 뺐다. 상태 소유는 여전히 셸 1인스턴스 — 콘솔이 1회
// 호출해 AnalysisConsoleApi 로 합친다(aside·드로어 2중 마운트에도 in-flight 1벌).
//
// 계약:
// · 리포트 생성 POST 는 동기 장기 실행(maxDuration 300) — in-flight 를 셸 수명에
//   둬 아코디언을 닫거나 뷰를 떠나도 완료 핸들러가 유실되지 않는다(V1-m4).
//   generatingRef 가 동기 중복 판정의 진실(동시 2 워커가 같은 setState 스냅샷을
//   보고 한 학생을 두 번 쏘지 않도록) — state 는 렌더용 미러.
// · 일괄 생성은 **동시 2, 402 즉시 중단**(잔여 수 안내는 호출부). 시작 시 대상
//   전원을 GENERATING 으로 낙관 패치해 다음 단계 블록이 「리포트 생성 중」으로
//   수렴하고, 끝에 refreshDetail 로 서버 진실(미착수분 NONE 복원)에 맞춘다.
// · 답안·공유 링크 일괄은 **순차**(enableAnswerLink/enableExamReportShare 는 학생
//   단위 서버 액션 — 부분 성공을 issued/failed 로 나눠 반환). 이름은 호출부가
//   detail.students 로 만든 names(id→이름) 를 additive 2번째 인자로 넘긴다 —
//   콘솔은 detail 을 들고 있지 않고(useAnalysisConsole 시그니처 불변 §2.5) 상세
//   전체를 이름 때문에 재GET 하지 않는다(U5-correctness-8). 이름을 모르면 빈
//   칸 — 내부 id 를 학부모용 표에 싣지 않는다(missingNames 로 호출부가 알린다).
// · copyShareTable 은 rows 를 받으면 그 행으로 필터(상세 재GET 0), 없을 때만
//   상세 1회. 클립보드 성공 여부를 { table, copied } 로 돌려준다(무음 실패 금지).
// · 표 형식: 1행 「이름\t링크」 헤더 + 「이름\tURL」 행(스프레드시트 붙여넣기용).
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { enableAnswerLink, enableExamReportShare } from "@/actions/exam-report";
import type {
  ExamAnalysisDetail,
  ExamAnalysisStudentRow,
  ExamStudentDetail,
} from "@/components/exam-report/ui-contracts";

export interface LinkTableRow {
  name: string;
  url: string;
}

/** 「이름\t링크」 헤더 + 「이름\tURL」 행 — 시트 붙여넣기용 탭 구분 표. */
export function buildLinkTable(rows: ReadonlyArray<LinkTableRow>): string {
  return ["이름\t링크", ...rows.map((r) => `${r.name}\t${r.url}`)].join("\n");
}

export function answerLinkUrl(token: string): string {
  return `${window.location.origin}/a/${token}`;
}

export function shareLinkUrl(token: string): string {
  return `${window.location.origin}/r/${token}`;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export interface IssueLinksResult {
  issued: string[];
  failed: string[];
  table: string;
  /** names 에 없어 이름 칸이 빈 행 수 — 호출부 토스트 「(이름 없이 복사됨)」 */
  missingNames: number;
}
export interface GenerateBulkResult {
  started: string[];
  stoppedBy402: boolean;
}
export interface EnableSharesResult {
  enabled: string[];
  failed: string[];
  table: string;
  missingNames: number;
}
export interface CopyShareTableResult {
  /** "" = 공유 켜진 학생 0명(또는 토큰 전원 미판독) */
  table: string;
  copied: boolean;
}

export interface AnalysisBulkDeps {
  analysisId: string | null;
  patchStudent: (studentId: string, partial: Partial<ExamStudentDetail>) => void;
  patchDetailStudent: (
    studentId: string,
    partial: Partial<ExamAnalysisStudentRow>,
  ) => void;
  loadStudent: (studentId: string, force?: boolean) => void;
  /** 학생 단건 캐시 판독(공유 토큰 재사용 — 있으면 GET 생략) */
  cachedStudent: (studentId: string) => ExamStudentDetail | null;
  refreshDetail: () => void;
}

export interface AnalysisBulkApi {
  generateReport: (studentId: string) => void;
  generatingIds: ReadonlySet<string>;
  issueAnswerLinksBulk: (
    studentIds: string[],
    names?: ReadonlyMap<string, string>,
  ) => Promise<IssueLinksResult>;
  generateReportsBulk: (studentIds: string[]) => Promise<GenerateBulkResult>;
  enableSharesBulk: (
    studentIds: string[],
    names?: ReadonlyMap<string, string>,
  ) => Promise<EnableSharesResult>;
  copyShareTable: (
    rows?: ReadonlyArray<ExamAnalysisStudentRow>,
  ) => Promise<CopyShareTableResult>;
}

/** 이름 판독 — 모르면 빈 칸(id 노출 금지). missing 카운터는 호출부 보고용. */
function nameCell(
  names: ReadonlyMap<string, string> | undefined,
  id: string,
): { name: string; missing: boolean } {
  const name = names?.get(id);
  return name ? { name, missing: false } : { name: "", missing: true };
}

type GenerateOutcome = "ok" | "402" | "409" | "error";

const BULK_GENERATE_CONCURRENCY = 2;
const SHARE_READ_CONCURRENCY = 3;

export function useAnalysisBulk(deps: AnalysisBulkDeps): AnalysisBulkApi {
  const {
    analysisId,
    patchStudent,
    patchDetailStudent,
    loadStudent,
    cachedStudent,
    refreshDetail,
  } = deps;

  const [generating, setGenerating] = useState<ReadonlySet<string>>(new Set());
  const generatingRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    generatingRef.current = new Set();
    setGenerating(new Set());
  }, [analysisId]);

  const markGenerating = useCallback((studentId: string, on: boolean) => {
    if (on) generatingRef.current.add(studentId);
    else generatingRef.current.delete(studentId);
    setGenerating(new Set(generatingRef.current));
  }, []);

  /** 상세 GET 1회 — copyShareTable 이 rows 를 못 받았을 때의 폴백. 실패 시 빈 배열. */
  const fetchDetailRows = useCallback(async (): Promise<
    ExamAnalysisStudentRow[]
  > => {
    if (!analysisId) return [];
    try {
      const res = await fetch(`/api/exam-report/analyses/${analysisId}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { analysis?: ExamAnalysisDetail };
      return data.analysis?.students ?? [];
    } catch {
      return [];
    }
  }, [analysisId]);

  // ── 리포트 생성 1건 — 단건(토스트·재페치 즉시)과 일괄(quiet) 공용 ─────────
  const runGenerate = useCallback(
    async (studentId: string, quiet: boolean): Promise<GenerateOutcome> => {
      if (generatingRef.current.has(studentId)) return "409";
      markGenerating(studentId, true);
      patchStudent(studentId, { reportStatus: "GENERATING" });
      patchDetailStudent(studentId, { reportStatus: "GENERATING" });
      let outcome: GenerateOutcome = "error";
      try {
        const res = await fetch(
          `/api/exam-report/students/${studentId}/generate`,
          { method: "POST", credentials: "include" },
        );
        if (res.ok) {
          outcome = "ok";
          if (!quiet) toast.success("리포트가 완성됐어요.");
        } else if (res.status === 402) {
          outcome = "402";
          if (!quiet)
            toast.error("크레딧이 부족합니다. 크레딧 관리에서 충전해 주세요.");
        } else if (res.status === 409) {
          // 이미 생성 중(다른 탭·중복 클릭) — 재페치로 수렴만.
          outcome = "409";
        } else {
          const data = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          if (!quiet) toast.error(data?.error ?? "리포트 생성에 실패했습니다.");
        }
      } catch {
        if (!quiet)
          toast.error("리포트 생성 요청에 실패했습니다. 네트워크를 확인해 주세요.");
      } finally {
        markGenerating(studentId, false);
        // detail.students 낙관 종결 — quiet(일괄) 경로는 끝까지 refreshDetail 이
        // 없어 블록 진행 바가 GENERATING 에 얼어붙는다(U5-correctness-8). 409 는
        // 다른 주체가 진행 중이라 손대지 않는다. 서버 진실은 아래 loadStudent +
        // 일괄 종료 refreshDetail 이 맞춘다.
        if (outcome === "ok")
          patchDetailStudent(studentId, { reportStatus: "GENERATED" });
        else if (outcome === "402" || outcome === "error")
          patchDetailStudent(studentId, { reportStatus: "FAILED" });
        // 성공·실패 공통 수렴 — 서버가 최종 reportStatus 의 단일 진실원.
        loadStudent(studentId, true);
        if (!quiet) refreshDetail();
      }
      return outcome;
    },
    [markGenerating, patchStudent, patchDetailStudent, loadStudent, refreshDetail],
  );

  const generateReport = useCallback(
    (studentId: string) => {
      void runGenerate(studentId, false);
    },
    [runGenerate],
  );

  const generateReportsBulk = useCallback(
    async (studentIds: string[]): Promise<GenerateBulkResult> => {
      const ids = studentIds.filter((id) => !generatingRef.current.has(id));
      const started: string[] = [];
      let stoppedBy402 = false;
      if (ids.length === 0) return { started, stoppedBy402 };
      // 대상 전원 낙관 GENERATING — 블록이 「리포트 생성 중」으로 즉시 수렴.
      for (const id of ids) patchDetailStudent(id, { reportStatus: "GENERATING" });
      const queue = [...ids];
      const worker = async () => {
        while (queue.length > 0 && !stoppedBy402) {
          const id = queue.shift();
          if (!id) break;
          const outcome = await runGenerate(id, true);
          if (outcome === "402") {
            stoppedBy402 = true;
            break;
          }
          if (outcome === "ok") started.push(id);
        }
      };
      await Promise.all(
        Array.from({ length: BULK_GENERATE_CONCURRENCY }, () => worker()),
      );
      // 미착수분의 낙관 GENERATING 을 서버 진실로 되돌린다(402 중단 포함).
      refreshDetail();
      return { started, stoppedBy402 };
    },
    [patchDetailStudent, runGenerate, refreshDetail],
  );

  // ── 답안 링크 일괄 발급(순차·부분 성공) ──────────────────────────────────
  const issueAnswerLinksBulk = useCallback(
    async (
      studentIds: string[],
      names?: ReadonlyMap<string, string>,
    ): Promise<IssueLinksResult> => {
      const issued: string[] = [];
      const failed: string[] = [];
      const lines: LinkTableRow[] = [];
      let missingNames = 0;
      for (const id of studentIds) {
        try {
          const { token } = await enableAnswerLink(id);
          patchStudent(id, { answerToken: token, answerEnabled: true });
          patchDetailStudent(id, { answerToken: token, answerEnabled: true });
          issued.push(id);
          const cell = nameCell(names, id);
          if (cell.missing) missingNames += 1;
          lines.push({ name: cell.name, url: answerLinkUrl(token) });
        } catch {
          failed.push(id);
        }
      }
      if (issued.length > 0) refreshDetail();
      return { issued, failed, table: buildLinkTable(lines), missingNames };
    },
    [patchStudent, patchDetailStudent, refreshDetail],
  );

  // ── 공유 링크 일괄 발급(순차·부분 성공) ──────────────────────────────────
  const enableSharesBulk = useCallback(
    async (
      studentIds: string[],
      names?: ReadonlyMap<string, string>,
    ): Promise<EnableSharesResult> => {
      const enabled: string[] = [];
      const failed: string[] = [];
      const lines: LinkTableRow[] = [];
      let missingNames = 0;
      for (const id of studentIds) {
        try {
          const { token } = await enableExamReportShare(id);
          patchStudent(id, { shareEnabled: true, shareToken: token });
          patchDetailStudent(id, { shareEnabled: true });
          enabled.push(id);
          const cell = nameCell(names, id);
          if (cell.missing) missingNames += 1;
          lines.push({ name: cell.name, url: shareLinkUrl(token) });
        } catch {
          failed.push(id);
        }
      }
      if (enabled.length > 0) refreshDetail();
      return { enabled, failed, table: buildLinkTable(lines), missingNames };
    },
    [patchStudent, patchDetailStudent, refreshDetail],
  );

  // ── 공유 켜진 전원 표 복사(읽기 전용 — 쓰기 액션 0) ──────────────────────
  // 학생별 shareToken GET 팬아웃(SHARE_READ_CONCURRENCY)은 유지 — 상세 행에 토큰이
  // 없어 API 변경 없인 못 줄인다(감독 보고 사항).
  const copyShareTable = useCallback(
    async (
      rowsArg?: ReadonlyArray<ExamAnalysisStudentRow>,
    ): Promise<CopyShareTableResult> => {
    const rows = rowsArg ?? (await fetchDetailRows());
    const shared = rows.filter(
      (r) => r.reportStatus === "GENERATED" && r.shareEnabled,
    );
    if (shared.length === 0) return { table: "", copied: false };
    const urlOf = new Map<string, string>();
    const queue = [...shared];
    const worker = async () => {
      while (queue.length > 0) {
        const r = queue.shift();
        if (!r) break;
        let token = cachedStudent(r.id)?.shareToken ?? null;
        if (!token) {
          try {
            const res = await fetch(`/api/exam-report/students/${r.id}`, {
              credentials: "include",
              cache: "no-store",
            });
            if (res.ok) {
              const data = (await res.json()) as { student?: ExamStudentDetail };
              token = data.student?.shareToken ?? null;
            }
          } catch {
            /* 해당 학생만 표에서 빠진다 — 호출부가 행 수로 알린다 */
          }
        }
        if (token) urlOf.set(r.id, shareLinkUrl(token));
      }
    };
    await Promise.all(
      Array.from({ length: SHARE_READ_CONCURRENCY }, () => worker()),
    );
    const lines: LinkTableRow[] = [];
    for (const r of shared) {
      const url = urlOf.get(r.id);
      if (url) lines.push({ name: r.studentName, url });
    }
    if (lines.length === 0) return { table: "", copied: false };
    const table = buildLinkTable(lines);
    const copied = await copyToClipboard(table);
    return { table, copied };
    },
    [fetchDetailRows, cachedStudent],
  );

  return {
    generateReport,
    generatingIds: generating,
    issueAnswerLinksBulk,
    generateReportsBulk,
    enableSharesBulk,
    copyShareTable,
  };
}
