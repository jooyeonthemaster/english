// ============================================================================
// Notion 운영 알림 — 결제·문의 이벤트를 Notion 데이터베이스 페이지 1건으로 기록한다.
//
// 휴대폰 푸시는 Notion 앱이 보낸다. 페이지 본문에서 수신자를 @멘션하고(mention),
// "담당자"(Person) 속성에 수신자를 넣으면(people) Notion 인박스 알림이 생기고,
// 앱을 열어두지 않은 기기로 모바일 푸시가 간다(Notion 정책: 앱이 열려 있으면 배지만).
// 두 경로 모두 실제 휴대폰 푸시 도달을 확인했다(2026-09-17, 수신자 4명). 기본은 people —
// 이벤트당 알림 1건, "담당자" 칸으로 필터 가능. NOTION_NOTIFY_VIA 로 mention/both 선택.
// 토큰은 내부 연결(봇)이어야 한다 — 개인 액세스 토큰은 본인 명의라 자기 알림이 안 온다.
//
// DB 스키마는 scripts/notion-notify-setup.ts create-db 가 만든다.
// NOTION_PROPS 의 속성명을 바꾸면 기존 DB 속성명도 같이 바꿔야 한다.
//
// next/prisma 의존 없음 — 설정 스크립트에서도 그대로 import 한다.
// ============================================================================

export const NOTION_API_VERSION = "2022-06-28";
const NOTION_API_BASE = "https://api.notion.com/v1";
const REQUEST_TIMEOUT_MS = 8_000;
/** Notion rich_text 조각 하나의 상한은 2000자. */
const RICH_TEXT_CHUNK = 1_900;
/** 본문(문의 내용 등)은 앞부분만 싣는다 — 전문은 링크로 본다. */
const BODY_LIMIT = 3_000;
const DEFAULT_SITE_URL = "https://www.smoat.co.kr";

export const NOTION_PROPS = {
  title: "제목",
  kind: "구분",
  who: "학원·신청자",
  amount: "금액",
  assignee: "담당자",
  handled: "처리완료",
  occurredAt: "발생 시각",
  link: "링크",
} as const;

export type OpsEventKind =
  | "PAYMENT"
  | "DEPOSIT_REVIEW"
  | "INQUIRY"
  | "FEEDBACK"
  | "SEMINAR"
  | "REGISTRATION";

export const OPS_EVENT_KIND_META: Record<
  OpsEventKind,
  { label: string; emoji: string; color: string }
> = {
  PAYMENT: { label: "결제", emoji: "💳", color: "green" },
  DEPOSIT_REVIEW: { label: "입금 확인 필요", emoji: "⚠️", color: "red" },
  INQUIRY: { label: "문의", emoji: "💬", color: "blue" },
  FEEDBACK: { label: "피드백", emoji: "📣", color: "purple" },
  SEMINAR: { label: "세미나", emoji: "🎓", color: "orange" },
  REGISTRATION: { label: "사전예약", emoji: "📝", color: "yellow" },
};

export type OpsEventField = [label: string, value: string | number | null | undefined];

export interface OpsEvent {
  kind: OpsEventKind;
  /** 알림 목록·푸시에 보이는 한 줄. 핵심(금액·학원)을 앞에 둔다. */
  title: string;
  /** 학원명 또는 신청자 */
  who?: string | null;
  amount?: number | null;
  /** 본문 상세 — 값이 비면 그 줄은 생략 */
  fields?: OpsEventField[];
  /** 긴 본문(문의 내용 등) */
  body?: string | null;
  /** 관리자 화면 경로("/admin/...") 또는 절대 URL */
  link?: string | null;
  occurredAt?: Date | null;
}

export type NotionNotifyVia = "both" | "mention" | "people";

export interface NotionNotifyConfig {
  token: string;
  databaseId: string;
  /** 알림 받을 Notion 사용자 ID들 (person 타입만 가능) */
  userIds: string[];
  via: NotionNotifyVia;
}

