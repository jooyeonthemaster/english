import { type ReactNode } from "react";
import { type VocabTestMode } from "@/lib/passage-report/analysis-report/schema";
import { cn } from "@/lib/utils";
import type { VocabularyNoteRef, VocabularyRow } from "./types";
import { DelBtn, Field } from "./editable-field";

export function vocabTestHiddenCols(hiddenCols: string[] | undefined, mode: VocabTestMode): string[] {
  const hidden = new Set(hiddenCols ?? []);
  hidden.add("synonyms");
  hidden.add("antonyms");
  if (mode === "hide-meaning") {
    hidden.delete("headword");
    hidden.delete("meaning");
  }
  if (mode === "hide-headword") {
    hidden.delete("headword");
    hidden.delete("meaning");
    hidden.add("pronunciation");
  }
  if (mode === "synonym") {
    // 동의어 쓰기: 표제어·뜻을 단서로 주고 동의어 칸을 빈칸으로.
    hidden.delete("headword");
    hidden.delete("meaning");
    hidden.delete("synonyms");
    hidden.add("pronunciation");
  }
  if (mode === "antonym") {
    // 반의어 쓰기: 표제어·뜻을 단서로 주고 반의어 칸을 빈칸으로.
    hidden.delete("headword");
    hidden.delete("meaning");
    hidden.delete("antonyms");
    hidden.add("pronunciation");
  }
  return [...hidden];
}

export function VocabBlankCell({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <td className={cn("par-vocab-answer-cell", className)}>
      <span className="par-vocab-answer-box" aria-hidden>
        <span className="par-vocab-answer-line" />
      </span>
      {children}
    </td>
  );
}

export function vocabTestRowKey(row: VocabularyRow): string {
  return [row.headword, row.pronunciation ?? "", row.meaning, row.synonyms ?? ""]
    .map((value) => value.trim())
    .join("\u001f");
}

function vocabularyTierForRow(row: VocabularyRow): "core" | "test" | "challenge" {
  if (row.tier) return row.tier;
  if (typeof row.difficulty === "number") {
    if (row.difficulty <= 2) return "core";
    if (row.difficulty >= 4) return "challenge";
  }
  return "test";
}

function vocabularyDifficultyForRow(row: VocabularyRow): number {
  if (typeof row.difficulty === "number") return row.difficulty;
  const tier = vocabularyTierForRow(row);
  if (tier === "core") return 2;
  if (tier === "challenge") return 5;
  return 3;
}

export function isDefaultVocabularyTestTarget(row: VocabularyRow): boolean {
  return vocabularyTierForRow(row) !== "core" && vocabularyDifficultyForRow(row) >= 3;
}

/** 난이도 단계 필터(1·2·3단계 = core·test·challenge)에 걸리는지. 필터가 비거나 없으면 전부 통과. */
export function rowMatchesTierFilter(row: VocabularyRow, filter: ("core" | "test" | "challenge")[] | undefined): boolean {
  if (!filter || filter.length === 0) return true;
  return filter.includes(vocabularyTierForRow(row));
}

export function VocabTestGridCard({
  row,
  hidden,
  mode,
  editable,
  onExclude,
}: {
  row: VocabularyRow;
  hidden: Set<string>;
  mode: VocabTestMode;
  editable: boolean;
  onExclude: () => void;
}) {
  const showHead = !hidden.has("headword");
  const showPron = !hidden.has("pronunciation");
  const showMeaning = !hidden.has("meaning");
  const showSyn = !hidden.has("synonyms");
  const showAnt = !hidden.has("antonyms");
  return (
    <div className="par-vocab-test-card">
      {editable ? <DelBtn className="par-vocab-test-card-exclude" title="이 단어를 시험지에서 제외" onClick={onExclude} /> : null}
      {(showHead || showPron) ? (
        <div className="par-vocab-test-card-head">
          {showHead ? (
            mode === "hide-headword" ? (
              <span className="par-vocab-test-card-blank" />
            ) : (
              <span className="par-vocab-test-card-word">{row.headword}</span>
            )
          ) : null}
          {showPron ? (
            <span className="par-vocab-test-card-pron">{row.pronunciation ?? ""}</span>
          ) : null}
        </div>
      ) : null}
      {showMeaning ? (
        <div className="par-vocab-test-card-line">
          <span className="par-vocab-test-card-label">뜻</span>
          {mode === "hide-meaning" ? <span className="par-vocab-test-card-blank" /> : <span>{row.meaning}</span>}
        </div>
      ) : null}
      {showSyn ? (
        <div className="par-vocab-test-card-line">
          <span className="par-vocab-test-card-label">동의어</span>
          {mode === "synonym" ? <span className="par-vocab-test-card-blank" /> : <span>{row.synonyms ?? ""}</span>}
        </div>
      ) : null}
      {showAnt ? (
        <div className="par-vocab-test-card-line">
          <span className="par-vocab-test-card-label">반의어</span>
          {mode === "antonym" ? <span className="par-vocab-test-card-blank" /> : <span>{row.antonyms ?? ""}</span>}
        </div>
      ) : null}
    </div>
  );
}

/**
 * 단어장(학습용) 2열 컴팩트 카드 — 번호 + 표제어·발음(헤드라인) / 뜻 / 유·반(푸터라인).
 * 표 모드와 동일하게 hiddenCols·인라인 편집·행 삭제를 지원한다.
 */
