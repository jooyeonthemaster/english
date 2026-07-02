/**
 * Site-banner shared metadata — pure module importable from BOTH server
 * (actions / API / validation) and client (admin editor + renderers).
 *
 * A banner is either an editable TEMPLATE (one of {@link BANNER_TEMPLATES}) or a
 * raw IMAGE. Templates declare a field schema so the admin editor can render a
 * generic form and the renderer can read typed content back out.
 *
 * Keep this free of React and of server-only imports.
 */

// ── Audiences ────────────────────────────────────────────────────────────────

export type BannerAudience = "DIRECTOR" | "TEACHER" | "STUDENT";

export const ALL_AUDIENCES: BannerAudience[] = ["DIRECTOR", "TEACHER", "STUDENT"];

export const AUDIENCE_LABELS: Record<BannerAudience, string> = {
  DIRECTOR: "원장",
  TEACHER: "강사",
  STUDENT: "학생",
};

/** Serialize an audience list to the comma-joined DB column form. */
export function serializeAudiences(list: BannerAudience[]): string {
  const seen = ALL_AUDIENCES.filter((a) => list.includes(a));
  return (seen.length ? seen : ["DIRECTOR"]).join(",");
}

/** Parse the comma-joined DB column back to a validated audience list. */
export function parseAudiences(value: string | null | undefined): BannerAudience[] {
  if (!value) return [];
  const tokens = value.split(",").map((t) => t.trim());
  return ALL_AUDIENCES.filter((a) => tokens.includes(a));
}

// ── Dismiss modes ────────────────────────────────────────────────────────────

export type BannerDismissMode = "DAILY" | "SESSION" | "ONCE" | "ALWAYS";

export const DISMISS_MODES: {
  value: BannerDismissMode;
  label: string;
  description: string;
}[] = [
  { value: "DAILY", label: "오늘 하루 보지 않기", description: "닫으면 그 날 하루 동안 다시 뜨지 않음" },
  { value: "SESSION", label: "이 세션만", description: "닫으면 탭을 닫기 전까지 다시 뜨지 않음" },
  { value: "ONCE", label: "다시 보지 않기", description: "한 번 닫으면 영구히 다시 뜨지 않음" },
  { value: "ALWAYS", label: "매번 노출", description: "닫아도 다음 진입 때 다시 뜸" },
];

/** Label for the explicit dismiss button; null when closing is always transient. */
export function dismissButtonLabel(mode: BannerDismissMode): string | null {
  switch (mode) {
    case "DAILY":
      return "오늘 하루 보지 않기";
    case "SESSION":
      return "그만 보기";
    case "ONCE":
      return "다시 보지 않기";
    case "ALWAYS":
    default:
      return null;
  }
}

// ── Banner type ──────────────────────────────────────────────────────────────

export type BannerType = "TEMPLATE" | "IMAGE";

// ── Template field schema ────────────────────────────────────────────────────

export interface TemplateField {
  key: string;
  label: string;
  type: "text" | "textarea" | "url" | "phone";
  placeholder?: string;
  required?: boolean;
  help?: string;
}

export interface BannerTemplateMeta {
  key: string;
  /** Admin-facing name. */
  name: string;
  description: string;
  fields: TemplateField[];
  defaultContent: Record<string, string>;
}

/**
 * Editable templates. To add one: define it here (field schema + defaults) and
 * register a renderer in `@/components/site-banners/template-renderers`.
 */
export const BANNER_TEMPLATES: BannerTemplateMeta[] = [
  {
    key: "announcement",
    name: "일반 공지",
    description: "제목·본문·버튼으로 구성된 기본 안내 모달. 대부분의 공지에 적합합니다.",
    fields: [
      { key: "eyebrow", label: "상단 태그", type: "text", placeholder: "공지" },
      { key: "heading", label: "제목", type: "text", required: true, placeholder: "새로운 기능이 출시되었어요" },
      { key: "body", label: "본문", type: "textarea", placeholder: "안내 내용을 입력하세요." },
      { key: "primaryLabel", label: "버튼 문구", type: "text", placeholder: "자세히 보기" },
      { key: "primaryUrl", label: "버튼 링크", type: "url", placeholder: "https://…", help: "비워두면 버튼이 표시되지 않습니다." },
    ],
    defaultContent: {
      eyebrow: "공지",
      heading: "새로운 소식을 확인하세요",
      body: "여기에 안내 내용을 입력하세요.",
      primaryLabel: "",
      primaryUrl: "",
    },
  },
  {
    key: "feedback-invite",
    name: "협업 피드백 초대",
    description: "오픈채팅방 + 전화 문의를 안내하는 2단계 모달(기존 협업 피드백 이벤트).",
    fields: [
      { key: "eyebrow", label: "상단 태그", type: "text" },
      { key: "heading", label: "제목", type: "text", required: true },
      { key: "kakaoUrl", label: "오픈채팅방 URL", type: "url", required: true, placeholder: "https://open.kakao.com/…" },
      { key: "phone", label: "연락처", type: "phone", required: true, placeholder: "010-0000-0000" },
      { key: "bonusLabel", label: "보너스 문구", type: "text", placeholder: "추가 무료 크레딧" },
      { key: "freeUntilLabel", label: "무료 종료일 라벨", type: "text", placeholder: "7월 1일" },
    ],
    defaultContent: {
      eyebrow: "협업 피드백 이벤트",
      heading: "함께 만드는 베타에 초대합니다",
      kakaoUrl: "https://open.kakao.com/o/g6H20Cwi",
      phone: "010-6811-1106",
      bonusLabel: "추가 무료 크레딧",
      freeUntilLabel: "7월 1일",
    },
  },
];

export function getTemplate(key: string | null | undefined): BannerTemplateMeta | undefined {
  if (!key) return undefined;
  return BANNER_TEMPLATES.find((t) => t.key === key);
}

/** Fill any missing template fields from the template's defaults. */
export function withTemplateDefaults(
  key: string | null | undefined,
  content: Record<string, unknown> | null | undefined,
): Record<string, string> {
  const tpl = getTemplate(key);
  const base = tpl ? { ...tpl.defaultContent } : {};
  const merged: Record<string, string> = { ...base };
  if (content) {
    for (const [k, v] of Object.entries(content)) {
      if (typeof v === "string") merged[k] = v;
    }
  }
  return merged;
}