export function getNotionNotifyConfig(): NotionNotifyConfig | null {
  const token = process.env.NOTION_NOTIFY_TOKEN?.trim();
  const databaseId = process.env.NOTION_NOTIFY_DATABASE_ID?.trim();
  if (!token || !databaseId) return null;
  const userIds = (process.env.NOTION_NOTIFY_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const rawVia = process.env.NOTION_NOTIFY_VIA?.trim();
  const via: NotionNotifyVia =
    rawVia === "mention" || rawVia === "both" ? rawVia : "people";
  return { token, databaseId, userIds, via };
}

export class NotionApiError extends Error {
  constructor(
    public status: number,
    public code: string | null,
    message: string,
  ) {
    super(message);
    this.name = "NotionApiError";
  }
}

export async function notionRequest<T = unknown>(
  token: string,
  path: string,
  init: { method?: "GET" | "POST" | "PATCH"; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(`${NOTION_API_BASE}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_API_VERSION,
      "Content-Type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const json = (await response.json().catch(() => null)) as
    | { code?: string; message?: string }
    | null;
  if (!response.ok) {
    throw new NotionApiError(
      response.status,
      json?.code ?? null,
      json?.message ?? `Notion API ${response.status}`,
    );
  }
  return json as T;
}

/** create-db 가 쓰는 속성 정의. NOTION_PROPS 와 짝. */
export function buildOpsDatabaseProperties() {
  return {
    [NOTION_PROPS.title]: { title: {} },
    [NOTION_PROPS.kind]: {
      select: {
        options: Object.values(OPS_EVENT_KIND_META).map((m) => ({
          name: m.label,
          color: m.color,
        })),
      },
    },
    [NOTION_PROPS.who]: { rich_text: {} },
    [NOTION_PROPS.amount]: { number: { format: "won" } },
    [NOTION_PROPS.assignee]: { people: {} },
    [NOTION_PROPS.handled]: { checkbox: {} },
    [NOTION_PROPS.occurredAt]: { date: {} },
    [NOTION_PROPS.link]: { url: {} },
  };
}

export async function createOpsEventPage(
  event: OpsEvent,
  config: NotionNotifyConfig,
): Promise<{ id: string; url: string }> {
  const meta = OPS_EVENT_KIND_META[event.kind];
  const mentionUsers = config.via !== "people" ? config.userIds : [];
  const assignUsers = config.via !== "mention" ? config.userIds : [];
  // 세미나 제목 등에 섞인 줄바꿈이 푸시 한 줄을 깨지 않게 공백으로 편다.
  const title = event.title.replace(/\s+/g, " ").trim();

  const properties: Record<string, unknown> = {
    [NOTION_PROPS.title]: { title: textChunks(title) },
    [NOTION_PROPS.kind]: { select: { name: meta.label } },
    [NOTION_PROPS.occurredAt]: {
      date: { start: (event.occurredAt ?? new Date()).toISOString() },
    },
  };
  if (event.who) properties[NOTION_PROPS.who] = { rich_text: textChunks(event.who) };
  if (typeof event.amount === "number") {
    properties[NOTION_PROPS.amount] = { number: event.amount };
  }
  const url = resolveLink(event.link);
  if (url) properties[NOTION_PROPS.link] = { url };
  if (assignUsers.length > 0) {
    properties[NOTION_PROPS.assignee] = {
      people: assignUsers.map((id) => ({ id })),
    };
  }

  const children: unknown[] = [];
  if (mentionUsers.length > 0) {
    children.push(
      paragraph([
        ...mentionUsers.flatMap((id) => [
          { type: "mention", mention: { type: "user", user: { id } } },
          { type: "text", text: { content: " " } },
        ]),
        { type: "text", text: { content: title } },
      ]),
    );
  }
  for (const [label, value] of event.fields ?? []) {
    if (value === null || value === undefined || value === "") continue;
    children.push({
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [
          { type: "text", text: { content: `${label}  ` }, annotations: { bold: true } },
          ...textChunks(String(value)),
        ],
      },
    });
  }
  const body = event.body?.trim();
  if (body) {
    const clipped = body.length > BODY_LIMIT ? `${body.slice(0, BODY_LIMIT)}…` : body;
    children.push({
      object: "block",
      type: "quote",
      quote: { rich_text: textChunks(clipped) },
    });
  }
  if (url) {
    children.push(
      paragraph([
        { type: "text", text: { content: "관리자 화면에서 열기 →", link: { url } } },
      ]),
    );
  }

  return notionRequest<{ id: string; url: string }>(config.token, "/pages", {
    method: "POST",
    body: {
      parent: { database_id: config.databaseId },
      icon: { type: "emoji", emoji: meta.emoji },
      properties,
      children,
    },
  });
}

function paragraph(richText: unknown[]) {
  return { object: "block", type: "paragraph", paragraph: { rich_text: richText } };
}

function textChunks(content: string) {
  const chunks: Array<{ type: "text"; text: { content: string } }> = [];
  for (let i = 0; i < content.length; i += RICH_TEXT_CHUNK) {
    chunks.push({ type: "text", text: { content: content.slice(i, i + RICH_TEXT_CHUNK) } });
  }
  return chunks.length > 0 ? chunks : [{ type: "text" as const, text: { content: "" } }];
}

function resolveLink(link: string | null | undefined): string | null {
  if (!link) return null;
  if (/^https?:\/\//.test(link)) return link;
  const base = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    DEFAULT_SITE_URL
  ).replace(/\/+$/, "");
  return `${base}${link.startsWith("/") ? link : `/${link}`}`;
}
