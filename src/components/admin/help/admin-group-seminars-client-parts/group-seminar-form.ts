import { toast } from "sonner";
import type {
  adminCreateGroupSeminar,
  AdminGroupSeminarDetail,
} from "@/actions/admin-help-center";
import type { StatusMap } from "@/lib/admin-labels/tone";
import { datetimeLocalToIso, isoToDatetimeLocal } from "@/lib/utils";

// 단체 세미나 편집 폼의 상태·변환·상수. 화면 부품은 같은 폴더의 .tsx 가 담당한다.

export interface FormState {
  title: string;
  summary: string;
  description: string;
  benefit: string;
  host: string;
  target: string;
  location: string;
  mapUrl: string;
  meetingUrl: string;
  sessionDates: string[];
  durationMin: string;
  capacity: string;
  registerCloseDays: string;
  depositAmount: string;
  status: string;
  coverImageUrl: string;
  publicEnabled: boolean;
}

export const EMPTY_FORM: FormState = {
  title: "",
  summary: "",
  description: "",
  benefit: "",
  host: "",
  target: "",
  location: "",
  mapUrl: "",
  meetingUrl: "",
  sessionDates: [],
  durationMin: "",
  capacity: "",
  registerCloseDays: "",
  depositAmount: "",
  status: "DRAFT",
  coverImageUrl: "",
  publicEnabled: false,
};

export function detailToForm(d: AdminGroupSeminarDetail): FormState {
  return {
    title: d.title,
    summary: d.summary ?? "",
    description: d.description ?? "",
    benefit: d.benefit ?? "",
    host: d.host ?? "",
    target: d.target ?? "",
    location: d.location ?? "",
    mapUrl: d.mapUrl ?? "",
    meetingUrl: d.meetingUrl ?? "",
    // datetime-local(로컬 벽시계) ↔ ISO 변환은 브라우저에서(프로덕션 UTC 9시간 드리프트 방지).
    sessionDates: (d.sessionDates.length
      ? d.sessionDates
      : d.scheduledAt
        ? [d.scheduledAt]
        : []
    ).map(isoToDatetimeLocal),
    durationMin: d.durationMin != null ? String(d.durationMin) : "",
    capacity: d.capacity != null ? String(d.capacity) : "",
    registerCloseDays: d.registerCloseDays != null ? String(d.registerCloseDays) : "",
    depositAmount: d.depositAmount != null ? String(d.depositAmount) : "",
    status: d.status,
    coverImageUrl: d.coverImageUrl ?? "",
    publicEnabled: d.publicEnabled,
  };
}

export type GroupSeminarPayload = Parameters<typeof adminCreateGroupSeminar>[0];

export function buildPayload(form: FormState): GroupSeminarPayload {
  return {
    title: form.title.trim(),
    summary: form.summary,
    description: form.description,
    benefit: form.benefit,
    host: form.host,
    target: form.target,
    location: form.location,
    mapUrl: form.mapUrl,
    meetingUrl: form.meetingUrl,
    sessionDates: form.sessionDates
      .map(datetimeLocalToIso)
      .filter((v): v is string => !!v),
    durationMin: form.durationMin ? Number(form.durationMin) : null,
    capacity: form.capacity ? Number(form.capacity) : null,
    registerCloseDays: form.registerCloseDays ? Number(form.registerCloseDays) : null,
    depositAmount: form.depositAmount ? Number(form.depositAmount) : null,
    status: form.status as GroupSeminarPayload["status"],
    coverImageUrl: form.coverImageUrl,
    publicEnabled: form.publicEnabled,
  };
}

export type RegStatus = "REGISTERED" | "ATTENDED" | "CANCELED";
export type DepositStatus = "WAITING" | "PAID" | "REFUNDED" | "FORFEITED";

/** 참가 보증금 상태 — 관리자 화면 전용 라벨·색조(레지스트리에 없어 여기서 관리). */
export const DEPOSIT_STATUS: StatusMap = {
  WAITING: { label: "입금대기", tone: "amber" },
  PAID: { label: "입금확인", tone: "emerald" },
  REFUNDED: { label: "환급완료", tone: "gray" },
  FORFEITED: { label: "몰수", tone: "rose" },
  NONE: { label: "없음", tone: "gray" },
};

export const DEPOSIT_ACTIONS: ReadonlyArray<{ key: DepositStatus; label: string }> = [
  { key: "PAID", label: "입금확인" },
  { key: "REFUNDED", label: "환급완료" },
  { key: "FORFEITED", label: "몰수" },
  { key: "WAITING", label: "대기로" },
];

export type QrTarget = { id: string; title: string; status: string };

export async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(label);
  } catch {
    toast.error("복사에 실패했습니다.");
  }
}
