// ============================================================================
// 운영 알림 이벤트 — 결제 확정·입금 확인 필요·문의/세미나/사전예약 접수.
//
// 호출부는 ID만 넘긴다. 알림 내용 조회는 응답 이후(after)에 하므로 결제·접수
// 응답 속도에 영향이 없다. 환급계좌·비밀번호 같은 민감정보는 싣지 않는다.
// ============================================================================

import { prisma } from "@/lib/prisma";
import { dispatchOpsEvent } from "@/lib/ops-notify/dispatch";
import type { OpsEventKind } from "@/lib/ops-notify/notion";
import {
  boardCategories,
  HELP_BOARD_META,
  SEMINAR_CHANNELS,
  type HelpBoard,
} from "@/lib/help-center";

const PAY_METHOD_LABELS: Record<string, string> = {
  CARD: "카드",
  EASY_PAY: "간편결제",
  TRANSFER: "계좌이체",
  VIRTUAL_ACCOUNT: "가상계좌",
  MOBILE: "휴대폰",
  BANK_TRANSFER: "무통장입금",
  GIFT_CERTIFICATE: "상품권",
  CONVENIENCE_STORE: "편의점",
};

const TOP_UP_SOURCE_LABELS: Record<string, string> = {
  client: "결제창 복귀",
  webhook: "PortOne 웹훅",
  admin_retry: "관리자 재확인",
  auto_reconcile: "자동 대사",
  bank_notify: "입금 문자 자동 매칭",
};

const DEPOSIT_REVIEW_REASONS: Record<string, string> = {
  UNMATCHED: "일치하는 입금 대기 주문 없음",
  AMBIGUOUS: "후보 주문이 여러 건이거나 이미 처리된 주문(중복 입금 가능)",
  FAILED: "자동 처리 중 오류",
};

const won = (value: number) => `${value.toLocaleString("ko-KR")}원`;

