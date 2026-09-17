/**
 * Notion 운영 알림(결제·문의 → 휴대폰 푸시) 설정 도우미.
 *
 *   npx tsx scripts/notion-notify-setup.ts users
 *     내부 연결(internal connection)이 볼 수 있는 사용자 목록 → NOTION_NOTIFY_USER_IDS 에 넣을 ID 확인
 *
 *   npx tsx scripts/notion-notify-setup.ts create-db <부모 페이지 URL 또는 ID>
 *     알림용 데이터베이스를 부모 페이지 아래에 만든다 → NOTION_NOTIFY_DATABASE_ID 출력
 *     (부모 페이지 ••• > Connections > + Add connection 으로 연결을 먼저 추가해야 한다)
 *
 *   npx tsx scripts/notion-notify-setup.ts check
 *     봇 토큰으로 알림 DB에 접근되는지, 속성 이름·타입이 코드(NOTION_PROPS)와 맞는지 점검
 *
 *   npx tsx scripts/notion-notify-setup.ts test
 *     테스트 알림 2건 발송: A=@멘션만, B=담당자 속성만. 휴대폰에 어느 쪽이 오는지 확인 후
 *     NOTION_NOTIFY_VIA(mention|people|both)를 정한다.
 *
 *   npx tsx scripts/notion-notify-setup.ts cleanup
 *     제목이 "[테스트"로 시작하는 알림 페이지를 휴지통으로 보낸다
 *
 * 환경변수는 .env → .env.local 순으로 읽는다(NOTION_NOTIFY_TOKEN 필수).
 * 토큰은 내부 연결의 Installation access token 이어야 한다. 개인 액세스 토큰(PAT)은
 * 본인 명의로 페이지를 만들어 자기 자신에게 알림이 가지 않는다.
 */
import { config } from "dotenv";
import { resolve } from "path";
import {
  buildOpsDatabaseProperties,
  createOpsEventPage,
  getNotionNotifyConfig,
  NOTION_PROPS,
  notionRequest,
} from "../src/lib/ops-notify/notion";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), ".env.local"), override: true });

type NotionUser = {
  id: string;
  type: "person" | "bot";
  name: string | null;
  person?: { email?: string };
};

function requireToken(): string {
  const token = process.env.NOTION_NOTIFY_TOKEN?.trim();
  if (!token) {
    console.error("NOTION_NOTIFY_TOKEN 이 없습니다. .env.local 에 내부 연결의 Installation access token 을 넣어주세요.");
    process.exit(1);
  }
  return token;
}

/** 페이지 URL 끝의 32자리 ID(하이픈 유무 무관)를 뽑는다. */
function parsePageId(input: string): string | null {
  const compact = input.split("?")[0].replace(/-/g, "");
  const match = compact.match(/([0-9a-f]{32})$/i);
  return match ? match[1] : null;
}

async function listUsers() {
  const token = requireToken();
  const users: NotionUser[] = [];
  let cursor: string | undefined;
  do {
    const page = await notionRequest<{
      results: NotionUser[];
      has_more: boolean;
      next_cursor: string | null;
    }>(token, `/users?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`);
    users.push(...page.results);
    cursor = page.has_more && page.next_cursor ? page.next_cursor : undefined;
  } while (cursor);

  const people = users.filter((u) => u.type === "person");
  if (people.length === 0) {
    console.log("사람 사용자가 보이지 않습니다. 연결의 Configuration 탭에서 'Read user information' 을 켜주세요.");
    return;
  }
  for (const u of people) {
    console.log(`${u.id}  ${u.name ?? "(이름 없음)"}  ${u.person?.email ?? ""}`);
  }
  console.log("\n알림 받을 사람의 ID를 NOTION_NOTIFY_USER_IDS 에 넣으세요(여러 명이면 쉼표로 구분).");
}

async function createDatabase(parentInput: string | undefined) {
  const token = requireToken();
  const parentId = parentInput ? parsePageId(parentInput) : null;
  if (!parentId) {
    console.error("부모 페이지 URL 또는 ID를 넘겨주세요. 예) create-db https://www.notion.so/SMOAT-1a2b...");
    process.exit(1);
  }
  const db = await notionRequest<{ id: string; url: string }>(token, "/databases", {
    method: "POST",
    body: {
      parent: { type: "page_id", page_id: parentId },
      icon: { type: "emoji", emoji: "🔔" },
      title: [{ type: "text", text: { content: "SMOAT 운영 알림" } }],
      properties: buildOpsDatabaseProperties(),
    },
  });
  console.log(`데이터베이스 생성 완료: ${db.url}`);
  console.log(`\nNOTION_NOTIFY_DATABASE_ID="${db.id}"`);
}

