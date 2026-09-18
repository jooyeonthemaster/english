import { detailFields, type AdminDetail } from "@/lib/admin-detail-types";
import type { ActivityItem } from "@/lib/admin-activity-types";
import { formatDateTime } from "@/lib/utils";

// 활동 타임라인 행 → 호버 상세. 목록에 실려 온 값만 쓴다(추가 조회 없음).
// metadata 는 서버가 SUPER_ADMIN 에게만 채워 보내므로(SUPPORT 는 null) 여기서는 있을 때만 요약한다.

const SOURCE_LABELS: Record<string, string> = {
  app_events: "앱 이벤트(페이지·로그인·내보내기)",
  extraction_jobs: "자료 추출 작업",
  workbench_ai_jobs: "워크벤치 AI 작업",
  similar_exam_generation_jobs: "동형 시험지 생성",
  similar_question_generation_jobs: "동형 문제 생성",
  custom_question_generation_jobs: "커스텀 문제 생성",
  passages: "지문",
  exams: "시험지",
  passage_reports: "학습지",
};

const STATUS_LABELS: Record<string, string> = {
  SUCCESS: "성공",
  FAILED: "실패",
  PENDING: "진행중",
  INFO: "기록",
};

const META_MAX_KEYS = 12;
const META_MAX_VALUE = 80;
// 혹시 섞여 들어온 민감 값은 표시하지 않는다.
const SENSITIVE_KEY = /token|secret|password|passwd|cookie|authorization|apikey|api_key/i;

function metaValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  const raw =
    typeof value === "string"
      ? value
      : typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : Array.isArray(value)
          ? `[${value.length}개] ${JSON.stringify(value)}`
          : JSON.stringify(value);
  const oneLine = (raw ?? "").replace(/\s+/g, " ").trim();
  return oneLine.length > META_MAX_VALUE ? `${oneLine.slice(0, META_MAX_VALUE)}…` : oneLine;
}

/** metadata → "키: 값" 몇 줄의 읽기 쉬운 요약(긴 JSON 은 잘라낸다). */
function metadataSummary(metadata: Record<string, unknown> | null): string | null {
  if (!metadata) return null;
  const entries = Object.entries(metadata).filter(
    ([k, v]) => v !== null && v !== undefined && v !== "" && !SENSITIVE_KEY.test(k),
  );
  if (entries.length === 0) return null;
  const lines = entries.slice(0, META_MAX_KEYS).map(([k, v]) => `${k}: ${metaValue(v)}`);
  if (entries.length > META_MAX_KEYS) lines.push(`… 외 ${entries.length - META_MAX_KEYS}개 항목`);
  return lines.join("\n");
}

export function activityRowDetail(item: ActivityItem): AdminDetail {
  return {
    title: item.title,
    subtitle: `${item.categoryLabel} · ${formatDateTime(item.createdAt)}`,
    fields: detailFields([
      ["상세 내용", item.detail, true],
      ["학원", item.academyName],
      ["행위자", item.actorName],
      ["분류", item.categoryLabel],
      ["상태", STATUS_LABELS[item.status] ?? item.status],
      ["일시", formatDateTime(item.createdAt)],
      ["출처", SOURCE_LABELS[item.source] ?? item.source],
      ["활동 제목", item.title, true],
      ["메타데이터", metadataSummary(item.metadata), true],
    ]),
  };
}
