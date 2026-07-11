"use client";

// ============================================================================
// 공유 QR 자기등록 — 모바일 퍼스트 원스크린 (설계문서 §6.9 Wave-3 E2)
//
// 3스텝 자연 흐름:
//   ① 이름 검색 — 1자 이상 입력 시 300ms 디바운스로 roster GET → 결과 리스트
//     (이름·학년·학교, 터치 h-11 행) → 선택하면 상단 확정 칩(변경 버튼).
//   ② 코드 확인 — 이름 선택 후 노출. 학생 코드 입력(마스킹+표시토글) + 응시 시작.
//   ③ 제출 — POST enroll → ok면 /t/[accessToken] 로 이동(replace, 재등록 방지).
//
// 계약(E1): GET  /api/t/enroll/[enrollToken]/roster?q=  → [{id,name,grade}]
//           POST /api/t/enroll/[enrollToken] {studentId,code} → {accessToken}
//                실패: {code:"CODE_MISMATCH"|"NOT_FOUND"|"ALREADY_SUBMITTED",...}
//
// 보안(§6): 이 클라이언트는 정답·점수·정오를 어떤 경로로도 받지 않는다. 로스터
// 노출은 검색 기반(반/학원 스코프는 서버가 강제), 코드 확인이 사칭 제출을 차단.
// 디자인: Toss 블루 #3182F6·슬레이트, 앰버/주황·Sparkles 금지, 합니다체.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Eye, EyeOff, Loader2, Search } from "lucide-react";
import {
  parseRoster,
  RosterRow,
  SelectedChip,
  StepHeading,
  type RosterStudent,
} from "./enroll-parts";

const ROSTER_DEBOUNCE_MS = 300;
const CODE_MAX_LENGTH = 20;

