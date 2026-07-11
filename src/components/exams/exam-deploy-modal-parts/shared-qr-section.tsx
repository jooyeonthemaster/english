"use client";

// ---------------------------------------------------------------------------
// 시험 배포 모달 — 공유 QR 배포(자기등록) 섹션 (설계 §6.9 Wave-3 · 유닛 E3)
//
// 개별 링크 할당(assignStudentsToExam)과 공존하는 두 번째 배포 방식. QR 하나를
// 여러 학생이 스캔 → /t/e/[enrollToken] 랜딩에서 본인 선택 + 코드 확인 → 자기등록
// 응시(mode=enrollMode). 종이 OMR 대량 배포에 적합.
//
// - 열릴 때 getExamEnrollment 로 현재 상태 로드.
// - 토글 스위치 → setExamEnrollment({examId,enabled,mode}) (useTransition).
// - 켜진 상태: 클라이언트 QRCode.toDataURL(enrollUrl) → <img> + 링크 복사·새 탭.
// - KOREAN 시험지는 섹션 비활성(설계 §6-7). subject 미제공 시엔 서버(setExamEnrollment)
//   에러 문구로 처리.
//
// 교차 계약(E1, 임포트 전용): src/actions/exams/enrollment.ts
//   setExamEnrollment({examId,enabled,mode}) → {enrollToken,enrollUrl}
//   getExamEnrollment(examId)               → {enabled,mode,enrollToken,enrollUrl}
// 서버 반환 래퍼({success,data,error}) 여부는 unwrapResult 로 방어적 정규화(래퍼·
// 베어 반환 모두 수용) → 병렬 빌드에서 E1 의 정확한 반환 형태에 결합하지 않는다.
// ---------------------------------------------------------------------------

import { useEffect, useId, useState, useTransition } from "react";
import { Check, Copy, ExternalLink, Loader2, QrCode } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import {
  getExamEnrollment,
  setExamEnrollment,
} from "@/actions/exams/enrollment";
import { cn } from "@/lib/utils";
import { MODE_OPTIONS } from "./deploy-status";

type EnrollMode = "OMR" | "TABLET";

interface EnrollmentSnapshot {
  enabled: boolean;
  mode: EnrollMode;
  enrollToken: string | null;
  enrollUrl: string | null;
}

interface SharedQrSectionProps {
  examId: string;
  /** 모달 열림 여부 — 열릴 때만 로드/재로드한다. */
  open: boolean;
  /** exam.subject — KOREAN 이면 비활성. 미제공 시 서버 에러로 폴백. */
  subject?: string;
}

/**
 * 서버 액션 반환을 방어적으로 정규화한다. E1 이 코드베이스 관례대로 결과 래퍼
 * ({success,data,error})를 돌려주면 그대로 풀고, 베어 데이터를 돌려주면 성공으로
 * 간주한다. (병렬 빌드 — E1 의 정확한 반환 형태에 컴파일 결합을 만들지 않기 위함.)
 */
function unwrapResult<T>(raw: unknown): {
  ok: boolean;
  data?: T;
  error?: string;
} {
  if (raw && typeof raw === "object" && "success" in raw) {
    const r = raw as { success?: unknown; data?: T; error?: unknown };
    return {
      ok: r.success === true,
      data: r.data,
      error: typeof r.error === "string" ? r.error : undefined,
    };
  }
  return { ok: true, data: raw as T };
}

function coerceMode(value: unknown): EnrollMode {
  return value === "OMR" ? "OMR" : "TABLET";
}

