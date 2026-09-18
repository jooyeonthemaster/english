import { after } from "next/server";
import {
  createOpsEventPage,
  getNotionNotifyConfig,
  type OpsEvent,
} from "@/lib/ops-notify/notion";

/**
 * 운영 알림 발송. 결제·문의 처리 흐름을 절대 막거나 깨뜨리지 않는다:
 *  - NOTION_NOTIFY_* 가 없으면 아무것도 하지 않는다(로컬·리뷰 환경 기본값).
 *  - build 는 응답이 나간 뒤(after) 실행된다 — 안에서 DB 조회를 해도 된다.
 *  - 실패는 로그만 남기고 삼킨다. null 을 돌려주면 보내지 않는다.
 * 커밋이 끝난 뒤(트랜잭션 밖)에서만 호출할 것.
 */
export function dispatchOpsEvent(
  label: string,
  build: () => Promise<OpsEvent | null> | OpsEvent | null,
): void {
  const config = getNotionNotifyConfig();
  if (!config) return;

  const task = async () => {
    try {
      const event = await build();
      if (!event) return;
      await createOpsEventPage(event, config);
    } catch (err) {
      console.error(`[ops-notify] ${label} failed`, err);
    }
  };

  try {
    after(task);
  } catch {
    // 요청 스코프 밖(스크립트·워커)에서는 after 를 못 쓴다 — 그냥 흘려보낸다.
    void task();
  }
}
