"use client";

// 「보낸 단어장」 관리 패널 — 셸 본문 전체(탐색 3열 대신 렌더).
// ⓪ 단계별 교재(spec.series 그룹 — 카드·그룹핑은 series-book-card.tsx) ① 우리 학원 단어장 =
// 단계로 나뉘지 않은 단일 덱(미리보기·보내기·보관) ② 보낸 기록. 질의는 병렬·독립 실패, 미리보기는
// 학생 서빙과 동일 해석기(previewVocabDeck) — 교재 단계 칩도 같은 모달을 재사용한다.
// ★ 용어 규약(적대검수 2026-08-10): **교재**(단계로 나뉜 것) ≠ **단어장**(단일 덱) — 제목·버튼·캡션·
//   빈 상태에서 섞지 않는다. 둘이 함께 담기는 곳(「보관함」·보낸 기록·목록 질의)은 중립 문구를 쓴다.

import { useCallback, useEffect, useRef, useState } from "react";
import { BookPlus, ChevronDown, ChevronRight, RotateCw, X } from "lucide-react";
import {
  archiveVocabDeck,
  restoreVocabDeck,
  listVocabDecks,
  previewVocabDeck,
  type VocabDeckPreviewRow,
  type VocabDeckRow,
} from "@/actions/vocab-drill-admin/decks";
import {
  listVocabDeployments,
  type VocabDeploymentRow,
} from "@/actions/vocab-drill-admin/deployments";
import { VOCAB_ITEM_TYPE_LABELS } from "@/lib/vocab-drill/display";
import { DiffDots, fmt, PosChip, SectionTitle, TierChip } from "./wordbook-ui";
import { DeckCard } from "./deck-card";
import { groupSeriesBooks, SeriesBooksSection, type SeriesBook } from "./series-book-card";
import type { WordbookPresetSeries } from "./wordbook-types";

interface DeploymentsPanelProps {
  onSendDeck: (deck: { id: string; title: string; senseCount: number }) => void;
  /** 교재 「학생에게 보내기」 — 우측 슬라이드를 교재 모드로 연다. 미전달 시 버튼 숨김(하위 호환) */
  onSendSeries?: (series: WordbookPresetSeries) => void;
  /** 교재 만들기 위저드 열기 — 미전달 시 관련 버튼은 숨긴다(하위 호환) */
  onCreateBook?: () => void;
}

// ── 날짜 — date-fns 금지 규약. M.D 짧은 표기 + title 에 전체 일시 ─────────────

function md(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

function fullDt(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR");
}

// ── 상태 라벨 — 데이터 값(영문 enum)을 화면에 그대로 내보내지 않는다 ─────────

const DEPLOY_STATUS: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: "진행 중", cls: "text-blue-600" },
  CLOSED: { label: "마감", cls: "text-slate-400" },
  ARCHIVED: { label: "보관", cls: "text-slate-300" },
};

/** 보낸 기록 테이블 헤더 — 짧은 표기 + title 로 풀어 쓰기(순화 규약). */
const DEPLOY_HEADS: { label: string; title?: string; right?: boolean }[] = [
  { label: "보낸 날" },
  { label: "과제 제목" },
  { label: "단어장·단계", title: "과제에 쓴 단어장입니다. 교재로 보낸 과제는 「교재 이름 · N단계」로 보입니다" },
  { label: "대상" },
  { label: "문항 수", title: "한 학생이 푸는 문제 수입니다", right: true },
  { label: "유형", title: "문제를 내는 방식입니다" },
  { label: "진행", title: "끝낸 학생 수 / 받은 학생 수" },
  { label: "마감" },
  { label: "상태" },
];

function itemTypeKo(t: string): string {
  return (VOCAB_ITEM_TYPE_LABELS as Record<string, string>)[t] ?? t;
}

function RetryBlock({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12px] text-slate-500">
      <span className="break-keep">{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11.5px] font-medium text-slate-600 hover:bg-slate-50"
      >
        <RotateCw className="size-3" /> 다시 불러오기
      </button>
    </div>
  );
}

// ── 패널 본체 ────────────────────────────────────────────────────────────────