export function SharedQrSection({ examId, open, subject }: SharedQrSectionProps) {
  const isKorean = subject === "KOREAN";
  const modeSelectId = useId();
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<EnrollmentSnapshot | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // 열릴 때 로드. KOREAN·닫힘 상태에선 네트워크를 태우지 않는다. 모든 setState 는
  // 프로미스 콜백 안에서만 호출한다(effect 동기 setState 회피 — loading 은 useState
  // 초기값 true 이므로 스켈레톤이 곧바로 뜬다).
  useEffect(() => {
    if (!open || isKorean) return;
    let cancelled = false;
    getExamEnrollment(examId)
      .then((raw) => {
        if (cancelled) return;
        const res = unwrapResult<Partial<EnrollmentSnapshot>>(raw);
        if (!res.ok || !res.data) {
          setLoadError(res.error ?? "공유 QR 정보를 불러오지 못했습니다.");
          setLoading(false);
          return;
        }
        const d = res.data;
        setEnrollment({
          enabled: d.enabled === true,
          mode: coerceMode(d.mode),
          enrollToken: d.enrollToken ?? null,
          enrollUrl: d.enrollUrl ?? null,
        });
        setLoadError(null);
        setActionError(null);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError("공유 QR 정보를 불러오지 못했습니다.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, isKorean, examId]);

  // enrollUrl → QR 데이터 URI (켜진 상태에서만 생성). url 이 없으면 null 로 리셋하되,
  // setState 는 항상 프로미스 콜백 안에서만 호출한다(effect 동기 setState 회피).
  useEffect(() => {
    const url = enrollment?.enabled ? enrollment.enrollUrl : null;
    let cancelled = false;
    const task = url
      ? QRCode.toDataURL(url, { width: 264, margin: 1 })
      : Promise.resolve(null);
    task
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [enrollment?.enabled, enrollment?.enrollUrl]);

  function persist(
    next: { enabled: boolean; mode: EnrollMode },
    successMessage: string,
  ) {
    setActionError(null);
    startTransition(async () => {
      const res = unwrapResult<{
        enrollToken?: string | null;
        enrollUrl?: string | null;
      }>(await setExamEnrollment({ examId, enabled: next.enabled, mode: next.mode }));
      if (!res.ok) {
        setActionError(res.error ?? "공유 QR 설정을 변경하지 못했습니다.");
        return;
      }
      setEnrollment((prev) => ({
        enabled: next.enabled,
        mode: next.mode,
        enrollToken: res.data?.enrollToken ?? prev?.enrollToken ?? null,
        enrollUrl: res.data?.enrollUrl ?? prev?.enrollUrl ?? null,
      }));
      toast.success(successMessage);
    });
  }

  function handleToggle() {
    if (!enrollment || isPending || loading) return;
    const nextEnabled = !enrollment.enabled;
    persist(
      { enabled: nextEnabled, mode: enrollment.mode },
      nextEnabled ? "공유 QR을 켰습니다." : "공유 QR을 껐습니다.",
    );
  }

  function handleModeChange(mode: EnrollMode) {
    if (!enrollment || isPending) return;
    if (mode === enrollment.mode) return;
    persist(
      { enabled: enrollment.enabled, mode },
      "기본 응시 모드를 변경했습니다.",
    );
  }

  async function handleCopy() {
    if (!enrollment?.enrollUrl) return;
    try {
      await navigator.clipboard.writeText(enrollment.enrollUrl);
      setCopied(true);
      toast.success("등록 링크를 복사했습니다.");
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error(
        "클립보드 복사에 실패했습니다. 브라우저 권한을 확인해 주세요.",
      );
    }
  }

  // KOREAN 시험지 — 비활성 안내(툴팁 + 본문 문구).
  if (isKorean) {
    return (
      <section
        aria-label="공유 QR 배포"
        title="국어 시험지는 공유 QR 배포를 지원하지 않습니다"
        className="rounded-xl border border-[#E5E8EB] bg-slate-50/60 px-4 py-4 opacity-80"
      >
        <div className="flex items-center gap-1.5">
          <QrCode className="h-4 w-4 text-slate-400" aria-hidden="true" />
          <h3 className="text-[13px] font-bold text-slate-500">
            공유 QR 배포 (자기등록)
          </h3>
        </div>
        <p className="mt-1.5 text-[12px] font-semibold text-[#8B95A1]">
          국어 시험지는 공유 QR 배포를 지원하지 않습니다.
        </p>
      </section>
    );
  }

  const enabled = enrollment?.enabled ?? false;

  return (
    <section
      aria-label="공유 QR 배포"
      className="rounded-xl border border-[#3182F6]/25 bg-[#3182F6]/[0.04] px-4 py-4"
    >
      {/* 헤더 — 제목 + 토글 스위치 */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <QrCode className="h-4 w-4 text-[#3182F6]" aria-hidden="true" />
            <h3 className="text-[13px] font-bold text-slate-800">
              공유 QR 배포 (자기등록)
            </h3>
          </div>
          <p className="mt-1 text-[12px] font-medium leading-relaxed text-[#8B95A1]">
            QR 하나를 여러 학생이 스캔해 본인을 선택하고 코드로 확인한 뒤
            응시합니다. 종이 OMR 대량 배포에 적합합니다.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={enabled ? "공유 QR 끄기" : "공유 QR 켜기"}
          disabled={loading || isPending || !enrollment}
          onClick={handleToggle}
          className="flex h-11 shrink-0 items-center disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span
            className={cn(
              "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
              enabled ? "bg-[#3182F6]" : "bg-slate-300",
            )}
          >
            <span
              className={cn(
                "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
                enabled ? "translate-x-[22px]" : "translate-x-0.5",
              )}
            />
          </span>
        </button>
      </div>

      {loading ? (
        <div
          className="mt-3 h-24 animate-pulse rounded-lg bg-white/70"
          aria-label="공유 QR 정보를 불러오는 중"
        />
      ) : loadError ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50/70 px-3 py-2 text-[12px] font-semibold text-red-600">
          {loadError}
        </p>
      ) : (
        <>
          {/* 기본 응시 모드 */}
          <div className="mt-3 flex flex-col gap-1.5">
            <label
              htmlFor={modeSelectId}
              className="text-[12px] font-bold text-slate-700"
            >
              기본 응시 모드
            </label>
            <select
              id={modeSelectId}
              value={enrollment?.mode ?? "TABLET"}
              disabled={isPending || !enrollment}
              onChange={(event) => handleModeChange(coerceMode(event.target.value))}
              className="h-11 rounded-lg border border-[#E5E8EB] bg-white px-3 text-[13px] font-semibold text-slate-700 outline-none transition-colors focus:border-[#3182F6] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {actionError && (
            <p className="mt-2 text-[12px] font-semibold text-red-600">
              {actionError}
            </p>
          )}

          {/* 켜진 상태 — QR + 등록 링크 */}
          {enabled && (
            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="flex shrink-0 items-center justify-center self-center rounded-xl border border-[#E5E8EB] bg-white p-2 sm:self-start">
                {qrDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- data URI, next/image 부적합
                  <img
                    src={qrDataUrl}
                    alt="공유 QR 코드"
                    width={132}
                    height={132}
                    className="h-[132px] w-[132px]"
                  />
                ) : (
                  <div className="flex h-[132px] w-[132px] items-center justify-center">
                    <Loader2
                      className="h-5 w-5 animate-spin text-slate-300"
                      aria-hidden="true"
                    />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1 space-y-2">
                <div className="rounded-lg border border-[#E5E8EB] bg-white px-3 py-2.5">
                  <p
                    className="truncate text-[12px] font-semibold text-slate-700"
                    title={enrollment?.enrollUrl ?? undefined}
                  >
                    {enrollment?.enrollUrl ?? "등록 링크를 생성하는 중입니다."}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleCopy}
                    disabled={!enrollment?.enrollUrl}
                    className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border border-[#E5E8EB] bg-white px-4 text-[13px] font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {copied ? (
                      <Check
                        className="h-4 w-4 text-[#3182F6]"
                        aria-hidden="true"
                      />
                    ) : (
                      <Copy className="h-4 w-4" aria-hidden="true" />
                    )}
                    {copied ? "복사됨" : "링크 복사"}
                  </button>
                  <a
                    href={enrollment?.enrollUrl ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    aria-disabled={!enrollment?.enrollUrl}
                    className={cn(
                      "inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border border-[#3182F6]/45 bg-white px-4 text-[13px] font-bold text-[#3182F6] transition-colors hover:bg-blue-50",
                      !enrollment?.enrollUrl &&
                        "pointer-events-none opacity-50",
                    )}
                  >
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    새 탭에서 열기
                  </a>
                </div>

                <p className="text-[12px] font-medium leading-relaxed text-[#8B95A1]">
                  학생이 이 QR을 스캔해 본인을 선택하고 코드로 확인하면 자동으로
                  응시가 시작됩니다.{" "}
                  <strong className="font-bold text-slate-700">
                    인쇄 시 시험지 상단에 이 QR이 표시됩니다.
                  </strong>
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