export function VocabStudyGridCard({
  row,
  no,
  hidden,
  editable,
  onUpdate,
  onDelete,
}: {
  row: VocabularyRow;
  no: number;
  hidden: Set<string>;
  editable: boolean;
  onUpdate: (patch: Partial<VocabularyRow>) => void;
  onDelete: () => void;
}) {
  const showHead = !hidden.has("headword");
  const showPron = !hidden.has("pronunciation") && (editable || !!row.pronunciation?.trim());
  const showMeaning = !hidden.has("meaning");
  const showSyn = !hidden.has("synonyms") && (editable || !!row.synonyms?.trim());
  const showAnt = !hidden.has("antonyms") && (editable || !!row.antonyms?.trim());
  return (
    <div className="par-vocab-study-card">
      {editable ? <DelBtn className="par-vocab-study-card-del" title="단어 행 삭제" onClick={onDelete} /> : null}
      <span className="par-vocab-study-no" aria-hidden>{String(no).padStart(2, "0")}</span>
      <div className="par-vocab-study-main">
        {showHead || showPron ? (
          <div className="par-vocab-study-head">
            {showHead ? (
              <Field as="span" className="par-vocab-study-word" editable={editable} value={row.headword} onCommit={(v) => onUpdate({ headword: v })} />
            ) : null}
            {showPron ? (
              <Field as="span" className="par-vocab-study-pron" editable={editable} value={row.pronunciation ?? ""} placeholder="(발음)" onCommit={(v) => onUpdate({ pronunciation: v })} />
            ) : null}
          </div>
        ) : null}
        {showMeaning ? (
          <Field as="div" className="par-vocab-study-meaning" editable={editable} value={row.meaning} onCommit={(v) => onUpdate({ meaning: v })} />
        ) : null}
        {showSyn || showAnt ? (
          <div className="par-vocab-study-rel">
            {showSyn ? (
              <span className="par-vocab-study-rel-item">
                <span className="par-vocab-study-rel-k">유</span>
                <Field as="span" editable={editable} value={row.synonyms ?? ""} placeholder="(동의어)" onCommit={(v) => onUpdate({ synonyms: v })} />
              </span>
            ) : null}
            {showAnt ? (
              <span className="par-vocab-study-rel-item">
                <span className="par-vocab-study-rel-k">반</span>
                <Field as="span" editable={editable} value={row.antonyms ?? ""} placeholder="(반의어)" onCommit={(v) => onUpdate({ antonyms: v })} />
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function normalizeVocabularyLookupText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function simpleWordForms(word: string): string[] {
  const forms = new Set<string>([word]);
  if (word.length < 3) return [...forms];

  forms.add(`${word}s`);
  forms.add(`${word}es`);

  if (word.endsWith("e")) {
    forms.add(`${word}d`);
    forms.add(`${word.slice(0, -1)}ing`);
  } else {
    forms.add(`${word}ed`);
    forms.add(`${word}ing`);
  }

  if (word.endsWith("y") && !/[aeiou]y$/.test(word)) {
    forms.add(`${word.slice(0, -1)}ies`);
    forms.add(`${word.slice(0, -1)}ied`);
  }

  return [...forms];
}

function vocabularyLookupForms(headword: string): string[] {
  const normalized = normalizeVocabularyLookupText(headword);
  if (!normalized) return [];
  const words = normalized.split(" ");
  if (words.length === 1) {
    return simpleWordForms(words[0]).filter((form) => form.length > 2);
  }

  const prefix = words.slice(0, -1).join(" ");
  const last = words[words.length - 1];
  return simpleWordForms(last)
    .map((form) => `${prefix} ${form}`)
    .filter((form) => form.replace(/\s+/g, "").length > 2);
}

export function sentenceIncludesVocabulary(sentenceEn: string, row: VocabularyRow): boolean {
  const lookupSentence = ` ${normalizeVocabularyLookupText(sentenceEn)} `;
  return vocabularyLookupForms(row.headword).some((form) => lookupSentence.includes(` ${form} `));
}

function normalizedTextWithOffsets(value: string): { text: string; chars: { char: string; start: number; end: number }[] } {
  const chars: { char: string; start: number; end: number }[] = [];
  let lastWasSpace = true;

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (/[a-z0-9]/i.test(char)) {
      chars.push({ char: char.toLowerCase(), start: i, end: i + 1 });
      lastWasSpace = false;
    } else if (!lastWasSpace) {
      chars.push({ char: " ", start: i, end: i + 1 });
      lastWasSpace = true;
    }
  }

  while (chars.at(-1)?.char === " ") chars.pop();
  return { text: chars.map((item) => item.char).join(""), chars };
}

export function findVocabularyInlineMatches(text: string, notes: VocabularyNoteRef[]) {
  const normalized = normalizedTextWithOffsets(text);
  const candidates: { start: number; end: number; note: VocabularyNoteRef }[] = [];

  notes.forEach((note) => {
    vocabularyLookupForms(note.row.headword).forEach((form) => {
      const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(^| )(${escaped})(?= |$)`, "g");
      let match: RegExpExecArray | null;
      while ((match = re.exec(normalized.text)) !== null) {
        const normalizedStart = match.index + match[1].length;
        const normalizedEnd = normalizedStart + match[2].length;
        const first = normalized.chars[normalizedStart];
        const last = normalized.chars[normalizedEnd - 1];
        if (first && last) candidates.push({ start: first.start, end: last.end, note });
      }
    });
  });

  return candidates
    .sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start) || a.note.rowIndex - b.note.rowIndex)
    .reduce<typeof candidates>((selected, candidate) => {
      const overlaps = selected.some((item) => candidate.start < item.end && item.start < candidate.end);
      if (!overlaps) selected.push(candidate);
      return selected;
    }, []);
}

export function vocabularyGlossLabel(note: VocabularyNoteRef): string {
  return [note.row.headword, note.row.pronunciation].filter((value) => value?.trim()).join(" ");
}
