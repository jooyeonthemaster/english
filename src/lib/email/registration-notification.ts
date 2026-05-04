import { Resend } from "resend";

interface RegistrationNotificationPayload {
  id: string;
  academyName: string;
  directorName: string;
  directorPhone: string;
  directorEmail: string;
  address: string;
  district: string | null;
  estimatedStudents: number | null;
  message: string | null;
  desiredPlan: string;
}

function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderHtml(p: RegistrationNotificationPayload): string {
  const rows: Array<[string, string]> = [
    ["학원명", p.academyName],
    ["원장 성함", p.directorName],
    ["연락처", p.directorPhone],
    ["이메일", p.directorEmail],
    ["학원 주소", p.address],
    ["지역 (자동 추출)", p.district ?? "—"],
    ["예상 재원생 수", p.estimatedStudents ? `${p.estimatedStudents}명` : "—"],
    ["희망 플랜", p.desiredPlan],
    ["문의사항", p.message ?? "—"],
    ["접수 ID", p.id],
  ];

  const rowsHtml = rows
    .map(
      ([label, value]) => `
      <tr>
        <td style="padding:12px 16px;background:#F8FAFC;border-bottom:1px solid #E2E8F0;font-size:13px;font-weight:700;color:#1E3A8A;width:140px;white-space:nowrap;">${escape(label)}</td>
        <td style="padding:12px 16px;border-bottom:1px solid #E2E8F0;font-size:14px;color:#0F172A;">${escape(value)}</td>
      </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E2E8F0;">
    <div style="padding:28px 32px;background:#3B82F6;color:#fff;">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.25em;text-transform:uppercase;opacity:0.85;">영신ai · Free Credit Application</div>
      <div style="font-size:22px;font-weight:900;margin-top:8px;letter-spacing:-0.02em;">신규 사전예약 접수</div>
    </div>
    <table style="width:100%;border-collapse:collapse;">${rowsHtml}</table>
    <div style="padding:20px 32px;background:#F8FAFC;font-size:12px;color:#64748B;line-height:1.7;">
      관리자 콘솔에서 승인/거절 처리: <a href="/admin/registrations" style="color:#2563EB;font-weight:700;">/admin/registrations</a>
    </div>
  </div>
</body></html>`;
}

function renderText(p: RegistrationNotificationPayload): string {
  return [
    "[영신ai] 신규 사전예약 접수",
    "",
    `학원명:          ${p.academyName}`,
    `원장 성함:       ${p.directorName}`,
    `연락처:          ${p.directorPhone}`,
    `이메일:          ${p.directorEmail}`,
    `학원 주소:       ${p.address}`,
    `지역(자동추출):  ${p.district ?? "—"}`,
    `예상 재원생:     ${p.estimatedStudents ? `${p.estimatedStudents}명` : "—"}`,
    `희망 플랜:       ${p.desiredPlan}`,
    `문의사항:        ${p.message ?? "—"}`,
    `접수 ID:         ${p.id}`,
    "",
    "관리자 콘솔: /admin/registrations",
  ].join("\n");
}

export async function sendRegistrationNotification(
  payload: RegistrationNotificationPayload,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.REGISTRATION_NOTIFICATION_EMAIL;

  if (!apiKey || !to) {
    console.warn("[registration-notification] skipped: RESEND_API_KEY or REGISTRATION_NOTIFICATION_EMAIL missing");
    return;
  }

  const resend = new Resend(apiKey);

  const subject = `[영신ai 사전예약] ${payload.academyName} · ${payload.directorName} (${payload.directorPhone})`;

  const { error } = await resend.emails.send({
    from: "영신ai 사전예약 <onboarding@resend.dev>",
    to: [to],
    replyTo: payload.directorEmail,
    subject,
    html: renderHtml(payload),
    text: renderText(payload),
  });

  if (error) {
    console.error("[registration-notification] resend error", error);
    throw new Error(typeof error === "string" ? error : JSON.stringify(error));
  }
}
