import { NextResponse } from "next/server";
import {
  FF_EMAIL_RE,
  FF_MAX_FILES_PER_SLOT,
  FF_MAX_PAPERS_PER_SLOT,
  FF_REQUEST_ID_RE,
  FF_SLOTS,
  type FfGichulPick,
  type FfSlotKey,
  type FfSubmitBody,
  type FfUploadedFile,
} from "@/lib/free-forecast/constants";
import { sanitizeFfPicks } from "@/lib/free-forecast/catalog";
import { ffClientIp, ffRateLimit } from "@/lib/free-forecast/guard";
import { removeFfPaths, saveFfRequest, verifyFfFiles } from "@/lib/free-forecast/storage";
import { dispatchOpsEvent } from "@/lib/ops-notify/dispatch";

// 공개 — 무료 적중 예측 팩 신청 접수. 실시간 생성이 아니라 접수만 하고, 운영자가 24시간 안에 이메일로 보낸다.
// 개인정보는 자료를 받을 이메일 하나만 받는다(10-08 — 학교·학년 등은 받지 않는다). IP·브라우저 정보도 남기지 않는다
// (동의문에 없는 항목 — 남용 방지는 guard.ts 가 메모리에서 IP 로 센다).

export const dynamic = "force-dynamic";

const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(req: Request) {
  let body: Partial<FfSubmitBody>;
  try {
    body = await req.json();
  } catch {
    return bad("잘못된 요청입니다.");
  }
  // 봇 덫 — 사람에게 안 보이는 칸이 채워져 있으면 접수된 척만 한다
  if (str(body.website, 200)) return NextResponse.json({ ok: true });

  const requestId = str(body.requestId, 64);
  const email = str(body.email, 200).toLowerCase();
  if (!FF_REQUEST_ID_RE.test(requestId)) return bad("잘못된 요청입니다.");
  if (!FF_EMAIL_RE.test(email)) return bad("자료를 받을 이메일을 정확히 적어 주세요.");
  if (body.agree !== true) return bad("개인정보 수집·이용에 동의해 주세요.");

  const ip = ffClientIp(req);
  if (!ffRateLimit(`sub:${ip}`, 8, 60 * 60 * 1000)) return bad("신청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429);

  const files = {} as Record<FfSlotKey, FfUploadedFile[]>;
  const gichul: Partial<Record<FfSlotKey, FfGichulPick[]>> = {};
  // 폴더에는 있는데 신청서가 가리키지 않는 파일 — 접수가 끝나면 지운다
  const stray: string[] = [];
  try {
    for (const s of FF_SLOTS) {
      const raw = Array.isArray(body.files?.[s.key]) ? (body.files?.[s.key] as FfUploadedFile[]) : [];
      const clean = raw
        .filter((f) => f && typeof f.path === "string" && typeof f.name === "string")
        .slice(0, FF_MAX_FILES_PER_SLOT);
      const checked = await verifyFfFiles(requestId, s.key, clean);
      files[s.key] = checked.files;
      stray.push(...checked.stray);
      const picks = s.gichul ? sanitizeFfPicks(body.gichul?.[s.key], FF_MAX_PAPERS_PER_SLOT) : [];
      if (picks.length) gichul[s.key] = picks;
      if (files[s.key].length === 0 && picks.length === 0) {
        return bad(`${s.no}번 칸(${s.title})이 비었습니다. ${s.gichul ? "파일을 올리거나 기출 DB에서 골라 주세요." : "파일을 올려 주세요."}`);
      }
    }
  } catch (err) {
    console.error("[free-forecast] verify", err);
    return bad("올린 파일을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.", 500);
  }

  const createdAt = new Date();
  try {
    const fresh = await saveFfRequest({ requestId, createdAt: createdAt.toISOString(), email, files, gichul });
    if (!fresh) return NextResponse.json({ ok: true, duplicate: true });
  } catch (err) {
    console.error("[free-forecast] save", err);
    return bad("접수에 실패했습니다. 잠시 후 다시 시도해 주세요.", 500);
  }

  // ✕ 로 뺐는데 지우기 요청이 닿지 못한 파일 등 — 신청서에 없는 파일은 운영자도 못 보니 남길 까닭이 없다.
  // 접수는 이미 끝났으므로 실패해도 응답을 바꾸지 않는다(남은 것은 6개월 파기 때 같이 지워진다).
  if (stray.length) {
    try {
      await removeFfPaths(stray);
    } catch (err) {
      console.error("[free-forecast] stray", err);
    }
  }

  const fileCount = FF_SLOTS.reduce((n, s) => n + files[s.key].length, 0);
  const pickCount = Object.values(gichul).reduce((n, ps) => n + (ps ?? []).reduce((m, p) => m + p.q.length, 0), 0);
  // 운영 알림에는 이메일을 싣지 않는다(개인정보는 신청서 한 곳에만 — 6개월 파기 대상을 늘리지 않게). 이메일은 관리자 화면에서.
  dispatchOpsEvent("free-forecast", () => ({
    kind: "INQUIRY",
    title: `무료 적중 예측 팩 신청 · 파일 ${fileCount}개${pickCount ? ` + 기출 DB ${pickCount}지문` : ""}`,
    who: "무료 적중 예측 신청",
    fields: [
      ["파일", `${fileCount}개`],
      ["기출 DB 지문", pickCount ? `${pickCount}개` : null],
      ["마감", "접수 후 24시간 안에 이메일 발송 — 이메일은 관리자 화면에서"],
    ],
    link: `/admin/free-forecast#${requestId}`,
    occurredAt: createdAt,
  }));

  return NextResponse.json({ ok: true });
}
