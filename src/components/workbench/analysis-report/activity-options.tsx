import { BookImage, Dice5, Eye, Languages, Minus, Plus } from "lucide-react";

import type {
  ActivityBlock,
  ActivityParams,
} from "@/lib/passage-report/analysis-report/schema";
import {
  defaultNestedDensities,
  normalizeNestedDensities,
} from "@/lib/passage-report/analysis-report/study-activities";

import type { ActivityAction } from "./custom-activity-renders";
import { PanelGroup, SegRow, ToggleRow } from "./panel-primitives";

function computeSentenceNos(preset: string, count: number): number[] | undefined {
  if (count <= 0) return undefined;
  const all = Array.from({ length: count }, (_, i) => i + 1);
  if (preset === "odd") return all.filter((n) => n % 2 === 1);
  if (preset === "even") return all.filter((n) => n % 2 === 0);
  return undefined; // 전체
}
function sentencePreset(nos: number[] | undefined, count: number): "all" | "odd" | "even" {
  if (!nos || nos.length === 0 || nos.length >= count) return "all";
  if (nos.every((n) => n % 2 === 1)) return "odd";
  if (nos.every((n) => n % 2 === 0)) return "even";
  return "all";
}

/** 학습 활동 전용 옵션 — block-edit 패널 안에 활동 종류별로 펼쳐진다 (spacer 높이와 동일 패턴). */
export function ActivityOptions({
  block,
  sentenceCount,
  answerKeyPageOn,
  onActivity,
}: {
  block: ActivityBlock;
  sentenceCount: number;
  answerKeyPageOn: boolean;
  onActivity: (id: string, action: ActivityAction) => void;
}) {
  const p = block.params;
  const isScramble = block.activityKind === "chunk-scramble" || block.activityKind === "word-scramble";
  const isNested = block.activityKind === "nested-cloze";
  const isCloze = block.activityKind === "keyword-cloze" || block.activityKind === "full-cloze" || isNested;
  const isReproduction = block.activityKind === "reproduction";
  const isSlash = block.activityKind === "slash-compose";
  const isProduction = isReproduction || block.activityKind === "sentence-translation" || isSlash;
  const isOrdering = block.activityKind === "sentence-order";
  const isVocabQuiz = block.activityKind === "vocab-quiz";
  const isVocabMatch = block.activityKind === "vocab-match";
  const isChunkGlossCloze = block.activityKind === "chunk-gloss-cloze";
  // 스캐폴드 사다리(영작/복원류)에 wordBank 단계까지 노출할지 — slash 는 단어슬롯/첫글자까지만.
  const hasScaffoldLadder = isReproduction;
  const splitMode = p.splitMode ?? (p.unit === "word" ? "word" : "chunk");
  const scaffoldLevel = p.scaffoldLevel ?? (p.scaffold ? "firstLetter" : "none");
  const clozeDefaultDensity = isNested ? 80 : block.activityKind === "full-cloze" ? 55 : 30;
  const setParam = (patch: Partial<ActivityParams>) => onActivity(block.id, { type: "param", patch });

  return (
    <>
      {isScramble ? (
        <>
          <PanelGroup label="덩어리 분할 방식">
            <SegRow
              options={[
                { value: "chunk", label: "의미 단위" },
                { value: "word", label: "단어" },
                { value: "ngram", label: "N단어" },
              ]}
              value={splitMode}
              onChange={(v) => setParam({ splitMode: v as "chunk" | "word" | "ngram" })}
            />
            {splitMode === "ngram" ? (
              <div className="mt-1.5">
                <SegRow
                  options={[
                    { value: 2, label: "2단어" },
                    { value: 3, label: "3단어" },
                    { value: 4, label: "4단어" },
                  ]}
                  value={p.ngramSize ?? 2}
                  onChange={(v) => setParam({ ngramSize: Number(v) })}
                />
              </div>
            ) : null}
          </PanelGroup>
          <PanelGroup label="구분 표시">
            <SegRow
              options={[
                { value: "slash", label: "/ 슬래시" },
                { value: "pipe", label: "| 막대" },
                { value: "chip", label: "칩" },
              ]}
              value={p.separator ?? "slash"}
              onChange={(v) => setParam({ separator: v as "slash" | "pipe" | "chip" })}
            />
          </PanelGroup>
        </>
      ) : null}

      {isCloze ? (
        <PanelGroup label="빈칸 옵션">
          {!isNested ? (
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={10}
                max={90}
                step={5}
                value={p.density ?? clozeDefaultDensity}
                onChange={(e) => setParam({ density: Number(e.target.value) })}
                className="flex-1 accent-blue-600"
              />
              <span className="w-12 text-right text-[11px] font-semibold text-slate-500">{p.density ?? clozeDefaultDensity}%</span>
            </div>
          ) : null}
          <div className="mb-1 mt-2 text-[10.5px] font-semibold text-slate-400">빈칸 대상</div>
          <SegRow
            options={[
              { value: "content", label: "내용어" },
              { value: "prep", label: "전치사" },
              { value: "conj", label: "접속사" },
            ]}
            value={p.target ?? "content"}
            onChange={(v) => setParam({ target: v as "all" | "content" | "verb" | "prep" | "conj" })}
          />
          {isNested ? (
            (() => {
              const rounds = p.rounds ?? 3;
              const densities = normalizeNestedDensities(
                p.roundDensities && p.roundDensities.length === rounds ? p.roundDensities : defaultNestedDensities(rounds, p.density ?? 80),
              );
              const setRound = (i: number, delta: number) => {
                const next = densities.slice();
                next[i] = Math.min(100, Math.max(10, next[i] + delta));
                const norm = normalizeNestedDensities(next);
                setParam({ roundDensities: norm, density: norm[norm.length - 1] });
              };
              return (
                <>
                  <div className="mb-1 mt-2.5 text-[10.5px] font-semibold text-slate-400">회차 수</div>
                  <SegRow
                    options={[
                      { value: 2, label: "2회" },
                      { value: 3, label: "3회" },
                      { value: 4, label: "4회" },
                    ]}
                    value={rounds}
                    onChange={(v) => {
                      const nr = Number(v);
                      setParam({ rounds: nr, roundDensities: defaultNestedDensities(nr, p.density ?? 80) });
                    }}
                  />
                  <div className="mb-1 mt-2.5 text-[10.5px] font-semibold text-slate-400">회차별 빈칸 밀도</div>
                  <div className="space-y-1">
                    {densities.map((d, i) => (
                      <div key={i} className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-slate-600">{i + 1}회</span>
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => setRound(i, -5)} className="flex h-6 w-6 items-center justify-center rounded-md border border-blue-100 bg-blue-50 text-blue-700 hover:bg-blue-100" title="줄이기">
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-10 text-center text-[11px] font-semibold tabular-nums text-slate-600">{d}%</span>
                          <button type="button" onClick={() => setRound(i, 5)} className="flex h-6 w-6 items-center justify-center rounded-md border border-blue-100 bg-blue-50 text-blue-700 hover:bg-blue-100" title="늘리기">
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[10px] leading-snug text-slate-400">회차가 오를수록 빈칸이 누적됩니다(이전 회차 포함). 낮은 회차를 높이면 이후 회차도 함께 올라가요.</p>
                </>
              );
            })()
          ) : (
            <>
              <div className="mt-2.5">
                <ToggleRow label="단어 은행 표시" on={p.wordBank !== false} onClick={() => setParam({ wordBank: !(p.wordBank !== false) })} icon={<BookImage className="h-3.5 w-3.5" />} />
              </div>
              <div className="mt-1">
                <ToggleRow label="첫 글자 힌트" on={!!p.firstLetterHint} onClick={() => setParam({ firstLetterHint: !p.firstLetterHint })} icon={<Languages className="h-3.5 w-3.5" />} />
              </div>
            </>
          )}
        </PanelGroup>
      ) : null}

      {isProduction ? (
        <PanelGroup label="작성 옵션">
          <div className="mb-1 text-[10.5px] font-semibold text-slate-400">작성선</div>
          <SegRow
            options={[
              { value: 1, label: "1줄" },
              { value: 2, label: "2줄" },
              { value: 3, label: "3줄" },
            ]}
            value={(isSlash ? p.writeLines : p.linesPerSentence) ?? (isSlash ? 1 : 2)}
            onChange={(v) => setParam(isSlash ? { writeLines: Number(v) } : { linesPerSentence: Number(v) })}
          />
          {hasScaffoldLadder || isSlash ? (
            <>
              <div className="mb-1 mt-2.5 text-[10.5px] font-semibold text-slate-400">힌트 (스캐폴드)</div>
              <SegRow
                options={
                  hasScaffoldLadder
                    ? [
                        { value: "none", label: "없음" },
                        { value: "wordSlots", label: "단어 칸" },
                        { value: "firstLetter", label: "첫 글자" },
                        { value: "wordBank", label: "단어 보기" },
                      ]
                    : [
                        { value: "none", label: "없음" },
                        { value: "wordSlots", label: "단어 칸" },
                        { value: "firstLetter", label: "첫 글자" },
                      ]
                }
                value={scaffoldLevel}
                onChange={(v) => setParam({ scaffoldLevel: v as "none" | "wordSlots" | "firstLetter" | "wordBank" })}
              />
              <p className="mt-1 text-[10px] text-slate-400">
                {scaffoldLevel === "none"
                  ? "단서 없이 백지에서 영작 (최난도)"
                  : scaffoldLevel === "wordSlots"
                    ? "단어 수·길이만 칸으로 (철자는 숨김)"
                    : scaffoldLevel === "firstLetter"
                      ? "각 단어 첫 글자만 노출"
                      : "정답 단어를 섞어 ‘단어 보기’로 제공 (가장 쉬움)"}
              </p>
            </>
          ) : null}
          {isReproduction ? (
            <div className="mt-2.5">
              <ToggleRow label="전지문 한 번에 (백지 복원)" on={!!p.wholePassage} onClick={() => setParam({ wholePassage: !p.wholePassage })} icon={<BookImage className="h-3.5 w-3.5" />} />
            </div>
          ) : null}
        </PanelGroup>
      ) : null}

      {isChunkGlossCloze ? (
        <PanelGroup label="빈칸 옵션">
          <div className="mb-1 text-[10.5px] font-semibold text-slate-400">빈칸 밀도</div>
          <div className="flex items-center gap-2">
            <input type="range" min={20} max={80} step={10} value={p.density ?? 40} onChange={(e) => setParam({ density: Number(e.target.value) })} className="flex-1 accent-blue-600" />
            <span className="w-12 text-right text-[11px] font-semibold text-slate-500">{p.density ?? 40}%</span>
          </div>
          <div className="mt-1">
            <ToggleRow label="첫 글자 힌트" on={!!p.firstLetterHint} onClick={() => setParam({ firstLetterHint: !p.firstLetterHint })} icon={<Languages className="h-3.5 w-3.5" />} />
          </div>
        </PanelGroup>
      ) : null}

      {isOrdering ? (
        <PanelGroup label="배열 옵션">
          <div className="mb-1 text-[10.5px] font-semibold text-slate-400">보기 라벨</div>
          <SegRow
            options={[
              { value: "alpha", label: "A · B · C" },
              { value: "circled", label: "① ② ③" },
            ]}
            value={p.labelStyle ?? "alpha"}
            onChange={(v) => setParam({ labelStyle: v as "alpha" | "circled" })}
          />
          <div className="mt-2.5">
            <ToggleRow
              label="첫 문장을 ‘주어진 글’로 고정"
              on={(p.anchor ?? "first") !== "none"}
              onClick={() => setParam({ anchor: (p.anchor ?? "first") === "none" ? "first" : "none" })}
              icon={<Languages className="h-3.5 w-3.5" />}
            />
            <p className="mt-1 text-[10px] text-slate-400">수능 표준형 — 첫 글을 고정하면 정답이 하나로 정해져 모호함이 줄어요.</p>
          </div>
          <div className="mt-2.5">
            <ToggleRow label="한글 해석 함께 표시" on={!!p.showKo} onClick={() => setParam({ showKo: !p.showKo })} icon={<Languages className="h-3.5 w-3.5" />} />
          </div>
        </PanelGroup>
      ) : null}

      {isVocabQuiz ? (
        <PanelGroup label="단어 시험 옵션">
          <div className="mb-1 text-[10.5px] font-semibold text-slate-400">출제 방향</div>
          <SegRow
            options={[
              { value: "hide-meaning", label: "영→한 (뜻쓰기)" },
              { value: "hide-headword", label: "한→영 (단어쓰기)" },
            ]}
            value={p.vocabMode ?? "hide-meaning"}
            onChange={(v) => setParam({ vocabMode: v as "hide-meaning" | "hide-headword" | "eng-eng" | "synonym" })}
          />
          <div className="mb-1 mt-2.5 text-[10.5px] font-semibold text-slate-400">난이도 티어</div>
          <SegRow
            options={[
              { value: "all", label: "전체" },
              { value: "test", label: "시험" },
              { value: "challenge", label: "고난도" },
            ]}
            value={p.tier ?? "all"}
            onChange={(v) => setParam({ tier: v as "all" | "core" | "test" | "challenge" })}
          />
          <div className="mb-1 mt-2.5 text-[10.5px] font-semibold text-slate-400">문항 수</div>
          <SegRow
            options={[
              { value: 10, label: "10" },
              { value: 20, label: "20" },
              { value: 30, label: "30" },
            ]}
            value={p.count ?? 20}
            onChange={(v) => setParam({ count: Number(v) })}
          />
          <div className="mt-2">
            <ToggleRow label="첫 글자 힌트 (한→영)" on={!!p.firstLetterHint} onClick={() => setParam({ firstLetterHint: !p.firstLetterHint })} icon={<Languages className="h-3.5 w-3.5" />} />
          </div>
        </PanelGroup>
      ) : null}

      {isVocabMatch ? (
        <PanelGroup label="매칭 옵션">
          <div className="mb-1 text-[10.5px] font-semibold text-slate-400">매칭 기준</div>
          <SegRow
            options={[
              { value: "synonym", label: "동의/반의어" },
              { value: "meaning", label: "한글 뜻" },
              { value: "pronunciation", label: "발음" },
            ]}
            value={p.matchBy ?? "synonym"}
            onChange={(v) => setParam({ matchBy: v as "synonym" | "meaning" | "pronunciation" })}
          />
          {(p.matchBy ?? "synonym") === "synonym" ? (
            <>
              <div className="mb-1 mt-2.5 text-[10.5px] font-semibold text-slate-400">관계</div>
              <SegRow
                options={[
                  { value: "synonym", label: "동의어" },
                  { value: "antonym", label: "반의어" },
                ]}
                value={p.relation ?? "synonym"}
                onChange={(v) => setParam({ relation: v as "synonym" | "antonym" })}
              />
            </>
          ) : null}
          <div className="mb-1 mt-2.5 text-[10.5px] font-semibold text-slate-400">묶음 수</div>
          <SegRow
            options={[
              { value: 4, label: "4" },
              { value: 6, label: "6" },
              { value: 8, label: "8" },
            ]}
            value={p.count ?? 6}
            onChange={(v) => setParam({ count: Number(v) })}
          />
          <div className="mb-1 mt-2.5 text-[10.5px] font-semibold text-slate-400">디코이 (가짜 보기)</div>
          <SegRow
            options={[
              { value: 0, label: "없음" },
              { value: 1, label: "+1" },
              { value: 2, label: "+2" },
            ]}
            value={p.decoyCount ?? 0}
            onChange={(v) => setParam({ decoyCount: Number(v) })}
          />
          <p className="mt-1 text-[10px] text-slate-400">정답 없는 보기를 추가해 소거 풀이를 막아요 (난이도↑).</p>
        </PanelGroup>
      ) : null}

      {isVocabQuiz || isVocabMatch ? null : (
        <PanelGroup label="포함 문장">
          <SegRow
            options={[
              { value: "all", label: "전체" },
              { value: "odd", label: "홀수" },
              { value: "even", label: "짝수" },
            ]}
            value={sentencePreset(block.sentenceNos, sentenceCount)}
            onChange={(v) => onActivity(block.id, { type: "sentences", sentenceNos: computeSentenceNos(String(v), sentenceCount) })}
          />
          <p className="mt-1.5 text-[10.5px] text-slate-400">
            {block.sentenceNos && block.sentenceNos.length > 0 ? `${block.sentenceNos.length}개 문장 포함` : `전체 ${sentenceCount}개 문장`}
          </p>
        </PanelGroup>
      )}

      {isScramble ? (
        <PanelGroup label="표시 옵션">
          <div className="mb-1 text-[10.5px] font-semibold text-slate-400">한글 해석</div>
          <SegRow
            options={[
              { value: "none", label: "없음" },
              { value: "above", label: "위" },
              { value: "below", label: "아래" },
            ]}
            value={p.koPosition ?? "none"}
            onChange={(v) => setParam({ koPosition: v as "none" | "above" | "below" })}
          />
          <div className="mt-2">
            <ToggleRow label="첫 단위 힌트(제자리)" on={!!p.firstChunkHint} onClick={() => setParam({ firstChunkHint: !p.firstChunkHint })} icon={<Languages className="h-3.5 w-3.5" />} />
          </div>
          <div className="mb-1 mt-2.5 text-[10.5px] font-semibold text-slate-400">작성선</div>
          <SegRow
            options={[
              { value: 0, label: "없음" },
              { value: 1, label: "1줄" },
              { value: 2, label: "2줄" },
            ]}
            value={p.writeLines ?? 1}
            onChange={(v) => setParam({ writeLines: Number(v) })}
          />
        </PanelGroup>
      ) : null}

      <PanelGroup label="정답">
        <ToggleRow
          label="정답을 별도 페이지로 모으기"
          on={answerKeyPageOn}
          onClick={() => onActivity(block.id, { type: "answerKeyPage", on: !answerKeyPageOn })}
          icon={<Eye className="h-3.5 w-3.5" />}
        />
        <p className="mt-1.5 text-[10.5px] text-slate-400">
          끄면 모든 학습 활동의 정답 페이지가 사라져요. (블록별 정답 표시는 블록 위 버튼으로)
        </p>
      </PanelGroup>

      <PanelGroup label="다시 생성">
        <button
          type="button"
          onClick={() => onActivity(block.id, { type: "reroll" })}
          className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 text-[12px] font-semibold text-blue-700 transition-colors hover:bg-blue-100"
        >
          <Dice5 className="h-3.5 w-3.5" /> {isCloze ? "새 빈칸으로 다시" : "다시 섞기"}
        </button>
      </PanelGroup>
    </>
  );
}
