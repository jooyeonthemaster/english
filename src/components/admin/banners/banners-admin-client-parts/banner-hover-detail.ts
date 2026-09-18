import { detailFields, type AdminDetail } from "@/lib/admin-detail-types";
import { AUDIENCE_LABELS, DISMISS_MODES, getTemplate } from "@/lib/site-banners/templates";
import type { AdminBannerDto } from "@/actions/admin-banners";
import { formatDateTime } from "@/lib/utils";

// 앱 배너 목록 행 → 호버/클릭 상세. 목록에 이미 실려 온 값만 쓴다(추가 조회 없음).

const dt = (v: string | null) => (v ? formatDateTime(v) : null);
const clip = (v: string, max = 300) => (v.length > max ? `${v.slice(0, max)}…` : v);

export function bannerRowDetail(banner: AdminBannerDto): AdminDetail {
  const template = getTemplate(banner.templateKey);
  // 템플릿 필드 순서·라벨대로 문구를 나열하고, 스키마에 없는 키는 키 이름으로 붙인다.
  const known = new Set(template?.fields.map((f) => f.key) ?? []);
  const contentEntries: [string, string, boolean][] = [
    ...(template?.fields ?? []).map(
      (f) => [f.label, banner.content[f.key] ?? "", f.type === "textarea"] as [string, string, boolean],
    ),
    ...Object.entries(banner.content)
      .filter(([k]) => !known.has(k))
      .map(([k, v]) => [k, v, v.length > 40] as [string, string, boolean]),
  ].filter(([, v]) => v.trim() !== "");

  const targets = banner.targetAcademyIds;
  return {
    title: banner.title,
    subtitle: `${banner.type === "IMAGE" ? "이미지 배너" : (template?.name ?? "템플릿 배너")} · ${banner.isActive ? "노출 중" : "비활성"}`,
    fields: detailFields([
      ...contentEntries.map(([label, v, wide]) => [label, clip(v), wide] as [string, string, boolean]),
      ["이미지 대체텍스트", banner.imageAlt],
      ["클릭 링크", banner.linkUrl, true],
      ["우선순위", String(banner.priority)],
      ["대상 역할", banner.audiences.map((a) => AUDIENCE_LABELS[a]).join("·") || "대상 없음"],
      [
        "노출 범위",
        banner.targetMode === "SPECIFIC" ? `특정 대상 ${targets.length}곳` : "전체 노출",
      ],
      ["닫기 방식", DISMISS_MODES.find((m) => m.value === banner.dismissMode)?.label ?? banner.dismissMode],
      ["닫기 버튼", banner.showDismissButton ? "표시" : "숨김"],
      ["저크레딧 자동노출", banner.autoOpenOnLowCredit && "켜짐"],
      ["노출 시작", dt(banner.startsAt) ?? "상시"],
      ["노출 종료", dt(banner.endsAt) ?? "상시"],
      ["생성", dt(banner.createdAt)],
      ["최근 수정", dt(banner.updatedAt)],
    ]),
    sections:
      banner.targetMode === "SPECIFIC" && targets.length > 0
        ? [
            {
              title: `대상 학원 ID (${targets.length})`,
              columns: [{ key: "id", label: "학원 ID", wide: true }],
              rows: targets.map((id) => ({ id })),
            },
          ]
        : undefined,
  };
}
