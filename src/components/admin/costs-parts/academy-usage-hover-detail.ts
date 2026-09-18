import { detailFields, type AdminDetail } from "@/lib/admin-detail-types";
import { formatCurrency as won, formatNumber as num } from "@/lib/utils";

// 원가 분석 학원별/회원별 사용량 행 → 호버 상세. 목록에 실려 온 값만 쓴다(추가 조회 없음).

type AcademyUsageRowLike = {
  academyId: string | null;
  name: string;
  directorName: string | null;
  directorEmail: string | null;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  costKrw: number;
};

export function academyUsageRowDetail(
  row: AcademyUsageRowLike,
  variableCostKrw: number,
  summaryLabel: string,
): AdminDetail {
  const tokens = row.inputTokens + row.outputTokens;
  const ratio = Math.min(100, (row.costKrw / Math.max(variableCostKrw, 1)) * 100);
  return {
    title: row.name,
    subtitle: row.academyId
      ? `${summaryLabel} API 원가 · 클릭하면 거래 이력이 열립니다`
      : `${summaryLabel} API 원가 · 학원 미지정 호출`,
    fields: detailFields([
      ["학원", row.name],
      ["원장", row.directorName],
      ["원장 이메일", row.directorEmail],
      ["원가", won(row.costKrw)],
      ["USD", `$${row.costUsd.toFixed(4)}`],
      ["변동원가 중 비중", `${Math.round(ratio * 10) / 10}%`],
      ["API 호출", `${num(row.calls)}회`],
      ["입력 토큰", num(row.inputTokens)],
      ["출력 토큰", num(row.outputTokens)],
      ["호출당 평균 원가", row.calls > 0 && won(row.costKrw / row.calls)],
      ["호출당 평균 토큰", row.calls > 0 && num(Math.round(tokens / row.calls))],
      ["1K 토큰당 원가", tokens > 0 && won((row.costKrw / tokens) * 1000)],
    ]),
  };
}
