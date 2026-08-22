"use client";

// ============================================================================
// 클래스 스튜디오 — 지문 등록 모달 (docs/class-studio-spec.md §3.2 지문 등록 모달)
//
// WideModal 셸 + 탭 4개: ① 내 자료(검색 300ms 디바운스 + 다중 선택 + 30건
// 페이지네이션) ② 붙여넣기(최소 20자) ③ AI로 만들기(새 탭 딥링크 안내)
// ④ 파일·OCR(새 탭 딥링크 안내). 이미 등록된 지문은 체크 표시 + 비활성.
// 서버 액션은 감독 소유 계약(searchMyPassages·addPassagesToStudioClass·
// createStudioPastedPassage)만 호출한다.
// ============================================================================

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  BadgeCheck,
  BookPlus,
  Check,
  ChevronDown,
  ClipboardPaste,
  ExternalLink,
  FileUp,
  FolderOpen,
  Search,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import {
  addPassagesToStudioClass,
  createStudioPastedPassage,
  getStudioPassageText,
  searchMyPassages,
  type StudioPickerPassage,
} from "@/actions/studio/passages";
import { WideModal } from "@/components/layout/wide-modal";

const PAGE_SIZE = 30;
const MIN_PASTE_LENGTH = 20;

const MODAL_TABS = [
  { id: "library", label: "내 자료", icon: FolderOpen },
  { id: "paste", label: "붙여넣기", icon: ClipboardPaste },
  { id: "ai", label: "AI로 만들기", icon: Wand2 },
  { id: "import", label: "파일·OCR", icon: FileUp },
] as const;
type ModalTabId = (typeof MODAL_TABS)[number]["id"];

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
}

// ── 행 「내용」 토글 (본문 확인 — "지문 1" 류 대량 추출 지문 식별용, 스펙 §3.2) ──

function ExpandButton({ open, onClick }: { open: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-label={open ? "본문 접기" : "본문 보기"}
      className="inline-flex min-h-[32px] shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500 transition hover:border-blue-300 hover:text-blue-600"
    >
      내용
      <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
  );
}

function PassageBodyPanel({
  body,
}: {
  /** null = 로딩 중 */
  body: { content: string; wordCount: number } | null;
}) {
  return (
    <div className="mt-1.5 rounded-lg border border-slate-100 bg-slate-50/60 px-3.5 py-3">
      {body === null ? (
        <div className="space-y-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-3 animate-pulse rounded bg-slate-100" />
          ))}
        </div>
      ) : (
        <>
          <p className="max-h-56 overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed text-slate-600">
            {body.content}
          </p>
          <div className="mt-2 border-t border-slate-100 pt-1.5 text-[11px] text-slate-400">
            {body.wordCount.toLocaleString()} 단어
          </div>
        </>
      )}
    </div>
  );
}

// ── 새 탭 안내 카드 (③ AI로 만들기 · ④ 파일·OCR 공용 프레임) ────────────────