export function DeploymentsPanel({ onSendDeck, onSendSeries, onCreateBook }: DeploymentsPanelProps) {
  // 두 섹션 데이터는 독립 — 각자 로딩·실패 상태를 갖는다.
  const [decks, setDecks] = useState<VocabDeckRow[] | null>(null);
  const [decksLoading, setDecksLoading] = useState(true);
  const [decksError, setDecksError] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [deckNotice, setDeckNotice] = useState<string | null>(null);
  // 교재 단위 상태 — 전체 보관 진행 중인 교재 key(발송은 셸의 우측 슬라이드가 담당).
  const [archivingSeries, setArchivingSeries] = useState<string | null>(null);

  const [deploys, setDeploys] = useState<VocabDeploymentRow[] | null>(null);
  const [deploysLoading, setDeploysLoading] = useState(true);
  const [deploysError, setDeploysError] = useState(false);

  // 미리보기 모달 — 빠른 열고닫기 경합을 seq 로 가드(스테일 응답이 새 모달을 덮지 않게).
  const previewSeq = useRef(0);
  const [preview, setPreview] = useState<{ deckId: string; title: string } | null>(null);
  const [previewRows, setPreviewRows] = useState<VocabDeckPreviewRow[]>([]);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);

  const loadDecks = useCallback(async () => {
    setDecksLoading(true);
    setDecksError(false);
    try {
      setDecks(await listVocabDecks());
    } catch {
      setDecksError(true);
    } finally {
      setDecksLoading(false);
    }
  }, []);

  const loadDeploys = useCallback(async () => {
    setDeploysLoading(true);
    setDeploysError(false);
    try {
      setDeploys(await listVocabDeployments());
    } catch {
      setDeploysError(true);
    } finally {
      setDeploysLoading(false);
    }
  }, []);

  useEffect(() => {
    // 병렬 — await 로 직렬화하지 않는다(한쪽 지연이 다른 쪽을 막으면 안 된다).
    void loadDecks();
    void loadDeploys();
  }, [loadDecks, loadDeploys]);

  // 섹션 알림 자동 소거(보관 실패 등)
  useEffect(() => {
    if (!deckNotice) return;
    const t = setTimeout(() => setDeckNotice(null), 3200);
    return () => clearTimeout(t);
  }, [deckNotice]);

  const handleArchive = useCallback(
    async (deckId: string) => {
      // 학생 목록에서 즉시 사라지는 동작이라 한 번 확인한다(되살리기는 가능).
      if (!window.confirm("이 단어장을 보관할까요? 학생 목록에서 사라지며, 아래 「보관함」에서 되살릴 수 있습니다.")) return;
      setArchivingId(deckId);
      try {
        const res = await archiveVocabDeck(deckId);
        if (!res.success) {
          setDeckNotice(res.error ?? "단어장을 보관하지 못했습니다.");
          return;
        }
        await loadDecks();
      } catch {
        setDeckNotice("단어장을 보관하지 못했습니다.");
      } finally {
        setArchivingId(null);
      }
    },
    [loadDecks],
  );

  const handleRestore = useCallback(
    async (deckId: string) => {
      setArchivingId(deckId);
      try {
        const res = await restoreVocabDeck(deckId);
        if (!res.success) {
          setDeckNotice(res.error ?? "보관함에서 되살리지 못했습니다.");
          return;
        }
        await loadDecks();
      } catch {
        setDeckNotice("보관함에서 되살리지 못했습니다.");
      } finally {
        setArchivingId(null);
      }
    },
    [loadDecks],
  );

  // 교재 전체 보관 — 전 단계 순차 보관 후 재로드. 부분 실패는 알림으로 계상.
  const handleArchiveSeries = useCallback(
    async (book: SeriesBook) => {
      const msg = `교재 「${book.title}」의 ${book.units.length}개 단계를 모두 보관할까요? 학생 목록에서 사라지며, 아래 「보관함」에서 단계별로 되살릴 수 있습니다.`;
      if (!window.confirm(msg)) return;
      setArchivingSeries(book.key);
      try {
        let failed = 0;
        for (const u of book.units) {
          const res = await archiveVocabDeck(u.deckId).catch(() => null);
          if (!res?.success) failed += 1;
        }
        if (failed > 0) setDeckNotice(`${failed}개 단계를 보관하지 못했습니다.`);
        await loadDecks();
      } finally {
        setArchivingSeries(null);
      }
    },
    [loadDecks],
  );

  const openPreview = useCallback(async (deck: { deckId: string; title: string }) => {
    const seq = ++previewSeq.current;
    setPreview(deck);
    setPreviewLoading(true);
    setPreviewError(false);
    setPreviewRows([]);
    setPreviewTotal(0);
    try {
      const res = await previewVocabDeck({ deckId: deck.deckId });
      if (seq !== previewSeq.current) return;
      if (!res.success || !res.data) {
        setPreviewError(true);
        return;
      }
      setPreviewRows(res.data.rows);
      setPreviewTotal(res.data.total);
    } catch {
      if (seq === previewSeq.current) setPreviewError(true);
    } finally {
      if (seq === previewSeq.current) setPreviewLoading(false);
    }
  }, []);

  const closePreview = useCallback(() => {
    ++previewSeq.current;
    setPreview(null);
  }, []);

  // series 보유 활성 덱 → 교재 묶음, 나머지 → 단일 단어장. 보관 목록엔 둘이 섞인다(→「보관함」).
  const { books, standalone } = groupSeriesBooks(decks ?? []);
  const archived = (decks ?? []).filter((d) => d.status === "ARCHIVED");

  return (
    <section className="min-h-0 flex-1 overflow-y-auto">
      <div className="px-4 py-4">
        {deckNotice ? (
          <p className="mb-2 rounded-md bg-rose-50 px-2.5 py-1.5 text-[11.5px] text-rose-700 break-keep">{deckNotice}</p>
        ) : null}

        {/* ── ⓪ 단계별 교재 — 교재 1개 이상이면 카드, 없으면 위저드 안내 스트립 ── */}
        <SeriesBooksSection
          ready={!decksLoading && !decksError}
          books={books}
          hasStandalone={standalone.length > 0}
          archivingKey={archivingSeries}
          onPreviewUnit={(u) => void openPreview(u)}
          onSendSeries={onSendSeries}
          onArchiveAll={(b) => void handleArchiveSeries(b)}
          onCreateBook={onCreateBook}
        />

        {/* ── ① 우리 학원 단어장(단일 덱만 — 교재는 ⓪) ── */}
        <SectionTitle hint="단계로 나뉘지 않은 단일 단어장입니다 — 고르면 바로 보낼 수 있습니다">우리 학원 단어장</SectionTitle>
        {decksLoading ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[118px] animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        ) : decksError ? (
          <RetryBlock message="교재·단어장 목록을 불러오지 못했습니다." onRetry={() => void loadDecks()} />
        ) : standalone.length === 0 ? (
          books.length > 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-[12px] text-slate-400 break-keep">
              교재 외에 따로 만든 단어장은 없습니다.
            </p>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-slate-200 px-4 py-10 text-center">
              <p className="text-[12.5px] text-slate-500 break-keep">
                아직 만든 교재도, 단어장도 없습니다. 추천 커리큘럼으로 단계별 교재를 만들거나, 「단어 찾기」에서 단어를 담아 단어장으로 저장해 보세요.
              </p>
              {onCreateBook ? (
                <button
                  type="button"
                  onClick={onCreateBook}
                  className="flex h-10 items-center gap-1.5 rounded-lg bg-blue-600 px-5 text-[13px] font-semibold text-white transition-colors hover:bg-blue-700"
                >
                  <BookPlus className="size-4" /> 교재 만들기
                </button>
              ) : null}{/* prop 미전달 시 버튼 숨김(하위 호환) */}
            </div>
          )
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {standalone.map((d) => (
              <DeckCard
                key={d.id}
                deck={d}
                archived={false}
                archiving={archivingId === d.id}
                onPreview={() => void openPreview({ deckId: d.id, title: d.title })}
                onSend={() => onSendDeck({ id: d.id, title: d.title, senseCount: d.senseCountCache })}
                onArchive={() => void handleArchive(d.id)}
              />
            ))}
          </div>
        )}

        {/* 보관함 — 접이식. 단어장과 교재 단계가 함께 들어온다(미리보기·되살리기 가능) */}
        {archived.length > 0 ? (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setArchivedOpen((v) => !v)}
              title="보관한 단어장과 교재 단계가 함께 들어 있습니다"
              className="flex items-center gap-1 text-[11.5px] font-medium text-slate-400 hover:text-slate-600"
            >
              {archivedOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              보관함 <span className="tabular-nums">{archived.length}</span>개
            </button>
            {archivedOpen ? (
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {archived.map((d) => (
                  <DeckCard
                    key={d.id}
                    deck={d}
                    archived
                    archiving={archivingId === d.id}
                    onPreview={() => void openPreview({ deckId: d.id, title: d.title })}
                    onSend={() => {}}
                    onArchive={() => {}}
                    onRestore={() => void handleRestore(d.id)}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* ── ② 보낸 기록 ── */}
        <div className="mt-6">
          <SectionTitle hint="최근 50건까지 보여 드립니다">보낸 기록</SectionTitle>
          {deploysLoading ? (
            <div className="space-y-1.5">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-8 animate-pulse rounded-md bg-slate-100" />
              ))}
            </div>
          ) : deploysError ? (
            <RetryBlock message="보낸 기록을 불러오지 못했습니다." onRetry={() => void loadDeploys()} />
          ) : !deploys || deploys.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-[12px] text-slate-400 break-keep">
              아직 학생에게 보낸 기록이 없습니다.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[760px] text-[12.5px]">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[11px] text-slate-400">
                    {DEPLOY_HEADS.map((h) => (
                      <th key={h.label} title={h.title} className={`px-2.5 py-1.5 font-medium ${h.right ? "text-right" : ""}`}>
                        {h.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {deploys.map((row) => {
                    const st = DEPLOY_STATUS[row.status] ?? { label: row.status, cls: "text-slate-400" };
                    const pct =
                      row.studentTotal > 0 ? Math.round((row.studentDone / row.studentTotal) * 100) : 0;
                    return (
                      <tr key={row.assignmentId} className="border-b border-slate-200 last:border-b-0">
                        <td className="px-2.5 py-1.5 tabular-nums text-slate-500 whitespace-nowrap" title={fullDt(row.createdAt)}>
                          {md(row.createdAt)}
                        </td>
                        <td className="max-w-[180px] px-2.5 py-1.5">
                          <span className="block truncate font-medium text-slate-700" title={row.title}>{row.title}</span>
                        </td>
                        <td className="max-w-[180px] px-2.5 py-1.5">
                          <span className="block truncate text-slate-500" title={row.deckLabels.join(" · ")}>{row.deckLabels.join(" · ")}</span>
                        </td>
                        <td className="max-w-[130px] px-2.5 py-1.5">
                          <span className="block truncate text-slate-500" title={row.targetSummary ?? undefined}>{row.targetSummary ?? "—"}</span>
                        </td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums text-slate-600">{fmt(row.count)}</td>
                        <td
                          className="px-2.5 py-1.5 text-slate-500 whitespace-nowrap"
                          title={
                            row.itemTypes.length
                              ? row.itemTypes.map(itemTypeKo).join(" · ")
                              : "유형을 고르지 않아 여러 유형을 자동으로 섞습니다"
                          }
                        >
                          {row.itemTypes.length
                            ? `${itemTypeKo(row.itemTypes[0])}${row.itemTypes.length > 1 ? ` +${row.itemTypes.length - 1}` : ""}`
                            : "자동 섞기"}
                        </td>
                        <td className="px-2.5 py-1.5 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="tabular-nums text-slate-600">{row.studentDone}/{row.studentTotal}</span>
                            <span className="inline-block h-1 w-16 overflow-hidden rounded-full bg-slate-100">
                              <span className="block h-full rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
                            </span>
                          </span>
                        </td>
                        <td className="px-2.5 py-1.5 tabular-nums text-slate-500 whitespace-nowrap" title={row.dueAt ? fullDt(row.dueAt) : undefined}>
                          {row.dueAt ? md(row.dueAt) : "—"}
                        </td>
                        <td className={`px-2.5 py-1.5 font-medium whitespace-nowrap ${st.cls}`}>{st.label}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── ③ 미리보기 모달 — 백드롭 클릭으로 닫기 ── */}
      {preview ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={closePreview}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-4 py-2.5">
              <h4 className="min-w-0 flex-1 truncate text-[13px] font-bold" title={preview.title}>
                {preview.title}
              </h4>
              {!previewLoading && !previewError ? (
                <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
                  전체 {fmt(previewTotal)}개 중 앞 {fmt(previewRows.length)}개
                </span>
              ) : null}
              <button
                type="button"
                onClick={closePreview}
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-50 hover:text-slate-600"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {previewLoading ? (
                <div className="space-y-1.5 p-4">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-7 animate-pulse rounded-md bg-slate-100" />
                  ))}
                </div>
              ) : previewError ? (
                <div className="p-4">
                  <RetryBlock message="미리보기를 불러오지 못했습니다." onRetry={() => void openPreview(preview)} />
                </div>
              ) : (
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[11px] text-slate-400">
                      {["단어", "품사", "뜻", "수준", "난이도"].map((h) => (
                        <th key={h} className="px-2.5 py-1.5 font-medium first:pl-3.5 last:pr-3.5">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r) => (
                      <tr key={r.senseId} className="border-b border-slate-100 last:border-b-0">
                        <td className="px-2.5 py-1.5 pl-3.5 font-medium text-slate-700 whitespace-nowrap">{r.lemma}</td>
                        <td className="px-2.5 py-1.5"><PosChip pos={r.pos} /></td>
                        <td className="max-w-[220px] px-2.5 py-1.5">
                          <span className="block truncate text-slate-600" title={r.senseKo}>{r.senseKo}</span>
                        </td>
                        <td className="px-2.5 py-1.5"><TierChip tier={r.tier} /></td>
                        <td className="px-2.5 py-1.5 pr-3.5"><DiffDots n={r.difficulty} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      ) : null}

    </section>
  );
}
