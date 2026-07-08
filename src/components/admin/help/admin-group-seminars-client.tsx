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
}

const EMPTY_FORM: FormState = {
  title: "",
  summary: "",
  description: "",
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
};

function detailToForm(d: AdminGroupSeminarDetail): FormState {
  return {
    title: d.title,
    summary: d.summary ?? "",
    description: d.description ?? "",
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
  }

  // ESC로 편집 모달 닫기(QR 모달이 위에 떠 있으면 그쪽이 먼저 처리).
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !qrTarget) closeEditor();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, qrTarget]);

  function buildPayload() {
    return {
      title: form.title.trim(),
      summary: form.summary,
      description: form.description,
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
                      <div className="text-[13px] font-semibold text-gray-900 truncate">
                        {s.title}
                      </div>
                      <div className="text-[11px] text-gray-400 mt-0.5">
                        {s.scheduledAt
                          ? formatDateTime(new Date(s.scheduledAt))
                          : "일정 미정"}
                        {" · "}
                        {s.registeredCount}
                        {s.capacity != null ? `/${s.capacity}` : ""}명
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
            className="my-6 flex max-h-[92vh] w-full max-w-6xl flex-col rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
              <h2 className="text-[15px] font-bold text-gray-900">
                {isNew ? "새 세미나 개설" : "세미나 편집"}
              </h2>
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
                  ? "grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]"
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
                    <input
                      className={INPUT_CLS}
                      value={form.title}
                      onChange={(e) => set("title", e.target.value)}
                      placeholder="예: 신규 원장 온보딩 단체 세미나"
                    />
                  </Field>
                  <Field label="한 줄 소개">
                    <input
                      className={INPUT_CLS}
                      value={form.summary}
                      onChange={(e) => set("summary", e.target.value)}
                      placeholder="목록 카드에 노출되는 짧은 소개"
                    />
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
                </div>
              </div>
              </div>

            {/* 우: 신청자 목록 */}
            {!isNew && detail && (
              <div className="space-y-3 border-t border-gray-100 pt-4 lg:border-l lg:border-t-0 lg:pt-0 lg:pl-5">
                <div className="lg:max-h-[74vh] lg:overflow-y-auto lg:pr-1 space-y-3">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-gray-700">
                  <Users className="size-4 text-gray-400" />
                  신청자 {detail.registeredCount}명
                  {detail.capacity != null ? ` / 정원 ${detail.capacity}명` : ""}
                </div>
                {detail.registrations.length === 0 ? (
                  <p className="text-[12px] text-gray-400">아직 신청자가 없습니다.</p>
                ) : (
                  <ul className="space-y-2">
                    {detail.registrations.map((r) => (
                      <li
                        key={r.id}
                        className={`rounded-xl border p-3 space-y-2 ${
                          r.status === "CANCELED"
                            ? "border-rose-200 bg-rose-50/50"
                            : "border-gray-100"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-[13px] font-semibold text-gray-900">
                              {r.applicantName}
                              {r.academyName && (
                                <span className="text-gray-400 font-normal">
                                  {" "}
                                  · {r.academyName}
                                </span>
                              )}
                              <span className="text-gray-400 font-normal">
                                {" "}
                                · {r.headCount}명
                              </span>
                            </div>
                            <div className="text-[11px] text-gray-400 mt-0.5 flex flex-wrap items-center gap-x-2">
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
                                {formatDateTime(new Date(r.createdAt))}
                              </span>
                              {r.selectedDate && (
                                <span className="inline-flex items-center gap-1 font-semibold text-violet-600">
                                  참석일 {formatDateTime(new Date(r.selectedDate))}
                                </span>
                              )}
                            </div>
                          </div>
                          <StatusBadge
                            status={statusOf(GROUP_SEMINAR_REG_STATUSES, r.status)}
                          />
                        </div>
                        {r.message && (
                          <p className="text-[12px] text-gray-500 whitespace-pre-wrap">
                            {r.message}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-1.5">
                          {GROUP_SEMINAR_REG_STATUSES.map((s) => (
                            <button
                              key={s.value}
                              onClick={() => setRegStatus(r.id, s.value as never)}
                              disabled={isPending || r.status === s.value}
                              className={`px-2 py-0.5 text-[11px] font-medium rounded-full border transition-colors disabled:opacity-100 ${
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
                                  (DEPOSIT_STATUS_META[r.depositStatus] ?? DEPOSIT_STATUS_META.NONE)
                                    .cls
                                }`}
                              >
                                {
                                  (DEPOSIT_STATUS_META[r.depositStatus] ?? DEPOSIT_STATUS_META.NONE)
                                    .label
                                }
                              </span>
                            </div>
                            <div className="space-y-0.5 text-[11px] text-gray-500">
                              {r.depositorName && <div>입금자명: {r.depositorName}</div>}
                              {(r.refundBankName || r.refundAccountNumber) && (
                                <div className="flex items-center gap-1.5">
                                  <span>
                                    환급계좌: {r.refundBankName} {r.refundAccountNumber}
                                    {r.refundAccountHolder
                                      ? ` (${r.refundAccountHolder})`
                                      : ""}
                                  </span>
                                  {r.refundAccountNumber && (
                                    <button
                                      type="button"
                                      title="계좌번호 복사"
                                      onClick={() =>
                                        copyText(
                                          r.refundAccountNumber!,
                                          "환급 계좌번호를 복사했습니다.",
                                        )
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
                                  onClick={() => setDepStatus(r.id, a.value)}
                                  disabled={isPending || r.depositStatus === a.value}
                                  className={`px-2 py-0.5 text-[11px] font-medium rounded-full border transition-colors disabled:opacity-100 ${
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
                      </li>
                    ))}
                  </ul>
                )}
                </div>
              </div>
            )}
            </div>
          </div>
        </div>
      )}

      {qrTarget && (
        <SeminarQrDialog seminar={qrTarget} onClose={() => setQrTarget(null)} />
      )}
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