function GuideCard({
  icon: Icon,
  title,
  description,
  href,
  linkLabel,
}: {
  icon: typeof Wand2;
  title: string;
  description: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
        <Icon className="h-7 w-7 text-blue-600" />
      </span>
      <h3 className="mt-4 text-sm font-bold text-slate-900">{title}</h3>
      <p className="mt-2 max-w-md text-[13px] leading-relaxed text-slate-500 break-keep">
        {description}
      </p>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
      >
        {linkLabel}
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

// ── 본체 ─────────────────────────────────────────────────────────────────────

export function PassageAddModal({
  classId,
  open,
  onClose,
  onAdded,
}: {
  classId: string;
  open: boolean;
  onClose: () => void;
  /** 등록 성공 시 클래스 지문 목록 갱신 콜백 */
  onAdded: () => void;
}) {
  const [tab, setTab] = useState<ModalTabId>("library");

  // ① 내 자료
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<StudioPickerPassage[] | null>(null);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, startAdding] = useTransition();

  // ① 내 자료 — 행 「내용」 토글(본문 지연 로드·캐시). undefined=미로드, null=로딩 중.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [bodyCache, setBodyCache] = useState<
    Map<string, { content: string; wordCount: number } | null>
  >(new Map());

  // ② 붙여넣기
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteContent, setPasteContent] = useState("");
  const [pasting, startPasting] = useTransition();

  // 열 때마다 초기화(재오픈 시 alreadyAdded 최신화를 위해 목록도 다시 로드)
  useEffect(() => {
    if (!open) return;
    setTab("library");
    setSearch("");
    setDebouncedSearch("");
    setPage(1);
    setRows(null);
    setSelected(new Set());
    setExpanded(new Set());
    setBodyCache(new Map());
    setPasteTitle("");
    setPasteContent("");
  }, [open]);

  // 검색 디바운스 300ms
  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const loadLibrary = useCallback(async () => {
    const res = await searchMyPassages({
      classId,
      search: debouncedSearch || undefined,
      page,
    });
    if (!res.success || !res.data) {
      toast.error(res.error ?? "내 자료를 불러오지 못했습니다.");
      setRows([]);
      setTotal(0);
      return;
    }
    setRows(res.data.rows);
    setTotal(res.data.total);
  }, [classId, debouncedSearch, page]);

  useEffect(() => {
    if (!open) return;
    setRows(null);
    void loadLibrary();
  }, [open, loadLibrary]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** 행 「내용」 토글 — 첫 펼침에만 서버 로드, 이후 캐시. 선택 체크와 독립. */
  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        return next;
      }
      next.add(id);
      return next;
    });
    if (!bodyCache.has(id)) {
      setBodyCache((prev) => new Map(prev).set(id, null));
      void getStudioPassageText({ passageId: id }).then((res) => {
        setBodyCache((prev) => {
          const next = new Map(prev);
          if (res.success && res.data) {
            next.set(id, { content: res.data.content, wordCount: res.data.wordCount });
          } else {
            next.delete(id);
            toast.error(res.error ?? "본문을 불러오지 못했습니다.");
          }
          return next;
        });
        if (!res.success) setExpanded((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      });
    }
  };

  const submitAdd = () => {
    if (selected.size === 0) return;
    startAdding(async () => {
      const res = await addPassagesToStudioClass({
        classId,
        passageIds: [...selected],
      });
      if (!res.success || !res.data) {
        toast.error(res.error ?? "지문 등록에 실패했습니다.");
        return;
      }
      toast.success(`지문 ${res.data.addedCount}개를 등록했습니다.`);
      onAdded();
      onClose();
    });
  };

  const pasteLength = pasteContent.trim().length;
  const pasteReady = pasteLength >= MIN_PASTE_LENGTH;

  const submitPaste = () => {
    if (!pasteReady) {
      toast.error(`본문을 ${MIN_PASTE_LENGTH}자 이상 입력해 주세요.`);
      return;
    }
    startPasting(async () => {
      const res = await createStudioPastedPassage({
        classId,
        title: pasteTitle.trim() || undefined,
        content: pasteContent,
      });
      if (!res.success || !res.data) {
        toast.error(res.error ?? "지문 등록에 실패했습니다.");
        return;
      }
      toast.success("지문을 등록했습니다.");
      onAdded();
      onClose();
    });
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const footer =
    tab === "library" ? (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-slate-400">
          {selected.size > 0 ? `${selected.size}개 선택됨` : "등록할 지문을 선택해 주세요"}
        </span>
        <button
          type="button"
          onClick={submitAdd}
          disabled={selected.size === 0 || adding}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {adding ? "등록 중…" : `${selected.size}개 등록`}
        </button>
      </div>
    ) : tab === "paste" ? (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={`text-xs ${pasteReady ? "text-slate-400" : "text-rose-500"}`}
        >
          {pasteLength}자{pasteReady ? "" : ` — 최소 ${MIN_PASTE_LENGTH}자`}
        </span>
        <button
          type="button"
          onClick={submitPaste}
          disabled={!pasteReady || pasting}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pasting ? "등록 중…" : "등록"}
        </button>
      </div>
    ) : undefined;

  return (
    <WideModal
      open={open}
      onClose={onClose}
      icon={BookPlus}
      title="지문 등록"
      description="내 자료에서 고르거나, 붙여넣어 바로 등록할 수 있습니다"
      maxWidthClassName="max-w-[860px]"
      footer={footer}
    >
      {/* 모달 탭 바 */}
      <div className="sticky top-0 z-10 flex gap-1 overflow-x-auto border-b border-slate-100 bg-white px-4 sm:px-5">
        {MODAL_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] font-semibold transition ${
              tab === t.id
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "library" ? (
        <div className="p-4 sm:p-5">
          {/* 검색 */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="제목·본문으로 검색"
              className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3.5 text-sm text-slate-900 outline-none placeholder:text-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {/* 목록 */}
          {rows === null ? (
            <div className="mt-3 space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-[54px] animate-pulse rounded-lg border border-slate-100 bg-white"
                />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="mt-8 pb-6 text-center text-sm text-slate-400 break-keep">
              {debouncedSearch
                ? "검색 결과가 없습니다."
                : "내 자료에 지문이 없습니다 — 붙여넣기나 AI로 만들기 탭을 이용해 보세요."}
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {rows.map((p) => {
                const checked = selected.has(p.id);
                const isOpen = expanded.has(p.id);
                return (
                  <li key={p.id}>
                    {p.alreadyAdded ? (
                      <div className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/70 px-3.5 py-3 opacity-70">
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-emerald-200 bg-emerald-50">
                          <Check className="h-3 w-3 text-emerald-600" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-slate-500">
                            {p.title}
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-slate-400">
                            {p.source ?? "출처 미지정"} · {formatDay(p.createdAt)}
                          </div>
                        </div>
                        <ExpandButton
                          open={isOpen}
                          onClick={() => toggleExpand(p.id)}
                        />
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
                          등록됨
                        </span>
                      </div>
                    ) : (
                      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-white px-3.5 py-3 transition hover:border-blue-300 has-[:checked]:border-blue-400 has-[:checked]:bg-blue-50/40">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSelect(p.id)}
                          className="h-4 w-4 shrink-0 accent-blue-600"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-slate-900">
                            {p.title}
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-slate-400">
                            {p.source ?? "출처 미지정"} · {formatDay(p.createdAt)}
                          </div>
                        </div>
                        <ExpandButton
                          open={isOpen}
                          onClick={(e) => {
                            // label 내부 버튼 — 체크박스 토글로 번지지 않게 차단
                            e.preventDefault();
                            e.stopPropagation();
                            toggleExpand(p.id);
                          }}
                        />
                        {p.analyzed ? (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
                            <BadgeCheck className="h-3 w-3" />
                            분석 완료
                          </span>
                        ) : null}
                      </label>
                    )}
                    {isOpen ? (
                      <PassageBodyPanel body={bodyCache.get(p.id) ?? null} />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}

          {/* 페이지네이션 (30건) */}
          {rows !== null && total > PAGE_SIZE ? (
            <div className="mt-4 flex items-center justify-center gap-3 pb-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                이전
              </button>
              <span className="text-xs text-slate-400">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                다음
              </button>
            </div>
          ) : null}
        </div>
      ) : tab === "paste" ? (
        <div className="p-4 sm:p-5">
          <input
            value={pasteTitle}
            onChange={(e) => setPasteTitle(e.target.value)}
            placeholder="제목 (선택 — 비우면 본문 첫 부분으로 자동)"
            maxLength={120}
            className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
          <textarea
            value={pasteContent}
            onChange={(e) => setPasteContent(e.target.value)}
            placeholder="영어 지문 본문을 붙여넣어 주세요 (최소 20자)"
            rows={12}
            className="mt-3 w-full resize-y rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm leading-relaxed text-slate-900 outline-none placeholder:text-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </div>
      ) : tab === "ai" ? (
        <GuideCard
          icon={Wand2}
          title="AI로 지문 만들기"
          description="AI 로 지문을 만든 뒤, '내 자료' 탭에서 불러와 주세요"
          href="/director/workbench/generate"
          linkLabel="AI 지문 생성 열기"
        />
      ) : (
        <GuideCard
          icon={FileUp}
          title="파일·OCR로 가져오기"
          description="가져오기가 끝나면 '내 자료' 탭에 나타납니다"
          href="/director/workbench/passages/import"
          linkLabel="지문 가져오기 열기"
        />
      )}
    </WideModal>
  );
}
