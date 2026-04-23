import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendRegistrationNotification } from "@/lib/email/registration-notification";

const SEOUL_DISTRICTS = [
  "강남구", "강동구", "강북구", "강서구", "관악구",
  "광진구", "구로구", "금천구", "노원구", "도봉구",
  "동대문구", "동작구", "마포구", "서대문구", "서초구",
  "성동구", "성북구", "송파구", "양천구", "영등포구",
  "용산구", "은평구", "종로구", "중구", "중랑구",
] as const;

function extractDistrict(address: string | null | undefined): string | null {
  if (!address) return null;
  for (const d of SEOUL_DISTRICTS) {
    if (address.includes(d)) return d;
  }
  return null;
}

const PHONE_RE = /^01[0-9]-?\d{3,4}-?\d{4}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return phone;
}

function parseEstimatedStudents(value: unknown): number | null {
  if (typeof value !== "string" || !value) return null;
  // Accept keys like "20명 이하", "21-50명", "51-100명", "100명 이상"
  const mRange = value.match(/(\d+)\s*-\s*(\d+)/);
  if (mRange) return parseInt(mRange[2], 10);
  const mNum = value.match(/(\d+)/);
  if (mNum) return parseInt(mNum[1], 10);
  return null;
}

interface ApplyBody {
  academyName?: string;
  directorName?: string;
  directorPhone?: string;
  directorEmail?: string;
  address?: string;
  estimatedStudents?: string;
  message?: string;
  desiredPlan?: string;
  agree?: boolean;
}

export async function POST(req: Request) {
  let body: ApplyBody;
  try {
    body = (await req.json()) as ApplyBody;
  } catch {
    return NextResponse.json({ success: false, error: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  const academyName = body.academyName?.trim();
  const directorName = body.directorName?.trim();
  const directorPhone = body.directorPhone?.trim();
  const directorEmail = body.directorEmail?.trim();
  const address = body.address?.trim();
  const agree = body.agree === true;

  if (!academyName) return NextResponse.json({ success: false, error: "학원명을 입력해 주세요." }, { status: 400 });
  if (!directorName) return NextResponse.json({ success: false, error: "신청자 성함을 입력해 주세요." }, { status: 400 });
  if (!directorPhone || !PHONE_RE.test(directorPhone.replace(/\s/g, ""))) {
    return NextResponse.json({ success: false, error: "연락처 형식이 올바르지 않습니다. (010-XXXX-XXXX)" }, { status: 400 });
  }
  if (!directorEmail || !EMAIL_RE.test(directorEmail)) {
    return NextResponse.json({ success: false, error: "올바른 이메일을 입력해 주세요." }, { status: 400 });
  }
  if (!address) return NextResponse.json({ success: false, error: "학원 주소를 입력해 주세요." }, { status: 400 });
  if (!agree) return NextResponse.json({ success: false, error: "개인정보 수집·이용에 동의해 주세요." }, { status: 400 });

  const normalizedPhone = normalizePhone(directorPhone);
  const district = extractDistrict(address);
  const estimatedStudents = parseEstimatedStudents(body.estimatedStudents);
  const desiredPlan = body.desiredPlan?.trim() || "FREE_MAY_2026";

  // Fallback: if the Prisma client does not yet know about `district` (migration
  // not run), we prefix it into `message` so the data is not lost.
  const districtMarker = district ? `__DISTRICT__:${district}` : "";
  const userMessage = body.message?.trim() || "";
  const messageWithMarker = [districtMarker, userMessage].filter(Boolean).join(" | ") || null;

  try {
    // Narrow client type to unknown to allow optional `district` field before migration.
    const data: Record<string, unknown> = {
      academyName,
      directorName,
      directorEmail,
      directorPhone: normalizedPhone,
      phone: normalizedPhone,
      address,
      estimatedStudents,
      message: messageWithMarker,
      desiredPlan,
    };
    if (district) data.district = district;

    const createFn = prisma.academyRegistration.create as unknown as (
      args: { data: Record<string, unknown> },
    ) => Promise<{ id: string }>;
    const created = await createFn({ data });

    // Fire-and-forget notification: never block the user's submission on mail delivery.
    void sendRegistrationNotification({
      id: created.id,
      academyName,
      directorName,
      directorPhone: normalizedPhone,
      directorEmail,
      address,
      district,
      estimatedStudents,
      message: userMessage || null,
      desiredPlan,
    }).catch((e) => console.error("[landing/apply] notify failed", e));

    return NextResponse.json({
      success: true,
      id: created.id,
      district,
    });
  } catch (err) {
    // If the client rejects `district` (pre-migration), retry without it.
    if (err instanceof Error && /Unknown arg|Unknown field|district/i.test(err.message)) {
      try {
        const created = await prisma.academyRegistration.create({
          data: {
            academyName,
            directorName,
            directorEmail,
            directorPhone: normalizedPhone,
            phone: normalizedPhone,
            address,
            estimatedStudents,
            message: messageWithMarker,
            desiredPlan,
          },
        });
        void sendRegistrationNotification({
          id: created.id,
          academyName,
          directorName,
          directorPhone: normalizedPhone,
          directorEmail,
          address,
          district,
          estimatedStudents,
          message: userMessage || null,
          desiredPlan,
        }).catch((e) => console.error("[landing/apply] notify failed", e));
        return NextResponse.json({ success: true, id: created.id, district });
      } catch (e2) {
        console.error("[landing/apply] fallback create failed", e2);
        return NextResponse.json({ success: false, error: "접수 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
      }
    }
    console.error("[landing/apply] create failed", err);
    return NextResponse.json({ success: false, error: "접수 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
}
