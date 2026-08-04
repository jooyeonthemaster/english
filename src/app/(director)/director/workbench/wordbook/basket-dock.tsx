"use client";

// ============================================================================
// 단어장 생성 스튜디오 — 담은 단어 도크 (슬라이드오버)
//
// 담기 → 단어장 만들기 → 학생에게 보내기의 3막 흐름을 한 패널에서 끝낸다.
// step "list" = 담은 단어 확인 + 만들기 카드 2장(담은 단어 / 지금 고른 조건)
// step "send" = SendStep(basket-send.tsx) — 대상 선택·문제 유형·보내기
// 덱 spec 검증·limit 클램프는 서버(decks.ts sanitizeDeckSpec)가 정본이므로
// 여기서는 undefined 키를 만들지 않는 것까지만 책임진다.
// presetDeck(셸): 「보낸 단어장」의 [학생에게 보내기] → 보내기 단계 직행 프리셋.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Eye, ShoppingBasket, X } from "lucide-react";
import { createVocabDeck, previewVocabDeck } from "@/actions/vocab-drill-admin/decks";
import {
  listClassFolders,
  listClassRosterStudents,
  type ClassFolderList,
  type ClassRosterStudent,
} from "@/actions/students/class-folders";
import type { VocabDeckSpec } from "@/lib/vocab-drill/payload";
import { PosChip, fmt } from "./wordbook-ui";
import {
  BTN_GHOST,
  BTN_PRIMARY,
  Field,
  INPUT,
  PreviewModal,
  SendStep,
  Spin,
  clampInt,
  type PreviewState,
} from "./basket-send";
import type { WordbookBasketItem, WordbookFilter } from "./wordbook-types";

interface BasketDockProps {
  items: WordbookBasketItem[];
  onRemove: (senseId: string) => void;
  onClear: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentFilter: WordbookFilter;
  currentTotal: number;
  /** 「보낸 단어장」 [학생에게 보내기] 프리셋 — 소비 즉시 onPresetConsumed 로 반납 */
  presetDeck: { id: string; title: string; senseCount: number } | null;
  onPresetConsumed: () => void;
}

