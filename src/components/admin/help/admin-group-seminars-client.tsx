"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  adminGetGroupSeminars,
  adminGetGroupSeminarDetail,
  adminCreateGroupSeminar,
  adminUpdateGroupSeminar,
  adminDeleteGroupSeminar,
  adminSetGroupSeminarRegistrationStatus,
  adminSetSeminarDepositStatus,
  type AdminGroupSeminarListItem,
  type AdminGroupSeminarDetail,
  type AdminGroupSeminarRegistrationView,
} from "@/actions/admin-help-center";
import {
  GROUP_SEMINAR_STATUSES,
  GROUP_SEMINAR_REG_STATUSES,
  statusOf,
} from "@/lib/help-center";
import { StatusBadge } from "@/components/help-center/status-badge";
import { SeminarQrDialog } from "@/components/admin/help/seminar-qr-dialog";
import { formatDateTime } from "@/lib/utils";
import { toast } from "sonner";
import {
  Plus,
  Save,
  Trash2,
  CalendarClock,
  Users,
  Phone,
  Mail,
  QrCode,
  X,
  Copy,
  Image as ImageIcon,
  Eye,
  Gift,
  Presentation,
  Clock,
  MapPin,
  BookOpen,
  ChevronDown,
  Download,
} from "lucide-react";

// datetime-local(로컬 벽시계) ↔ 절대시각(UTC ISO) 변환. 프로덕션(UTC) 서버에서
// KST 입력이 9시간 어긋나는 것을 막기 위해 브라우저 타임존 기준으로 왕복 변환한다.
function isoToDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
function datetimeLocalToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

