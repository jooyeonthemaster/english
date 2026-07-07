import type { AnalysisSection } from "@/lib/passage-report/analysis-report/schema";
import { cn } from "@/lib/utils";
import { DelBtn, Field } from "./editable-field";
import type { SectionFlowCtx, VocabularyRow } from "./types";
import { VocabBlankCell, VocabStudyGridCard, VocabTestGridCard, isDefaultVocabularyTestTarget, rowMatchesTierFilter, vocabTestHiddenCols, vocabTestRowKey } from "./vocabulary";

export function vocabularySectionFlow(section: Extract<AnalysisSection, { kind: "vocabulary" }>, ctx: SectionFlowCtx): void {
  const { editable, commit, push, options } = ctx;
const s = section;
      const mode = options?.vocabTestOnly && (s.vocabTestMode ?? "study") === "study" ? "hide-meaning" : s.vocabTestMode ?? "study";
      const h = new Set(s.hiddenCols ?? []);
      const upd = (i: number, p: Partial<(typeof s.rows)[number]>) => commit({ ...s, rows: s.rows.map((r, j) => (j === i ? { ...r, ...p } : r)) });
      const delRow = (i: number) => commit({ ...s, rows: s.rows.filter((_, j) => j !== i) });
      if (!options?.vocabTestOnly && (s.vocabStudyLayout ?? "table") === "two-column") {
        // 단어장 2열 카드 — 난이도 필터를 통과한 행을 순서대로 2개씩 짝지어 한 행(grid row)으로.
        const visible = s.rows
          .map((row, index) => ({ row, index }))
          .filter(({ row }) => rowMatchesTierFilter(row, s.vocabTierFilter));
        for (let j = 0; j < visible.length; j += 2) {
          const left = visible[j];
          const right = visible[j + 1];
          push(
            "vocab-grid",
            `study-grid${left.index}`,
            <div className="par-vocab-study-grid-row">
              <VocabStudyGridCard
                row={left.row}
                no={j + 1}
                hidden={h}
                editable={editable}
                onUpdate={(p) => upd(left.index, p)}
                onDelete={() => delRow(left.index)}
              />
              {right ? (
                <VocabStudyGridCard
                  row={right.row}
                  no={j + 2}
                  hidden={h}
                  editable={editable}
                  onUpdate={(p) => upd(right.index, p)}
                  onDelete={() => delRow(right.index)}
                />
              ) : (
                <div className="par-vocab-study-card par-vocab-study-card-empty" aria-hidden />
              )}
            </div>,
          );
        }
      } else if (!options?.vocabTestOnly) {
        s.rows.forEach((r, i) => {
          // 난이도 단계 필터 — 표시할 단계에 없으면 단어장에서 숨김(인덱스는 보존해 편집 위치 유지).
          if (!rowMatchesTierFilter(r, s.vocabTierFilter)) return;
          const visibleCols = (["headword", "pronunciation", "meaning", "synonyms", "antonyms"] as const).filter((key) => !h.has(key));
          const deleteAnchor = visibleCols[visibleCols.length - 1];
          const rowDelete = editable ? <DelBtn className="par-table-row-delete" title="단어 행 삭제" onClick={() => delRow(i)} /> : null;
          push(
            "vocab",
            `row${i}`,
            <>
              {!h.has("headword") ? (
                <td className={cn("par-cell-head", deleteAnchor === "headword" && "par-table-row-delete-cell")}>
                  <Field as="span" editable={editable} value={r.headword} onCommit={(v) => upd(i, { headword: v })} />
                  {deleteAnchor === "headword" ? rowDelete : null}
                </td>
              ) : null}
              {!h.has("pronunciation") ? (
                <td className={cn("par-cell-pron", deleteAnchor === "pronunciation" && "par-table-row-delete-cell")}>
                  <Field as="span" editable={editable} value={r.pronunciation ?? ""} onCommit={(v) => upd(i, { pronunciation: v })} />
                  {deleteAnchor === "pronunciation" ? rowDelete : null}
                </td>
              ) : null}
              {!h.has("meaning") ? (
                <td className={cn(deleteAnchor === "meaning" && "par-table-row-delete-cell")}>
                  <Field as="span" editable={editable} value={r.meaning} onCommit={(v) => upd(i, { meaning: v })} />
                  {deleteAnchor === "meaning" ? rowDelete : null}
                </td>
              ) : null}
              {!h.has("synonyms") ? (
                <td className={cn("par-cell-syn", deleteAnchor === "synonyms" && "par-table-row-delete-cell")}>
                  <Field as="span" editable={editable} value={r.synonyms ?? ""} onCommit={(v) => upd(i, { synonyms: v })} />
                  {deleteAnchor === "synonyms" ? rowDelete : null}
                </td>
              ) : null}
              {!h.has("antonyms") ? (
                <td className={cn("par-cell-ant", deleteAnchor === "antonyms" && "par-table-row-delete-cell")}>
                  <Field as="span" editable={editable} value={r.antonyms ?? ""} onCommit={(v) => upd(i, { antonyms: v })} />
                  {deleteAnchor === "antonyms" ? rowDelete : null}
                </td>
              ) : null}
            </>,
            { hiddenCols: s.hiddenCols },
          );
        });
      }
      if (mode !== "study" && s.rows.length > 0) {
        const testHiddenCols = vocabTestHiddenCols(s.hiddenCols, mode);
        const th = new Set(testHiddenCols);
        const excluded = new Set(s.vocabTestExcludedKeys ?? []);
        const tierFilter = s.vocabTierFilter;
        const testRows = s.rows
          .map((row, index) => ({ row, index, key: vocabTestRowKey(row) }))
          // 난이도 단계 필터가 있으면 그 단계로, 없으면 기본(쉬운 core 제외 = test+challenge).
          .filter(({ row }) => (tierFilter && tierFilter.length > 0 ? rowMatchesTierFilter(row, tierFilter) : isDefaultVocabularyTestTarget(row)))
          .filter(({ key }) => !excluded.has(key));
        const visibleTestCols = (["headword", "pronunciation", "meaning", "synonyms", "antonyms"] as const).filter((key) => !th.has(key));
        const deleteAnchor = visibleTestCols[visibleTestCols.length - 1];
        const excludeFromTest = (row: VocabularyRow) => {
          const key = vocabTestRowKey(row);
          commit({ ...s, vocabTestExcludedKeys: [...new Set([...(s.vocabTestExcludedKeys ?? []), key])] });
        };
        const modeLabel =
          mode === "hide-meaning" ? "뜻 쓰기" : mode === "hide-headword" ? "단어 쓰기" : mode === "synonym" ? "동의어 쓰기" : "반의어 쓰기";
        push(
          "note",
          "vocab-test-head",
          <div className="par-vocab-test-head">
            <span className="par-vocab-test-k">단어 시험지</span>
            <span className="par-vocab-test-mode">{modeLabel}</span>
          </div>,
          // 단어 시험지는 항상 새 페이지에서 시작.
          { breakBefore: true },
        );
        if (testRows.length === 0) {
          push(
            "note",
            "vocab-test-empty",
            <div className="par-vocab-test-empty">시험지에 표시할 단어가 없습니다.</div>,
          );
        }
        if (s.vocabTestLayout === "two-column" && testRows.length > 0) {
          for (let j = 0; j < testRows.length; j += 2) {
            const left = testRows[j];
            const right = testRows[j + 1];
            push(
              "vocab-grid",
              `vtest-grid${left.index}`,
              <div className="par-vocab-test-grid-row">
                <VocabTestGridCard
                  row={left.row}
                  hidden={th}
                  mode={mode}
                  editable={editable}
                  onExclude={() => excludeFromTest(left.row)}
                />
                {right ? (
                  <VocabTestGridCard
                    row={right.row}
                    hidden={th}
                    mode={mode}
                    editable={editable}
                    onExclude={() => excludeFromTest(right.row)}
                  />
                ) : (
                  <div className="par-vocab-test-card par-vocab-test-card-empty" aria-hidden />
                )}
              </div>,
            );
          }
        } else {
          testRows.forEach(({ row: r, index: i }) => {
          const testExclude = editable ? (
            <DelBtn
              className="par-table-row-delete par-vocab-test-exclude"
              title="이 단어를 시험지에서 제외"
              onClick={() => excludeFromTest(r)}
            />
          ) : null;
          push(
            "vocab",
            `vtest-row${i}`,
            <>
              {!th.has("headword") ? (
                mode === "hide-headword" ? (
                  <VocabBlankCell className={cn("par-cell-head", deleteAnchor === "headword" && "par-table-row-delete-cell")}>
                    {deleteAnchor === "headword" ? testExclude : null}
                  </VocabBlankCell>
                ) : (
                  <td className={cn("par-cell-head", deleteAnchor === "headword" && "par-table-row-delete-cell")}>
                    {r.headword}
                    {deleteAnchor === "headword" ? testExclude : null}
                  </td>
                )
              ) : null}
              {!th.has("pronunciation") ? (
                <td className={cn("par-cell-pron", deleteAnchor === "pronunciation" && "par-table-row-delete-cell")}>
                  {r.pronunciation ?? ""}
                  {deleteAnchor === "pronunciation" ? testExclude : null}
                </td>
              ) : null}
              {!th.has("meaning") ? (
                mode === "hide-meaning" ? (
                  <VocabBlankCell className={cn(deleteAnchor === "meaning" && "par-table-row-delete-cell")}>
                    {deleteAnchor === "meaning" ? testExclude : null}
                  </VocabBlankCell>
                ) : (
                  <td className={cn(deleteAnchor === "meaning" && "par-table-row-delete-cell")}>
                    {r.meaning}
                    {deleteAnchor === "meaning" ? testExclude : null}
                  </td>
                )
              ) : null}
              {!th.has("synonyms") ? (
                mode === "synonym" ? (
                  <VocabBlankCell className={cn("par-cell-syn", deleteAnchor === "synonyms" && "par-table-row-delete-cell")}>
                    {deleteAnchor === "synonyms" ? testExclude : null}
                  </VocabBlankCell>
                ) : (
                  <td className={cn("par-cell-syn", deleteAnchor === "synonyms" && "par-table-row-delete-cell")}>
                    {r.synonyms ?? ""}
                    {deleteAnchor === "synonyms" ? testExclude : null}
                  </td>
                )
              ) : null}
              {!th.has("antonyms") ? (
                mode === "antonym" ? (
                  <VocabBlankCell className={cn("par-cell-ant", deleteAnchor === "antonyms" && "par-table-row-delete-cell")}>
                    {deleteAnchor === "antonyms" ? testExclude : null}
                  </VocabBlankCell>
                ) : (
                  <td className={cn("par-cell-ant", deleteAnchor === "antonyms" && "par-table-row-delete-cell")}>
                    {r.antonyms ?? ""}
                    {deleteAnchor === "antonyms" ? testExclude : null}
                  </td>
                )
              ) : null}
            </>,
            { hiddenCols: testHiddenCols },
          );
          });
        }
      }
}