async function sendTest() {
  const base = requireConfig();
  if (base.userIds.length === 0) {
    console.error("NOTION_NOTIFY_USER_IDS 가 비어 있으면 알림이 가지 않습니다. `users` 로 ID를 확인하세요.");
    process.exit(1);
  }
  const stamp = new Date().toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul" });
  const cases = [
    { via: "mention" as const, title: `[테스트 A · @멘션] 크레딧 결제 99,000원 · ${stamp}` },
    { via: "people" as const, title: `[테스트 B · 담당자 속성] 문의 게시판 · 결제가 안 돼요 · ${stamp}` },
  ];
  for (const c of cases) {
    const page = await createOpsEventPage(
      {
        kind: c.via === "mention" ? "PAYMENT" : "INQUIRY",
        title: c.title,
        who: "테스트 학원",
        amount: c.via === "mention" ? 99000 : null,
        fields: [["방식", c.via === "mention" ? "본문 @멘션" : "담당자(Person) 속성"]],
        body: "알림 연동 테스트입니다. 확인 후 삭제해도 됩니다.",
        link: "/admin",
      },
      { ...base, via: c.via },
    );
    console.log(`${c.title}\n  → ${page.url}`);
  }
  console.log(
    "\nNotion 앱을 닫아둔 상태에서 휴대폰 푸시를 확인하세요(앱이 열려 있으면 인박스 배지만 뜹니다).\n" +
      "A만 오면 NOTION_NOTIFY_VIA=mention, B만 오면 people, 둘 다 오면서 중복이 싫으면 하나를 고르세요.",
  );
}

const EXPECTED_PROPERTY_TYPES: Record<keyof typeof NOTION_PROPS, string> = {
  title: "title",
  kind: "select",
  who: "rich_text",
  amount: "number",
  assignee: "people",
  handled: "checkbox",
  occurredAt: "date",
  link: "url",
};

function requireConfig() {
  const base = getNotionNotifyConfig();
  if (!base) {
    console.error("NOTION_NOTIFY_TOKEN / NOTION_NOTIFY_DATABASE_ID 를 먼저 설정하세요.");
    process.exit(1);
  }
  return base;
}

async function checkDatabase() {
  const base = requireConfig();
  const db = await notionRequest<{
    url: string;
    title: Array<{ plain_text: string }>;
    properties: Record<string, { type: string }>;
  }>(base.token, `/databases/${base.databaseId}`);
  console.log(`DB 접근 OK: ${db.title.map((t) => t.plain_text).join("")} (${db.url})`);

  let ok = true;
  for (const [key, name] of Object.entries(NOTION_PROPS)) {
    const expected = EXPECTED_PROPERTY_TYPES[key as keyof typeof NOTION_PROPS];
    const actual = db.properties[name]?.type;
    const mark = actual === expected ? "OK " : "ERR";
    if (actual !== expected) ok = false;
    console.log(`  ${mark} ${name}: ${actual ?? "(없음)"}${actual === expected ? "" : ` → ${expected} 이어야 함`}`);
  }
  console.log(`\n수신자 ${base.userIds.length}명, 방식=${base.via}`);
  if (!ok) process.exit(1);
}

async function cleanupTestPages() {
  const base = requireConfig();
  const found = await notionRequest<{ results: Array<{ id: string; url: string }> }>(
    base.token,
    `/databases/${base.databaseId}/query`,
    {
      method: "POST",
      body: {
        filter: { property: NOTION_PROPS.title, title: { starts_with: "[테스트" } },
        page_size: 100,
      },
    },
  );
  for (const page of found.results) {
    await notionRequest(base.token, `/pages/${page.id}`, {
      method: "PATCH",
      body: { archived: true },
    });
    console.log(`휴지통으로 이동: ${page.url}`);
  }
  console.log(`테스트 페이지 ${found.results.length}건 정리 완료`);
}

async function main() {
  const [command, arg] = process.argv.slice(2);
  if (command === "users") return listUsers();
  if (command === "create-db") return createDatabase(arg);
  if (command === "check") return checkDatabase();
  if (command === "test") return sendTest();
  if (command === "cleanup") return cleanupTestPages();
  console.log(
    "사용법: npx tsx scripts/notion-notify-setup.ts <users | create-db <부모 페이지> | check | test | cleanup>",
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? `${err.name}: ${err.message}` : err);
  process.exit(1);
});