export function EnrollClient({
  enrollToken,
  examTitle,
}: {
  enrollToken: string;
  examTitle: string;
}) {
  // ── 이름 검색(스텝 ①) ───────────────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RosterStudent[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false); // 1회 이상 검색 완료 여부
  const [searchError, setSearchError] = useState<string | null>(null);

  // ── 선택·코드(스텝 ②) ──────────────────────────────────────────────────────
  const [selected, setSelected] = useState<RosterStudent | null>(null);
  const [code, setCode] = useState("");
  const [showCode, setShowCode] = useState(false);

  // ── 제출(스텝 ③) ───────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // ALREADY_SUBMITTED 등 재시도 불가 상태 — 버튼을 잠근다(응시면 링크 미제공).
  const [terminal, setTerminal] = useState(false);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const codeInputRef = useRef<HTMLInputElement | null>(null);
  const reqIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  // ── 디바운스 로스터 검색 ─────────────────────────────────────────────────────
  useEffect(() => {
    // 학생이 선택된 동안엔 검색을 멈춘다(스텝 ① 접힘 → 확정 칩).
    if (selected) return;

    const q = query.trim();
    if (q.length < 1) {
      abortRef.current?.abort();
      setResults([]);
      setSearching(false);
      setSearched(false);
      setSearchError(null);
      return;
    }

    setSearching(true);
    setSearchError(null);

    const handle = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const myReq = ++reqIdRef.current;

      void (async () => {
        try {
          const res = await fetch(
            `/api/t/enroll/${encodeURIComponent(enrollToken)}/roster?q=${encodeURIComponent(q)}`,
            { signal: controller.signal },
          );
          const data = (await res.json().catch(() => null)) as unknown;
          if (myReq !== reqIdRef.current) return; // 오래된 응답 폐기
          if (!res.ok) {
            setResults([]);
            setSearched(true);
            setSearchError(
              "학생 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
            );
            return;
          }
          setResults(parseRoster(data));
          setSearched(true);
          setSearchError(null);
        } catch {
          if (controller.signal.aborted) return; // 새 검색으로 대체됨
          if (myReq !== reqIdRef.current) return;
          setResults([]);
          setSearched(true);
          setSearchError("네트워크에 연결할 수 없습니다. 연결을 확인해 주세요.");
        } finally {
          if (myReq === reqIdRef.current) setSearching(false);
        }
      })();
    }, ROSTER_DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [query, selected, enrollToken]);

  // ── 핸들러 ───────────────────────────────────────────────────────────────────
  const handleSelect = useCallback((student: RosterStudent) => {
    setSelected(student);
    setResults([]);
    setSubmitError(null);
    setTerminal(false);
    // 코드 입력으로 자연스럽게 포커스 이동.
    requestAnimationFrame(() => codeInputRef.current?.focus());
  }, []);

  const handleChangeStudent = useCallback(() => {
    setSelected(null);
    setCode("");
    setShowCode(false);
    setSubmitError(null);
    setTerminal(false);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!selected || submitting || terminal) return;
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setSubmitError("학생 코드를 입력해 주세요.");
      requestAnimationFrame(() => codeInputRef.current?.focus());
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/t/enroll/${encodeURIComponent(enrollToken)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: selected.id, code: trimmedCode }),
      });
      const data = (await res.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;

      const accessToken =
        data && typeof data.accessToken === "string" ? data.accessToken : "";
      const redirectPath =
        data && typeof data.redirectPath === "string" && data.redirectPath
          ? data.redirectPath
          : accessToken
            ? `/t/${encodeURIComponent(accessToken)}`
            : "";

      if (res.ok && redirectPath) {
        // 성공 — 응시면으로 이동. replace 로 뒤로가기 재등록을 막고, 이동이 끝날
        // 때까지 스피너를 유지(setSubmitting(false) 하지 않음 → 이중 제출 방지).
        window.location.replace(redirectPath);
        return;
      }

      const errCode = typeof data?.code === "string" ? data.code : "";
      if (errCode === "ALREADY_SUBMITTED") {
        setTerminal(true);
        setSubmitError("이미 제출한 시험입니다. 다시 응시할 수 없습니다.");
      } else if (errCode === "CODE_MISMATCH") {
        setSubmitError("학생 코드가 일치하지 않습니다. 다시 확인해 주세요.");
        requestAnimationFrame(() => codeInputRef.current?.focus());
      } else if (errCode === "NOT_FOUND") {
        setSubmitError("시험을 찾을 수 없습니다. 시험지의 QR을 다시 확인해 주세요.");
      } else if (typeof data?.error === "string" && data.error.trim()) {
        setSubmitError(data.error);
      } else {
        setSubmitError("응시 시작에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      }
      setSubmitting(false);
    } catch {
      setSubmitError("네트워크에 연결할 수 없습니다. 연결을 확인해 주세요.");
      setSubmitting(false);
    }
  }, [selected, submitting, terminal, code, enrollToken]);

  const q = query.trim();
  const showEmpty =
    !selected &&
    !searching &&
    !searchError &&
    searched &&
    q.length >= 1 &&
    results.length === 0;

  // ── 렌더 ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-dvh flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-5 pb-4 pt-5">
        <div className="mx-auto w-full max-w-md">
          <p className="text-[11px] font-medium tracking-wide text-slate-400">
            SMOAT 시험 응시 등록
          </p>
          <h1
            className="mt-1 truncate text-lg font-semibold text-slate-800"
            title={examTitle}
          >
            {examTitle}
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
            본인을 선택하고 코드로 확인해 주세요.
          </p>
        </div>
      </header>

      <main className="flex-1 px-5 py-5">
        <div className="mx-auto w-full max-w-md space-y-5">
          {/* 스텝 ① 이름 검색 / 확정 칩 */}
          <section aria-labelledby="enroll-step-name">
            <StepHeading id="enroll-step-name" index={1} label="이름 검색" />

            {selected ? (
              <SelectedChip student={selected} onChange={handleChangeStudent} />
            ) : (
              <>
                <div className="relative mt-2.5">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    aria-hidden
                  />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="이름을 입력해 주세요"
                    inputMode="text"
                    autoComplete="off"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    aria-label="학생 이름 검색"
                    className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-10 text-base text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                  {searching && (
                    <Loader2
                      className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-blue-500"
                      aria-hidden
                    />
                  )}
                </div>

                {/* 결과/상태 영역 */}
                <div className="mt-2.5" aria-live="polite">
                  {q.length < 1 ? (
                    <p className="px-1 text-xs leading-relaxed text-slate-400">
                      이름을 입력하면 명단에서 본인을 찾을 수 있습니다.
                    </p>
                  ) : searchError ? (
                    <p
                      role="alert"
                      className="flex items-start gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs leading-relaxed text-rose-600"
                    >
                      <AlertCircle
                        className="mt-0.5 h-3.5 w-3.5 shrink-0"
                        aria-hidden
                      />
                      {searchError}
                    </p>
                  ) : showEmpty ? (
                    <p className="rounded-lg border border-slate-200 bg-white px-3 py-4 text-center text-sm text-slate-500">
                      일치하는 학생이 없습니다.
                      <br />
                      이름을 다시 확인해 주세요.
                    </p>
                  ) : results.length > 0 ? (
                    <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                      {results.map((student) => (
                        <li key={student.id}>
                          <RosterRow student={student} onSelect={handleSelect} />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </>
            )}
          </section>

          {/* 스텝 ② 코드 확인 — 이름 선택 후 노출 */}
          {selected && (
            <section aria-labelledby="enroll-step-code">
              <StepHeading id="enroll-step-code" index={2} label="코드 확인" />
              <p className="mt-2 px-1 text-xs leading-relaxed text-slate-500">
                본인 확인을 위해 학생 코드를 입력해 주세요.
              </p>

              <div className="relative mt-2.5">
                <input
                  ref={codeInputRef}
                  type={showCode ? "text" : "password"}
                  value={code}
                  onChange={(event) => {
                    setCode(event.target.value.slice(0, CODE_MAX_LENGTH));
                    if (submitError && !terminal) setSubmitError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleSubmit();
                    }
                  }}
                  placeholder="학생 코드"
                  inputMode="text"
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={CODE_MAX_LENGTH}
                  disabled={submitting || terminal}
                  aria-label="학생 코드"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-3.5 pr-11 text-base tracking-wide text-slate-800 outline-none transition-colors placeholder:tracking-normal placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setShowCode((prev) => !prev)}
                  aria-label={showCode ? "코드 가리기" : "코드 표시"}
                  className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors hover:text-slate-600"
                >
                  {showCode ? (
                    <EyeOff className="h-4 w-4" aria-hidden />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden />
                  )}
                </button>
              </div>

              {submitError && (
                <p
                  role="alert"
                  className="mt-2.5 flex items-start gap-1.5 text-xs leading-relaxed text-rose-600"
                >
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  {submitError}
                </p>
              )}

              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={submitting || terminal || code.trim().length < 1}
                className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-base font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    확인 중
                  </>
                ) : terminal ? (
                  "응시할 수 없습니다"
                ) : (
                  "응시 시작"
                )}
              </button>
            </section>
          )}
        </div>
      </main>

      <footer className="px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 text-center">
        <p className="text-[11px] text-slate-400">SMOAT 시험 응시</p>
      </footer>
    </div>
  );
}