export function BasketDock({
  items,
  onRemove,
  onClear,
  open,
  onOpenChange,
  currentFilter,
  currentTotal,
  presetDeck,
  onPresetConsumed,
}: BasketDockProps) {
  const [step, setStep] = useState<"list" | "send">("list");
  const [savedDeck, setSavedDeck] = useState<{ id: string; title: string; senseCount: number } | null>(null);
  const [sendSource, setSendSource] = useState<"deck" | "picks">("deck");
  /** SendStep 마운트 시점의 과제 제목 초기값 — 이후 편집은 SendStep 소유 */
  const [assignInit, setAssignInit] = useState("단어 훈련");
  const [done, setDone] = useState<{ taskCount: number; notice: string | null } | null>(null);

  // 카드 A(담은 단어) · 카드 B(지금 고른 조건)
  const [titleA, setTitleA] = useState("");
  const [subtitleA, setSubtitleA] = useState("");
  const [savingA, setSavingA] = useState(false);
  const [errorA, setErrorA] = useState<string | null>(null);
  const [titleB, setTitleB] = useState("");
  const [countB, setCountB] = useState("100");
  const [savingB, setSavingB] = useState(false);
  const [errorB, setErrorB] = useState<string | null>(null);

  // 보내기 단계 — 로스터·선택은 dock 이 소유해 send 재진입 시 재요청·초기화를 막는다.
  const [rosterState, setRosterState] = useState<"idle" | "loading" | "error" | "ready">("idle");
  const [folders, setFolders] = useState<ClassFolderList | null>(null);
  const [students, setStudents] = useState<ClassRosterStudent[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // 단어 미리보기 — 카드 B(spec)·SendStep(deckId) 두 진입점이 상태를 공유한다.
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const previewSeq = useRef(0);
  const openPreview = useCallback((input: { spec?: VocabDeckSpec; deckId?: string }) => {
    const seq = ++previewSeq.current;
    setPreview({ status: "loading" });
    previewVocabDeck(input)
      .then((res) => {
        if (seq !== previewSeq.current) return;
        if (res.success && res.data) setPreview({ status: "ready", rows: res.data.rows, total: res.data.total });
        else setPreview({ status: "error" });
      })
      .catch(() => {
        if (seq === previewSeq.current) setPreview({ status: "error" });
      });
  }, []);
  // 닫을 때 seq 도 올린다 — 늦게 도착한 응답이 닫힌 모달을 되살리지 않게.
  const closePreview = useCallback(() => {
    previewSeq.current++;
    setPreview(null);
  }, []);

  // 열릴 때마다 카드 B 기본 단어 수를 그 시점 총계로 재계산(규약: min(total,100)).
  useEffect(() => {
    if (!open) return;
    setCountB(String(Math.max(1, Math.min(currentTotal, 100))));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 여는 순간의 총계로만 초기화(입력 중 덮어쓰기 방지)
  }, [open]);

  // 「보낸 단어장」 프리셋 — 저장된 단어장을 보내기 단계로 직행시키고 1회 반납.
  // 새 배포 문맥이므로 직전 배포의 학생 선택은 비운다(이월되면 오배포).
  useEffect(() => {
    if (!open || !presetDeck) return;
    setSavedDeck(presetDeck);
    setSendSource("deck");
    setAssignInit(presetDeck.title);
    setDone(null);
    setSelected(new Set());
    setStep("send");
    onPresetConsumed();
  }, [open, presetDeck, onPresetConsumed]);

  // 보내기 단계 최초 진입 시에만 로스터 로드 — 재진입 시 불필요한 왕복을 막는다.
  const loadRoster = useCallback(() => {
    setRosterState("loading");
    Promise.all([listClassFolders(), listClassRosterStudents()])
      .then(([f, s]) => {
        setFolders(f);
        setStudents(s);
        setRosterState("ready");
      })
      .catch(() => setRosterState("error"));
  }, []);
  useEffect(() => {
    if (open && step === "send" && rosterState === "idle") loadRoster();
  }, [open, step, rosterState, loadRoster]);

  const gotoSend = useCallback((source: "deck" | "picks", deckTitle: string | null) => {
    setSendSource(source);
    setAssignInit(deckTitle ?? "단어 훈련");
    setDone(null);
    setStep("send");
  }, []);

  const handleSaveA = useCallback(async () => {
    const title = titleA.trim();
    if (!title || items.length === 0 || savingA) return;
    setSavingA(true);
    setErrorA(null);
    const res = await createVocabDeck({
      title,
      subtitle: subtitleA.trim() || undefined,
      spec: { senseIds: items.map((i) => i.senseId), limit: items.length },
    });
    setSavingA(false);
    if (res.success && res.data) {
      setSavedDeck({ id: res.data.id, title, senseCount: res.data.senseCount });
      gotoSend("deck", title);
    } else setErrorA(res.error ?? "단어장을 만들지 못했습니다.");
  }, [titleA, subtitleA, items, savingA, gotoSend]);

  /** 카드 B가 만들 spec — 저장과 미리보기가 같은 조립을 써야 "따로"가 없다. */
  const buildSpecB = useCallback((): VocabDeckSpec => {
    // undefined 키는 애초에 만들지 않는다 — 서버가 버리긴 하지만 계약 그대로 보낸다.
    const spec: VocabDeckSpec = { limit: clampInt(countB, 1, 500, 100) };
    if (currentFilter.grades?.length) spec.grades = currentFilter.grades;
    if (currentFilter.tiers?.length) spec.tiers = currentFilter.tiers;
    if (currentFilter.difficulties?.length) spec.difficulties = currentFilter.difficulties;
    if (currentFilter.posList?.length) spec.posList = currentFilter.posList;
    if (currentFilter.trendLabels?.length) spec.trendLabels = currentFilter.trendLabels;
    if (currentFilter.excludePhrase) spec.excludePhrase = true;
    if (currentFilter.excludeStopwords) spec.excludeStopwords = true;
    // ★ 항상 명시한다 — 화면 총계·탐색 표가 대표 뜻(senseOrder=0) 기준이므로
    //   덱 풀도 같은 기준이어야 한다(적대검수: 미명시 시 전 뜻 풀에서 뽑혀
    //   100단어 덱이 표제어 20개의 뜻 홍수가 됐다).
    spec.allSenses = !!currentFilter.allSenses;
    return spec;
  }, [countB, currentFilter]);

  const handleSaveB = useCallback(async () => {
    const title = titleB.trim();
    if (!title || savingB) return;
    setSavingB(true);
    setErrorB(null);
    const res = await createVocabDeck({ title, spec: buildSpecB() });
    setSavingB(false);
    if (res.success && res.data) {
      setSavedDeck({ id: res.data.id, title, senseCount: res.data.senseCount });
      gotoSend("deck", title);
    } else setErrorB(res.error ?? "단어장을 만들지 못했습니다.");
  }, [titleB, savingB, buildSpecB, gotoSend]);

  // 완료 화면 [닫기] — 다음 열기가 목록부터 시작하도록 흐름 상태만 되감는다
  // (담은 단어 자체는 셸 소유라 건드리지 않는다).
  const closeAndReset = useCallback(() => {
    onOpenChange(false);
    setStep("list");
    setDone(null);
  }, [onOpenChange]);

  if (!open) return null;

  // 카드 B 경고 — 이 3개 조건은 VocabDeckSpec 에 없는 키라 저장 시 소실된다.
  // (allSenses·excludeStopwords 는 spec 으로 온전히 저장되므로 넣지 않는다 —
  //  적대검수: 넣어두면 정확히 일치하는 상태에서만 경고가 뜨는 역전이 된다)
  const lossyFilter = !!(
    currentFilter.q ||
    currentFilter.board ||
    currentFilter.minTrapRate !== undefined
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="담은 단어 닫기" onClick={() => onOpenChange(false)} className="absolute inset-0 bg-slate-900/25" />
      <div role="dialog" aria-modal="true" aria-label="담은 단어" className="relative flex h-full w-full flex-col bg-white shadow-2xl sm:w-[460px]">
        {/* ── 헤더 ── */}
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-slate-200 px-3">
          <ShoppingBasket className="size-4 shrink-0 text-blue-600" />
          <h2 className="text-[13px] font-bold">담은 단어</h2>
          <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-blue-600 px-1 text-[10.5px] font-bold tabular-nums text-white">{items.length}</span>
          <button type="button" aria-label="닫기" onClick={() => onOpenChange(false)} className="ml-auto rounded p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-600">
            <X className="size-4" />
          </button>
        </header>

        {/* ── 본문 ── */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {step === "list" ? (
            <>
              {/* ① 담은 단어 목록 */}
              <div className="flex h-9 items-center justify-between px-3">
                <span className="text-[11px] font-bold tracking-wide text-slate-500">담은 단어 {fmt(items.length)}개</span>
                {items.length > 0 && (
                  <button type="button" onClick={onClear} className="text-[11px] font-medium text-slate-400 hover:text-rose-600">비우기</button>
                )}
              </div>
              {items.length === 0 ? (
                <div className="px-3 py-10 text-center">
                  <p className="break-keep text-[12px] text-slate-500">탐색 표의 + 버튼으로 단어를 담아 주세요.</p>
                  <p className="mt-1 break-keep text-[10.5px] text-slate-400">단어를 담지 않아도 아래 「지금 고른 조건으로 만들기」는 그대로 사용할 수 있습니다.</p>
                </div>
              ) : (
                <ul className="border-t border-slate-100">
                  {items.map((it) => (
                    <li key={it.senseId} className="flex h-9 items-center gap-2 border-b border-slate-100 px-3">
                      <span className="shrink-0 text-[12.5px] font-semibold">{it.lemma}</span>
                      <PosChip pos={it.pos} />
                      <span className="min-w-0 flex-1 truncate text-[11.5px] text-slate-500" title={it.senseKo}>{it.senseKo}</span>
                      <button type="button" aria-label={`${it.lemma} 빼기`} onClick={() => onRemove(it.senseId)} className="shrink-0 rounded p-1 text-slate-300 hover:bg-slate-50 hover:text-rose-600">
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* ② 만들기 카드 2장 */}
              <div className="space-y-3 px-3 py-3">
                <section className={`rounded-lg border border-slate-200 p-3 ${items.length === 0 ? "opacity-50" : ""}`}>
                  <h3 className="text-[12px] font-bold">담은 단어로 만들기</h3>
                  <p className="mt-0.5 break-keep text-[10.5px] text-slate-400">골라 담은 뜻 {fmt(items.length)}개가 그대로 단어장이 됩니다.</p>
                  <div className="mt-2.5 space-y-2">
                    <Field label="단어장 이름 (필수)">
                      <input value={titleA} onChange={(e) => setTitleA(e.target.value)} placeholder="예: 3월 모평 대비 어휘 50" disabled={items.length === 0} className={INPUT} />
                    </Field>
                    <Field label="한 줄 소개 (선택)">
                      <input value={subtitleA} onChange={(e) => setSubtitleA(e.target.value)} placeholder="학생 카드에 함께 보입니다" disabled={items.length === 0} className={INPUT} />
                    </Field>
                    {errorA && <p className="break-keep text-[11px] text-rose-600">{errorA}</p>}
                    <div className="flex gap-2">
                      <button type="button" onClick={() => void handleSaveA()} disabled={items.length === 0 || !titleA.trim() || savingA} className={`${BTN_PRIMARY} flex-1`}>
                        {savingA && <Spin />}단어장 저장
                      </button>
                      <button type="button" onClick={() => gotoSend("picks", null)} disabled={items.length === 0 || savingA} className={BTN_GHOST}>저장 없이 바로 보내기</button>
                    </div>
                  </div>
                </section>

                <section className="rounded-lg border border-slate-200 p-3">
                  <h3 className="text-[12px] font-bold">지금 고른 조건으로 만들기</h3>
                  <p className="mt-0.5 text-[10.5px] tabular-nums text-slate-400">지금 조건에 맞는 단어 {fmt(currentTotal)}개</p>
                  <div className="mt-2.5 space-y-2">
                    <Field label="단어장 이름 (필수)">
                      <input value={titleB} onChange={(e) => setTitleB(e.target.value)} placeholder="예: 고3 학술어 집중" className={INPUT} />
                    </Field>
                    <Field label="단어 수 (1~500)">
                      <input type="number" min={1} max={500} value={countB} onChange={(e) => setCountB(e.target.value)} className={`${INPUT} tabular-nums`} />
                    </Field>
                    {lossyFilter && (
                      <p className="break-keep text-[10.5px] text-amber-600">검색어·시험 종류·헷갈림 정도 조건은 단어장에 저장되지 않습니다.</p>
                    )}
                    {errorB && <p className="break-keep text-[11px] text-rose-600">{errorB}</p>}
                    <div className="flex gap-2">
                      <button type="button" onClick={() => void handleSaveB()} disabled={!titleB.trim() || savingB} className={`${BTN_PRIMARY} flex-1`}>
                        {savingB && <Spin />}이 조건으로 저장
                      </button>
                      <button type="button" onClick={() => openPreview({ spec: buildSpecB() })} className={BTN_GHOST} title="지금 조건으로 어떤 단어가 담기는지 미리 봅니다">
                        <Eye className="size-3.5" />어떤 단어가 담기나 보기
                      </button>
                    </div>
                  </div>
                </section>
              </div>
            </>
          ) : done ? (
            /* ── 보내기 완료 ── */
            <div className="flex flex-col items-center px-3 py-14 text-center">
              <CheckCircle2 className="size-8 text-emerald-500" />
              <p className="mt-3 text-[13px] font-bold text-emerald-600">{fmt(done.taskCount)}명에게 보냈습니다</p>
              {done.notice && <p className="mt-1 break-keep text-[11px] text-slate-500">{done.notice}</p>}
              <div className="mt-5 flex gap-2">
                <button type="button" onClick={closeAndReset} className={BTN_PRIMARY}>닫기</button>
                <button type="button" onClick={() => { setDone(null); setStep("list"); }} className={BTN_GHOST}>계속 담기</button>
              </div>
            </div>
          ) : (
            /* ── step "send" — 대상이 바뀌면 key 로 강제 리마운트(제목·유형 초기화) ── */
            <SendStep
              key={`${sendSource}:${savedDeck?.id ?? "picks"}`}
              items={items}
              sendSource={sendSource}
              savedDeck={savedDeck}
              initialTitle={assignInit}
              rosterState={rosterState}
              folders={folders}
              students={students}
              onRetryRoster={loadRoster}
              selected={selected}
              onSelectedChange={setSelected}
              onBack={() => setStep("list")}
              // 보내기 완료 즉시 선택을 비운다 — 다음 배포로 이월되면 오배포다.
              onDone={(d) => {
                setDone(d);
                setSelected(new Set());
              }}
              onPreviewDeck={() => { if (savedDeck) openPreview({ deckId: savedDeck.id }); }}
            />
          )}
        </div>
      </div>

      {preview && <PreviewModal state={preview} onClose={closePreview} />}
    </div>
  );
}