interface FormState {
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

const EMPTY_FORM: FormState = {
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

function detailToForm(d: AdminGroupSeminarDetail): FormState {
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

const INPUT_CLS =
  "w-full h-9 rounded-xl border border-gray-200 px-3 text-[13px] outline-none focus:border-blue-500";

const DEPOSIT_STATUS_META: Record<string, { label: string; cls: string }> = {
  WAITING: { label: "입금대기", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  PAID: { label: "입금확인", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  REFUNDED: { label: "환급완료", cls: "bg-slate-50 text-slate-600 border-slate-200" },
  FORFEITED: { label: "몰수", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  NONE: { label: "없음", cls: "bg-slate-50 text-slate-400 border-slate-200" },
};
const DEPOSIT_ACTIONS = [
  { value: "PAID", label: "입금확인" },
  { value: "REFUNDED", label: "환급완료" },
  { value: "FORFEITED", label: "몰수" },
  { value: "WAITING", label: "대기로" },
] as const;

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(label);
  } catch {
    toast.error("복사에 실패했습니다.");
  }
}

export function AdminGroupSeminarsClient({
  initialSeminars,
}: {
  initialSeminars: AdminGroupSeminarListItem[];
}) {
  const [seminars, setSeminars] = useState(initialSeminars);
  const [selectedId, setSelectedId] = useState<string | "new" | null>(null);
  const [detail, setDetail] = useState<AdminGroupSeminarDetail | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isPending, startTransition] = useTransition();
  const [qrTarget, setQrTarget] = useState<
    { id: string; title: string; status: string } | null
  >(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const isNew = selectedId === "new";

  async function uploadCover(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("이미지 파일만 업로드할 수 있어요.");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/group-seminars/upload", {
        method: "POST",
        body: fd,
      });
      const data = (await res.json().catch(() => null)) as
        | { url?: string; error?: string }
        | null;
      if (!res.ok || !data?.url) {
        toast.error(data?.error ?? "이미지 업로드에 실패했습니다.");
        return;
      }
      set("coverImageUrl", data.url);
      toast.success("이미지를 업로드했어요.");
    } catch {
      toast.error("이미지 업로드에 실패했습니다.");
    } finally {
      setUploading(false);
    }
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function addSessionDate() {
    setForm((f) => ({ ...f, sessionDates: [...f.sessionDates, ""] }));
  }
  function setSessionDate(i: number, value: string) {
    setForm((f) => ({
      ...f,
      sessionDates: f.sessionDates.map((d, idx) => (idx === i ? value : d)),
    }));
  }
  function removeSessionDate(i: number) {
    setForm((f) => ({
      ...f,
      sessionDates: f.sessionDates.filter((_, idx) => idx !== i),
    }));
  }

  function refreshList() {
    return adminGetGroupSeminars().then(setSeminars);
  }

  function selectSeminar(id: string) {
    startTransition(async () => {
      const d = await adminGetGroupSeminarDetail(id);
      if (!d) {
        toast.error("세미나를 찾을 수 없습니다.");
        return;
      }
      setSelectedId(id);
      setDetail(d);
      setForm(detailToForm(d));
    });
  }

  function newSeminar() {
    setSelectedId("new");
    setDetail(null);
    setForm(EMPTY_FORM);
  }

  function closeEditor() {
    setSelectedId(null);
    setDetail(null);
    setShowPreview(false);
  }

  // ESC로 모달 닫기 — 미리보기 > QR > 편집 순으로 위에 뜬 것부터 처리.
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showPreview) setShowPreview(false);
      else if (!qrTarget) closeEditor();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, qrTarget, showPreview]);

  function buildPayload() {
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
      status: form.status as FormState["status"],
      coverImageUrl: form.coverImageUrl,
      publicEnabled: form.publicEnabled,
    };
  }

  function save() {
    if (!form.title.trim()) {
      toast.error("제목을 입력하세요.");
      return;
    }
    startTransition(async () => {
      try {
        const payload = buildPayload();
        if (isNew) {
          const res = await adminCreateGroupSeminar(payload);
          toast.success("세미나가 개설되었습니다.");
          await refreshList();
          selectSeminar(res.id);
        } else if (selectedId) {
          await adminUpdateGroupSeminar(selectedId, payload);
          toast.success("저장되었습니다.");
          await refreshList();
          const d = await adminGetGroupSeminarDetail(selectedId);
          if (d) setDetail(d);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "오류가 발생했습니다.");
      }
    });
  }

  function remove() {
    if (isNew || !selectedId) return;
    if (!confirm("이 세미나를 삭제하시겠습니까? 신청 내역도 함께 삭제됩니다.")) return;
    startTransition(async () => {
      try {
        await adminDeleteGroupSeminar(selectedId);
        toast.success("삭제되었습니다.");
        setSelectedId(null);
        setDetail(null);
        await refreshList();
      } catch {
        toast.error("오류가 발생했습니다.");
      }
    });
  }

  function setRegStatus(regId: string, status: "REGISTERED" | "ATTENDED" | "CANCELED") {
    if (!selectedId || isNew) return;
    startTransition(async () => {
      try {
        await adminSetGroupSeminarRegistrationStatus(regId, status);
        const d = await adminGetGroupSeminarDetail(selectedId);
        if (d) setDetail(d);
        await refreshList();
      } catch {
        toast.error("오류가 발생했습니다.");
      }
    });
  }

  function setDepStatus(
    regId: string,
    status: "WAITING" | "PAID" | "REFUNDED" | "FORFEITED",
  ) {
    if (!selectedId || isNew) return;
    startTransition(async () => {
      try {
        await adminSetSeminarDepositStatus(regId, status);
        const d = await adminGetGroupSeminarDetail(selectedId);
        if (d) setDetail(d);
        await refreshList();
      } catch {
        toast.error("오류가 발생했습니다.");
      }
    });
  }

  return (
    <div className="space-y-3">
      {/* List */}
      <div className="space-y-3">
        <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
          {seminars.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">
              개설된 세미나가 없습니다
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {seminars.map((s) => (
                <li
                  key={s.id}
                  className={`flex items-center transition-colors ${
                    selectedId === s.id ? "bg-blue-50/60" : "hover:bg-slate-50/70"
                  }`}
                >
                  <button
                    onClick={() => selectSeminar(s.id)}
                    className="flex-1 min-w-0 text-left flex items-start gap-3 pl-4 py-3"
                  >
                    <StatusBadge status={statusOf(GROUP_SEMINAR_STATUSES, s.status)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 truncate text-[13px] font-semibold text-gray-900">
                        <span className="truncate">{s.title}</span>
                        {s.publicEnabled && (
                          <span className="shrink-0 rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                            공개
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-400 mt-0.5">
                        {s.scheduledAt
                          ? formatDateTime(new Date(s.scheduledAt))
                          : "일정 미정"}
                        {" · "}
                        {s.registeredCount}
                        {s.capacity != null ? `/${s.capacity}` : ""}명
                        {s.guestCount > 0 ? ` · 비회원 ${s.guestCount}` : ""}
                      </div>
                    </div>
                  </button>
                  <button
                    title="모집 QR 코드"
                    onClick={() =>
                      setQrTarget({ id: s.id, title: s.title, status: s.status })
                    }
                    className="shrink-0 mr-2 flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600"
                  >
                    <QrCode className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          onClick={newSeminar}
          className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-blue-300 py-5 text-[13px] font-semibold text-blue-600 transition-colors hover:bg-blue-50"
        >
          <Plus className="size-4" />새 세미나 개설
        </button>
      </div>

      {/* Editor modal */}
      {selectedId && (
        <div
          className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4"
          onClick={closeEditor}
        >
          <div
            className="my-6 flex max-h-[92vh] w-full max-w-[92rem] flex-col rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <h2 className="text-[15px] font-bold text-gray-900">
                  {isNew ? "새 세미나 개설" : "세미나 편집"}
                </h2>
                <button
                  onClick={() => setShowPreview(true)}
                  className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[12px] font-semibold text-blue-600 hover:bg-blue-100"
                >
                  <Eye className="size-3.5" />
                  미리보기
                </button>
              </div>
              <div className="flex items-center gap-2.5">
                {!isNew && detail && (
                  <button
                    onClick={() =>
                      setQrTarget({
                        id: detail.id,
                        title: detail.title,
                        status: detail.status,
                      })
                    }
                    className="inline-flex items-center gap-1 text-[12px] font-semibold text-blue-600 hover:text-blue-700"
                  >
                    <QrCode className="size-3.5" />
                    QR 코드
                  </button>
                )}
                <button
                  onClick={save}
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  <Save className="size-3.5" />
                  {isNew ? "개설" : "저장"}
                </button>
                {!isNew && detail && (
                  <button
                    onClick={remove}
                    disabled={isPending}
                    className="inline-flex items-center gap-1 text-[12px] text-gray-400 hover:text-rose-600"
                  >
                    <Trash2 className="size-3.5" />
                    삭제
                  </button>
                )}
                <button
                  onClick={closeEditor}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {/* Body — 신청자 있으면 좌(편집 폼) / 우(신청자 목록) 2단 */}
            <div
              className={`overflow-y-auto p-5 ${
                !isNew && detail
                  ? "grid gap-5 lg:grid-cols-[minmax(0,1fr)_440px]"
                  : "space-y-5"
              }`}
            >
              {/* 좌: 편집 폼 */}
              <div className="min-w-0 space-y-5">
              {/* Basic fields — 2단: 좌 메타 / 우 상세 (세로 스크롤 최소화) */}
              <div className="grid grid-cols-1 gap-x-5 gap-y-3 lg:grid-cols-2">
                {/* 좌: 짧은 입력들 */}
                <div className="space-y-3">
                  <Field label="제목">
                    <textarea
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-[13px] resize-y outline-none focus:border-blue-500"
                      rows={2}
                      value={form.title}
                      onChange={(e) => set("title", e.target.value)}
                      placeholder="예: 신규 원장 온보딩 단체 세미나"
                    />
                    <p className="mt-1 text-[11px] text-gray-400">
                      엔터로 줄을 바꾸면 사용자 화면에도 그대로 줄바꿈되어 보입니다.
                    </p>
                  </Field>
                  <Field label="한 줄 소개">
                    <textarea
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-[13px] resize-y outline-none focus:border-blue-500"
                      rows={2}
                      value={form.summary}
                      onChange={(e) => set("summary", e.target.value)}
                      placeholder="제목 아래에 노출되는 짧은 소개 (엔터로 줄바꿈 가능)"
                    />
                  </Field>
                  <Field label="참여자 혜택 (사용자 화면 상단 블록 · 비우면 숨김)">
                    <textarea
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-[13px] resize-y outline-none focus:border-blue-500"
                      rows={3}
                      value={form.benefit}
                      onChange={(e) => set("benefit", e.target.value)}
                      placeholder={"예:\n· 참석 원장님 전원에게 스모트 활용 가이드 & 실전 템플릿 제공\n· 현장 1:1 세팅 컨설팅\n· 다과·음료 제공"}
                    />
                    <p className="mt-1 text-[11px] text-gray-400">
                      줄바꿈으로 여러 혜택을 나열할 수 있습니다.
                    </p>
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="강사·진행자">
                      <input
                        className={INPUT_CLS}
                        value={form.host}
                        onChange={(e) => set("host", e.target.value)}
                      />
                    </Field>
                    <Field label="대상">
                      <input
                        className={INPUT_CLS}
                        value={form.target}
                        onChange={(e) => set("target", e.target.value)}
                        placeholder="예: 신규 원장"
                      />
                    </Field>
                  </div>
                  <Field label="장소">
                    <input
                      className={INPUT_CLS}
                      value={form.location}
                      onChange={(e) => set("location", e.target.value)}
                      placeholder="예: 온라인(줌) 또는 서울 강남 세미나실"
                    />
                  </Field>
                  <Field label="지도 링크 (선택 · 사용자 화면 &quot;위치 확인&quot; 버튼)">
                    <input
                      className={INPUT_CLS}
                      value={form.mapUrl}
                      onChange={(e) => set("mapUrl", e.target.value)}
                      placeholder="예: https://naver.me/xxxx"
                    />
                  </Field>
                  <Field label="온라인 접속 링크 (신청자에게 노출)">
                    <input
                      className={INPUT_CLS}
                      value={form.meetingUrl}
                      onChange={(e) => set("meetingUrl", e.target.value)}
                      placeholder="https://zoom.us/j/..."
                    />
                  </Field>
                  <Field label="세션 날짜">
                    <div className="space-y-2">
                      {form.sessionDates.map((d, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input
                            type="datetime-local"
                            className={INPUT_CLS}
                            value={d}
                            onChange={(e) => setSessionDate(i, e.target.value)}
                          />
                          <button
                            type="button"
                            onClick={() => removeSessionDate(i)}
                            className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-rose-50 hover:text-rose-600"
                          >
                            <X className="size-4" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={addSessionDate}
                        className="inline-flex items-center gap-1 text-[12px] font-semibold text-blue-600 hover:text-blue-700"
                      >
                        <Plus className="size-3.5" />
                        날짜 추가
                      </button>
                      <p className="text-[11px] text-gray-400">
                        날짜를 2개 이상 넣으면 신청자가 그중 하루를 선택합니다. 비우면 일정 미정.
                      </p>
                    </div>
                  </Field>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="진행(분)">
                      <input
                        type="number"
                        min={0}
                        className={INPUT_CLS}
                        value={form.durationMin}
                        onChange={(e) => set("durationMin", e.target.value)}
                      />
                    </Field>
                    <Field
                      label={
                        form.sessionDates.filter(Boolean).length > 1 ? "정원 (일자별)" : "정원"
                      }
                    >
                      <input
                        type="number"
                        min={0}
                        className={INPUT_CLS}
                        value={form.capacity}
                        onChange={(e) => set("capacity", e.target.value)}
                        placeholder="무제한"
                      />
                    </Field>
                    <Field label="마감(N일 전)">
                      <input
                        type="number"
                        min={0}
                        className={INPUT_CLS}
                        value={form.registerCloseDays}
                        onChange={(e) => set("registerCloseDays", e.target.value)}
                        placeholder="당일"
                      />
                    </Field>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    신청 마감은 각 세션 실행일 기준 며칠 전까지 받을지입니다. 비우면 당일까지, 마감이
                    지나면 자동으로 신청이 차단됩니다.
                  </p>
                  <Field label="참가 보증금 (원)">
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      className={INPUT_CLS}
                      value={form.depositAmount}
                      onChange={(e) => set("depositAmount", e.target.value)}
                      placeholder="없음 (0/빈칸)"
                    />
                    <p className="mt-1 text-[11px] text-gray-400">
                      금액을 넣으면 신청 시 계좌이체 안내 + 환급계좌 입력을 요구하고, 입금은 금액 +
                      입금자명으로 자동 확인(무통장입금과 동일)됩니다. 환급은 세미나 당일 관리자가
                      수동 처리합니다.
                    </p>
                  </Field>
                </div>

                {/* 우: 커버 이미지 + 상세 안내(길게) + 상태 */}
                <div className="flex flex-col space-y-3">
                  <Field label="커버 이미지 (사용자 화면 상단 노출)">
                    {form.coverImageUrl ? (
                      <div className="relative overflow-hidden rounded-xl border border-gray-200">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={form.coverImageUrl}
                          alt="세미나 커버"
                          className="h-32 w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => set("coverImageUrl", "")}
                          className="absolute right-2 top-2 rounded-md bg-black/50 px-2 py-1 text-[11px] font-medium text-white hover:bg-black/70"
                        >
                          제거
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        disabled={uploading}
                        className="flex h-32 w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-500 disabled:opacity-50"
                      >
                        <ImageIcon className="size-5" />
                        <span className="text-[12px]">
                          {uploading ? "업로드 중..." : "이미지 업로드 (JPG·PNG, 5MB 이하)"}
                        </span>
                      </button>
                    )}
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void uploadCover(f);
                        e.target.value = "";
                      }}
                    />
                  </Field>
                  <Field label="상세 안내" className="flex flex-1 flex-col">
                    <textarea
                      className="w-full flex-1 min-h-[200px] rounded-xl border border-gray-200 px-3 py-2 text-[13px] resize-y outline-none focus:border-blue-500"
                      value={form.description}
                      onChange={(e) => set("description", e.target.value)}
                      placeholder="커리큘럼·준비물 등 상세 내용"
                    />
                  </Field>
                  <Field label="공개 상태">
                    <div className="flex flex-wrap gap-1.5">
                      {GROUP_SEMINAR_STATUSES.map((s) => (
                        <button
                          key={s.value}
                          onClick={() => set("status", s.value)}
                          className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                            form.status === s.value
                              ? "border-slate-800 bg-slate-800 text-white"
                              : "border-gray-200 text-gray-500 hover:bg-gray-50"
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <p className="text-[11px] text-gray-400">
                    &quot;모집중(OPEN)&quot; 상태에서만 원장이 신청할 수 있습니다.
                  </p>

                  {/* 비회원(랜딩) 공개 신청 토글 */}
                  <Field label="비회원 공개 신청">
                    <button
                      type="button"
                      onClick={() => set("publicEnabled", !form.publicEnabled)}
                      className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
                        form.publicEnabled
                          ? "border-blue-200 bg-blue-50"
                          : "border-gray-200 bg-white hover:bg-gray-50"
                      }`}
                    >
                      <span className="text-[13px]">
                        <span className="font-semibold text-gray-800">
                          {form.publicEnabled ? "공개 중" : "비공개"}
                        </span>
                        <span className="ml-1 text-gray-400">
                          {form.publicEnabled
                            ? "랜딩페이지(/seminar)에서 비회원도 신청 가능"
                            : "로그인한 원장만 신청 가능"}
                        </span>
                      </span>
                      <span
                        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                          form.publicEnabled ? "bg-blue-600" : "bg-gray-300"
                        }`}
                      >
                        <span
                          className={`inline-block size-4 transform rounded-full bg-white transition-transform ${
                            form.publicEnabled ? "translate-x-4" : "translate-x-0.5"
                          }`}
                        />
                      </span>
                    </button>
                  </Field>
                </div>
              </div>
              </div>

            {/* 우: 신청자 목록 */}
            {!isNew && detail && (
              <RegistrationsPanel
                key={detail.id}
                detail={detail}
                isPending={isPending}
                onRegStatus={setRegStatus}
                onDepStatus={setDepStatus}
              />
            )}
            </div>
          </div>
        </div>
      )}

      {selectedId && showPreview && (
        <SeminarPreview form={form} onClose={() => setShowPreview(false)} />
      )}

      {qrTarget && (
        <SeminarQrDialog seminar={qrTarget} onClose={() => setQrTarget(null)} />
      )}
    </div>
  );
}

// ─── 신청자 패널(접기/펼치기 · 참석일 필터 · CSV) ───────────────────────────
// 파일명/CSV 셀 이스케이프 유틸.
function sanitizeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80) || "세미나";
}
function csvCell(v: string) {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

const CSV_HEADER = [
  "이름",
  "학원",
  "연락처",
  "이메일",
  "인원",
  "참석일",
  "상태",
  "신청일시",
  "보증금상태",
  "보증금액",
  "입금자명",
  "환급은행",
  "환급계좌",
  "예금주",
  "입금확인",
  "환급완료",
  "메시지",
] as const;

function registrationToCsvRow(r: AdminGroupSeminarRegistrationView): string[] {
  return [
    r.applicantName,
    r.academyName ?? "",
    r.phone,
    r.email ?? "",
    String(r.headCount),
    r.selectedDate ? formatDateTime(new Date(r.selectedDate)) : "",
    statusOf(GROUP_SEMINAR_REG_STATUSES, r.status).label,
    formatDateTime(new Date(r.createdAt)),
    r.depositStatus === "NONE"
      ? ""
      : (DEPOSIT_STATUS_META[r.depositStatus] ?? DEPOSIT_STATUS_META.NONE).label,
    r.depositAmount != null ? String(r.depositAmount) : "",
    r.depositorName ?? "",
    r.refundBankName ?? "",
    r.refundAccountNumber ?? "",
    r.refundAccountHolder ?? "",
    r.depositPaidAt ? formatDateTime(new Date(r.depositPaidAt)) : "",
    r.depositRefundedAt ? formatDateTime(new Date(r.depositRefundedAt)) : "",
    r.message ?? "",
  ];
}

function RegistrationsPanel({
  detail,
  isPending,
  onRegStatus,
  onDepStatus,
}: {
  detail: AdminGroupSeminarDetail;
  isPending: boolean;
  onRegStatus: (regId: string, status: "REGISTERED" | "ATTENDED" | "CANCELED") => void;
  onDepStatus: (
    regId: string,
    status: "WAITING" | "PAID" | "REFUNDED" | "FORFEITED",
  ) => void;
}) {
  const [dateFilter, setDateFilter] = useState<string>("ALL"); // "ALL" | "NONE" | ISO

  const sessionDates = detail.sessionDates ?? [];
  const showDateFilter = sessionDates.length > 1;
  const hasUnassigned = detail.registrations.some((r) => !r.selectedDate);

  const filtered = detail.registrations.filter((r) => {
    if (dateFilter === "ALL") return true;
    if (dateFilter === "NONE") return !r.selectedDate;
    return r.selectedDate === dateFilter;
  });

  // 상태별 집계(전체 기준).
  const statusCounts = GROUP_SEMINAR_REG_STATUSES.map((s) => ({
    ...s,
    count: detail.registrations.filter((r) => r.status === s.value).length,
  }));

  function downloadCsv() {
    if (filtered.length === 0) {
      toast.error("내보낼 신청자가 없습니다.");
      return;
    }
    const rows = [
      [...CSV_HEADER],
      ...filtered.map(registrationToCsvRow),
    ];
    const csv = rows.map((cols) => cols.map(csvCell).join(",")).join("\r\n");
    // BOM(﻿)을 붙여 엑셀에서 한글이 깨지지 않게 한다.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const suffix =
      dateFilter === "ALL"
        ? ""
        : dateFilter === "NONE"
          ? "_참석일미지정"
          : `_${formatDateTime(new Date(dateFilter)).replace(/[:\s]/g, "")}`;
    a.download = `${sanitizeFileName(detail.title)}_신청자${suffix}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`${filtered.length}명 CSV를 내려받았습니다.`);
  }

  const pill = (active: boolean) =>
    `px-2.5 py-1 text-[11px] font-medium rounded-full border transition-colors ${
      active
        ? "border-slate-800 bg-slate-800 text-white"
        : "border-gray-200 text-gray-500 hover:bg-gray-50"
    }`;

  return (
    <div className="space-y-3 border-t border-gray-100 pt-4 lg:border-l lg:border-t-0 lg:pt-0 lg:pl-5">
      {/* 헤더 — 신청자 수 + CSV */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-gray-700">
          <Users className="size-4 shrink-0 text-gray-400" />
          <span className="truncate">
            신청자 {detail.registeredCount}명
            {detail.capacity != null ? ` / 정원 ${detail.capacity}명` : ""}
          </span>
        </div>
        {detail.registrations.length > 0 && (
          <button
            onClick={downloadCsv}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-[12px] font-semibold text-gray-600 hover:bg-gray-50"
          >
            <Download className="size-3.5" />
            CSV
          </button>
        )}
      </div>

      {/* 상태 요약 */}
      {detail.registrations.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500">
          {statusCounts.map((s, i) => (
            <span key={s.value} className="inline-flex items-center gap-1">
              {i > 0 && <span className="text-gray-300">·</span>}
              {s.label} <b className="text-gray-800">{s.count}</b>
            </span>
          ))}
        </div>
      )}

      {detail.registrations.length === 0 ? (
        <p className="text-[12px] text-gray-400">아직 신청자가 없습니다.</p>
      ) : (
        <div className="space-y-3">
          {/* 참석일 필터 */}
          {showDateFilter && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-gray-400">참석일</span>
              <button onClick={() => setDateFilter("ALL")} className={pill(dateFilter === "ALL")}>
                전체
              </button>
              {sessionDates.map((d) => (
                <button key={d} onClick={() => setDateFilter(d)} className={pill(dateFilter === d)}>
                  {formatDateTime(new Date(d))}
                </button>
              ))}
              {hasUnassigned && (
                <button
                  onClick={() => setDateFilter("NONE")}
                  className={pill(dateFilter === "NONE")}
                >
                  미지정
                </button>
              )}
            </div>
          )}

          {/* 목록 — 각 신청자를 카드별로 여닫는다 */}
          <div className="space-y-2 lg:max-h-[68vh] lg:overflow-y-auto lg:pr-1">
            {filtered.length === 0 ? (
              <p className="text-[12px] text-gray-400">해당 참석일의 신청자가 없습니다.</p>
            ) : (
              <ul className="space-y-2">
                {filtered.map((r) => (
                  <RegistrationCard
                    key={r.id}
                    r={r}
                    isPending={isPending}
                    onRegStatus={onRegStatus}
                    onDepStatus={onDepStatus}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// 신청자 카드 — 기본은 접힌 요약(이름·인원·참석일·상태)이고, 클릭하면
// 연락처·메시지·상태변경·보증금 등 상세가 펼쳐진다.
function RegistrationCard({
  r,
  isPending,
  onRegStatus,
  onDepStatus,
}: {
  r: AdminGroupSeminarRegistrationView;
  isPending: boolean;
  onRegStatus: (regId: string, status: "REGISTERED" | "ATTENDED" | "CANCELED") => void;
  onDepStatus: (
    regId: string,
    status: "WAITING" | "PAID" | "REFUNDED" | "FORFEITED",
  ) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <li
      className={`rounded-xl border ${
        r.status === "CANCELED" ? "border-rose-200 bg-rose-50/50" : "border-gray-100"
      }`}
    >
      {/* 요약 헤더 — 클릭하면 상세 토글 */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-2 p-3 text-left"
      >
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-gray-900">
            <span
              className={`mr-1.5 rounded-md border px-1.5 py-0.5 align-middle text-[10px] font-semibold ${
                r.isGuest
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-blue-200 bg-blue-50 text-blue-700"
              }`}
            >
              {r.isGuest ? "비회원" : "회원"}
            </span>
            {r.applicantName}
            {r.academyName && (
              <span className="font-normal text-gray-400"> · {r.academyName}</span>
            )}
            <span className="font-normal text-gray-400"> · {r.headCount}명</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-gray-400">
            {r.selectedDate && (
              <span className="inline-flex items-center gap-1 font-semibold text-violet-600">
                <CalendarClock className="size-3" />
                참석일 {formatDateTime(new Date(r.selectedDate))}
              </span>
            )}
            {r.depositStatus !== "NONE" && (
              <span
                className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${
                  (DEPOSIT_STATUS_META[r.depositStatus] ?? DEPOSIT_STATUS_META.NONE).cls
                }`}
              >
                보증금 {(DEPOSIT_STATUS_META[r.depositStatus] ?? DEPOSIT_STATUS_META.NONE).label}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <StatusBadge status={statusOf(GROUP_SEMINAR_REG_STATUSES, r.status)} />
          <ChevronDown
            className={`size-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {/* 상세 */}
      {open && (
        <div className="space-y-2 border-t border-gray-100 p-3 pt-2.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-400">
            <span className="inline-flex items-center gap-1">
              <Phone className="size-3" />
              {r.phone}
            </span>
            {r.email && (
              <span className="inline-flex items-center gap-1">
                <Mail className="size-3" />
                {r.email}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-3" />
              신청 {formatDateTime(new Date(r.createdAt))}
            </span>
          </div>
          {r.message && (
            <p className="whitespace-pre-wrap text-[12px] text-gray-500">{r.message}</p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {GROUP_SEMINAR_REG_STATUSES.map((s) => (
              <button
                key={s.value}
                onClick={() => onRegStatus(r.id, s.value as never)}
                disabled={isPending || r.status === s.value}
                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-100 ${
                  r.status === s.value
                    ? "border-slate-800 bg-slate-800 text-white"
                    : "border-gray-200 text-gray-500 hover:bg-gray-50"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* 참가 보증금 */}
          {r.depositStatus !== "NONE" && (
            <div className="space-y-2 rounded-lg border border-amber-100 bg-amber-50/40 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-semibold text-gray-700">
                  보증금{" "}
                  {r.depositAmount != null
                    ? `${r.depositAmount.toLocaleString("ko-KR")}원`
                    : ""}
                </span>
                <span
                  className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${
                    (DEPOSIT_STATUS_META[r.depositStatus] ?? DEPOSIT_STATUS_META.NONE).cls
                  }`}
                >
                  {(DEPOSIT_STATUS_META[r.depositStatus] ?? DEPOSIT_STATUS_META.NONE).label}
                </span>
              </div>
              <div className="space-y-0.5 text-[11px] text-gray-500">
                {r.depositorName && <div>입금자명: {r.depositorName}</div>}
                {(r.refundBankName || r.refundAccountNumber) && (
                  <div className="flex items-center gap-1.5">
                    <span>
                      환급계좌: {r.refundBankName} {r.refundAccountNumber}
                      {r.refundAccountHolder ? ` (${r.refundAccountHolder})` : ""}
                    </span>
                    {r.refundAccountNumber && (
                      <button
                        type="button"
                        title="계좌번호 복사"
                        onClick={() =>
                          copyText(r.refundAccountNumber!, "환급 계좌번호를 복사했습니다.")
                        }
                        className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                      >
                        <Copy className="size-2.5" />
                        복사
                      </button>
                    )}
                  </div>
                )}
                {r.depositPaidAt && (
                  <div>입금확인 {formatDateTime(new Date(r.depositPaidAt))}</div>
                )}
                {r.depositRefundedAt && (
                  <div>환급완료 {formatDateTime(new Date(r.depositRefundedAt))}</div>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {DEPOSIT_ACTIONS.map((a) => (
                  <button
                    key={a.value}
                    onClick={() => onDepStatus(r.id, a.value)}
                    disabled={isPending || r.depositStatus === a.value}
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-100 ${
                      r.depositStatus === a.value
                        ? "border-slate-800 bg-slate-800 text-white"
                        : "border-gray-200 text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

// 사용자 화면에서 보이는 모습을 그대로 재현한 미리보기(저장 전 확인용).
// group-seminar-browse-client의 Hero 레이아웃을 폼 값 기준으로 옮겨온 것.
function SeminarPreview({
  form,
  onClose,
}: {
  form: FormState;
  onClose: () => void;
}) {
  const sessionDates = form.sessionDates
    .map(datetimeLocalToIso)
    .filter((v): v is string => !!v);
  const capacity = form.capacity ? Number(form.capacity) : null;
  const durationMin = form.durationMin ? Number(form.durationMin) : null;
  const durationLabel =
    durationMin && durationMin > 0
      ? durationMin < 60
        ? `약 ${durationMin}분`
        : `약 ${Math.round((durationMin / 60) * 10) / 10}시간`
      : "";
  const locationText =
    form.location
      ?.replace(/https?:\/\/[^\s]+/i, "")
      .replace(/·\s*$/, "")
      .trim() || "추후 안내";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        className="my-6 w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 미리보기 헤더 */}
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 bg-slate-50 px-5 py-3">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-600">
            <Eye className="size-4 text-blue-500" />
            사용자 화면 미리보기
          </div>
          <button
            onClick={onClose}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Hero 재현 */}
        <div className="p-5 sm:p-6">
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="grid grid-cols-1 lg:grid-cols-2">
              {/* 좌: 정보 */}
              <div className="order-2 space-y-5 p-6 lg:order-1">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge
                      status={statusOf(GROUP_SEMINAR_STATUSES, form.status)}
                    />
                    {capacity != null && (
                      <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                        선착순 {capacity}명
                      </span>
                    )}
                  </div>
                  <h2 className="whitespace-pre-line text-2xl font-bold leading-tight tracking-tight text-slate-900">
                    {form.title || "제목을 입력하세요"}
                  </h2>
                  {form.summary && (
                    <p className="whitespace-pre-line text-sm text-slate-500">
                      {form.summary}
                    </p>
                  )}
                </div>

                {form.benefit?.trim() && (
                  <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 sm:p-5">
                    <div className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-blue-700">
                      <Gift className="size-4 shrink-0" />
                      참여자 혜택
                    </div>
                    <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">
                      {form.benefit}
                    </p>
                  </div>
                )}
              </div>

              {/* 우: 커버 */}
              <div className="relative order-1 min-h-[200px] lg:order-2 lg:min-h-full">
                {form.coverImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={form.coverImageUrl}
                    alt={form.title}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-blue-50 via-slate-50 to-indigo-50 text-slate-300">
                    <Presentation className="size-8" strokeWidth={1.6} />
                    <span className="text-[12px] font-semibold tracking-wide text-slate-400">
                      SMOAT 단체 세미나
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* 정보 타일 + 상세 안내 */}
            <div className="space-y-5 border-t border-slate-100 p-5 sm:p-6">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                  <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-slate-500">
                    <span className="text-blue-500">
                      <Clock className="size-4" />
                    </span>
                    <span className="truncate">
                      일정{durationLabel ? ` (${durationLabel})` : ""}
                    </span>
                  </div>
                  {sessionDates.length > 0 ? (
                    <div className="space-y-0.5">
                      {sessionDates.map((d) => (
                        <div
                          key={d}
                          className="text-[13px] font-semibold text-slate-700"
                        >
                          {formatDateTime(new Date(d))}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[13px] font-semibold text-slate-700">
                      조율 중
                    </div>
                  )}
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                  <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-slate-500">
                    <span className="text-blue-500">
                      <MapPin className="size-4" />
                    </span>
                    <span className="truncate">장소</span>
                  </div>
                  <div className="line-clamp-2 text-[13px] font-semibold text-slate-700">
                    {locationText}
                  </div>
                </div>
                <div className="col-span-2 rounded-xl border border-slate-100 bg-slate-50/60 p-4 lg:col-span-1">
                  <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-slate-500">
                    <span className="text-blue-500">
                      <CalendarClock className="size-4" />
                    </span>
                    <span className="truncate">신청 마감</span>
                  </div>
                  <div className="text-[13px] font-semibold text-slate-700">
                    {capacity != null ? `선착순 ${capacity}명` : "상시 모집"}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    {form.registerCloseDays
                      ? `실행 ${form.registerCloseDays}일 전까지 신청`
                      : "정원이 차면 자동 마감"}
                  </div>
                </div>
              </div>

              {form.description?.trim() && (
                <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-5">
                  <div className="mb-2.5 flex items-center gap-1.5 text-[13px] font-bold text-slate-800">
                    <span className="text-blue-500">
                      <BookOpen className="size-4" />
                    </span>
                    세미나 안내
                  </div>
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-600">
                    {form.description}
                  </p>
                </div>
              )}
            </div>
          </div>
          <p className="mt-3 text-center text-[11px] text-gray-400">
            실제 화면과 유사하게 재현한 미리보기입니다. 저장해야 사용자에게 반영됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <label className="text-xs font-semibold text-gray-500">{label}</label>
      {children}
    </div>
  );
}