const kstDateTime = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const v = record[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** 크레딧 충전 결제 확정(PortOne 카드·가상계좌 등, 무통장 자동 매칭). 실제 지급된 호출에서만 부른다. */
export function notifyTopUpPaid(topUpId: string, source: string): void {
  dispatchOpsEvent("top-up-paid", async () => {
    const topUp = await prisma.creditTopUp.findUnique({
      where: { id: topUpId },
      select: {
        price: true,
        paidAmount: true,
        creditAmount: true,
        paymentMethod: true,
        customData: true,
        paidAt: true,
        completedAt: true,
        academy: { select: { name: true } },
      },
    });
    if (!topUp) return null;
    const customData = readRecord(topUp.customData);
    const paid = topUp.paidAmount ?? topUp.price;
    const discountSource = readString(customData, "discountSource");
    const method = topUp.paymentMethod ?? "";
    return {
      kind: "PAYMENT",
      title: `크레딧 결제 ${won(paid)} · ${topUp.academy.name}`,
      who: topUp.academy.name,
      amount: paid,
      fields: [
        ["결제수단", PAY_METHOD_LABELS[method] ?? (method || null)],
        ["충전 크레딧", `${topUp.creditAmount.toLocaleString("ko-KR")}C`],
        [
          "할인",
          discountSource === "coupon"
            ? "실물 쿠폰"
            : discountSource === "promo"
              ? "프로모션"
              : null,
        ],
        ["입금자명", readString(customData, "depositorName")],
        ["확정 경로", TOP_UP_SOURCE_LABELS[source] ?? source],
      ],
      link: "/admin/credits",
      occurredAt: topUp.paidAt ?? topUp.completedAt,
    };
  });
}

/** 입금 문자가 자동 처리되지 못한 경우(미매칭·중복 의심·오류) — 사람이 확인해야 한다. */
export function notifyBankDepositNeedsReview(notificationId: string): void {
  dispatchOpsEvent("bank-deposit-review", async () => {
    const row = await prisma.bankDepositNotification.findUnique({
      where: { id: notificationId },
      select: {
        amount: true,
        depositorName: true,
        bankName: true,
        status: true,
        note: true,
        rawText: true,
        occurredAt: true,
        receivedAt: true,
      },
    });
    if (!row) return null;
    const depositor = row.depositorName ?? "입금자 미상";
    return {
      kind: "DEPOSIT_REVIEW",
      title: `입금 확인 필요 · ${won(row.amount)} · ${depositor}`,
      who: depositor,
      amount: row.amount,
      fields: [
        ["사유", DEPOSIT_REVIEW_REASONS[row.status] ?? row.status],
        ["은행", row.bankName],
        ["메모", row.note],
      ],
      body: row.rawText,
      link: "/admin/credits/bank-deposits",
      occurredAt: row.occurredAt ?? row.receivedAt,
    };
  });
}

/** 단체 세미나 참가 보증금 입금 확정. */
export function notifySeminarDepositPaid(registrationId: string): void {
  dispatchOpsEvent("seminar-deposit-paid", async () => {
    const reg = await prisma.groupSeminarRegistration.findUnique({
      where: { id: registrationId },
      select: {
        applicantName: true,
        academyName: true,
        phone: true,
        headCount: true,
        depositAmount: true,
        depositPaidAt: true,
        seminar: { select: { title: true } },
      },
    });
    if (!reg) return null;
    const amount = reg.depositAmount ?? 0;
    return {
      kind: "PAYMENT",
      title: `세미나 보증금 입금 ${won(amount)} · ${reg.applicantName}`,
      who: reg.academyName ?? reg.applicantName,
      amount,
      fields: [
        ["세미나", reg.seminar.title],
        ["신청자", reg.applicantName],
        ["학원", reg.academyName],
        ["연락처", reg.phone],
        ["인원", `${reg.headCount}명`],
      ],
      link: "/admin/group-seminars",
      occurredAt: reg.depositPaidAt,
    };
  });
}

function helpBoardKind(board: string): OpsEventKind {
  return board === "FEEDBACK" ? "FEEDBACK" : "INQUIRY";
}

function helpBoardMeta(board: string) {
  return HELP_BOARD_META[board === "FEEDBACK" ? "FEEDBACK" : "SUPPORT"];
}

/** 문의 게시판 / 피드백 게시판 새 글. */
export function notifyHelpPost(postId: string): void {
  dispatchOpsEvent("help-post", async () => {
    const post = await prisma.helpPost.findUnique({
      where: { id: postId },
      select: {
        board: true,
        category: true,
        title: true,
        content: true,
        authorName: true,
        isPrivate: true,
        createdAt: true,
      },
    });
    if (!post) return null;
    const meta = helpBoardMeta(post.board);
    const category = boardCategories(post.board as HelpBoard).find(
      (c) => c.value === post.category,
    )?.label;
    return {
      kind: helpBoardKind(post.board),
      title: `${meta.title} · ${post.title}`,
      who: post.authorName,
      fields: [
        ["카테고리", category ?? post.category],
        ["작성", post.authorName],
        ["비밀글", post.isPrivate ? "예" : null],
      ],
      body: post.content,
      link: `${meta.adminPath}/${postId}`,
      occurredAt: post.createdAt,
    };
  });
}

/** 고객이 게시글에 단 추가 답글(운영자 공식답변 제외). */
export function notifyHelpReply(replyId: string): void {
  dispatchOpsEvent("help-reply", async () => {
    const reply = await prisma.helpPostReply.findUnique({
      where: { id: replyId },
      select: {
        content: true,
        authorName: true,
        createdAt: true,
        post: { select: { id: true, board: true, title: true } },
      },
    });
    if (!reply) return null;
    const meta = helpBoardMeta(reply.post.board);
    return {
      kind: helpBoardKind(reply.post.board),
      title: `추가 답글 · ${reply.post.title}`,
      who: reply.authorName,
      fields: [
        ["게시판", meta.title],
        ["작성", reply.authorName],
      ],
      body: reply.content || "(이미지 첨부)",
      link: `${meta.adminPath}/${reply.post.id}`,
      occurredAt: reply.createdAt,
    };
  });
}

/** 1:1 세미나(온보딩 상담) 신청. */
export function notifySeminarRequest(requestId: string): void {
  dispatchOpsEvent("seminar-request", async () => {
    const req = await prisma.seminarRequest.findUnique({
      where: { id: requestId },
      select: {
        applicantName: true,
        academyName: true,
        phone: true,
        email: true,
        preferredChannel: true,
        preferredTimes: true,
        topic: true,
        message: true,
        createdAt: true,
      },
    });
    if (!req) return null;
    const who = req.academyName ?? req.applicantName;
    return {
      kind: "SEMINAR",
      title: `1:1 세미나 신청 · ${who}`,
      who,
      fields: [
        ["신청자", req.applicantName],
        ["연락처", req.phone],
        ["이메일", req.email],
        [
          "선호 채널",
          SEMINAR_CHANNELS.find((c) => c.value === req.preferredChannel)?.label ??
            req.preferredChannel,
        ],
        ["선호 시간", req.preferredTimes],
        ["관심 주제", req.topic],
      ],
      body: req.message,
      link: "/admin/seminars",
      occurredAt: req.createdAt,
    };
  });
}

/** 단체 세미나 신청(원장 로그인 신청·비회원 공개 신청 공통). */
export function notifyGroupSeminarRegistration(registrationId: string): void {
  dispatchOpsEvent("group-seminar-registration", async () => {
    const reg = await prisma.groupSeminarRegistration.findUnique({
      where: { id: registrationId },
      select: {
        applicantName: true,
        academyName: true,
        phone: true,
        email: true,
        headCount: true,
        isGuest: true,
        selectedDate: true,
        message: true,
        depositStatus: true,
        depositAmount: true,
        updatedAt: true,
        seminar: { select: { title: true, scheduledAt: true } },
      },
    });
    if (!reg) return null;
    const sessionAt = reg.selectedDate ?? reg.seminar.scheduledAt;
    return {
      kind: "SEMINAR",
      title: `단체 세미나 신청 · ${reg.applicantName} ${reg.headCount}명 · ${reg.seminar.title}`,
      who: reg.academyName ?? reg.applicantName,
      fields: [
        ["세미나", reg.seminar.title],
        ["참석 일시", sessionAt ? kstDateTime.format(sessionAt) : null],
        ["인원", `${reg.headCount}명`],
        ["신청자", reg.applicantName],
        ["학원", reg.academyName],
        ["연락처", reg.phone],
        ["이메일", reg.email],
        ["구분", reg.isGuest ? "비회원(공개 신청)" : "회원"],
        [
          "보증금",
          reg.depositStatus === "WAITING" && reg.depositAmount
            ? `${won(reg.depositAmount)} 입금 대기`
            : null,
        ],
      ],
      body: reg.message,
      link: "/admin/group-seminars",
      // 취소 후 재신청은 기존 행을 되살리므로 createdAt 이 아닌 updatedAt.
      occurredAt: reg.updatedAt,
    };
  });
}

/** 랜딩 사전예약(무료 크레딧) 신청. */
export function notifyAcademyRegistration(registrationId: string): void {
  dispatchOpsEvent("academy-registration", async () => {
    const reg = await prisma.academyRegistration.findUnique({
      where: { id: registrationId },
      select: {
        academyName: true,
        directorName: true,
        directorPhone: true,
        directorEmail: true,
        address: true,
        estimatedStudents: true,
        desiredPlan: true,
        message: true,
        createdAt: true,
      },
    });
    if (!reg) return null;
    return {
      kind: "REGISTRATION",
      title: `사전예약 신청 · ${reg.academyName}`,
      who: reg.academyName,
      fields: [
        ["원장", reg.directorName],
        ["연락처", reg.directorPhone],
        ["이메일", reg.directorEmail],
        ["주소", reg.address],
        ["예상 재원생", reg.estimatedStudents ? `${reg.estimatedStudents}명` : null],
        ["희망 플랜", reg.desiredPlan],
      ],
      // 지역 폴백 마커(__DISTRICT__:구)는 내부용이라 뺀다.
      body: reg.message
        ?.split(" | ")
        .filter((part) => !part.startsWith("__DISTRICT__:"))
        .join(" | "),
      link: "/admin/members",
      occurredAt: reg.createdAt,
    };
  });
}
