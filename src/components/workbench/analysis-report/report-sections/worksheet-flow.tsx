import type { ReactNode } from "react";
import type { AnalysisSection } from "@/lib/passage-report/analysis-report/schema";
import { getConsolidatedWordOrders, toStudentVocabularyClozePassage, toStudentWorksheetWordBank, worksheetAnswersAreHidden, worksheetClozeTranslationsAreHidden } from "@/lib/passage-report/analysis-report/worksheet-surface";
import { Field, renderGrammarChoiceText } from "./editable-field";
import type { LearningWorksheetSection, SectionFlowCtx } from "./types";
import { EditableSectionLabel, miniHeadProps, WordBank, WorksheetLogicMapBlock, WorksheetMiniTitle, WorksheetQuestionCard, worksheetAnswerKeySubsections } from "./worksheet";

export function worksheetSectionFlow(section: Extract<AnalysisSection, { kind: "learning-worksheet" }>, ctx: SectionFlowCtx): void {
  const { si, editable, commit, push, options } = ctx;
const s = section;
      const patch = (p: Partial<LearningWorksheetSection>) => commit({ ...s, ...p });
      /**
       * 26-07-22 조판 수정: 소단원(빈칸·연습·드릴·단어배열)을 통짜 1블록이 아니라
       * 문항 단위 ws-list 조각으로 push 한다. 조각들은 runs.tsx 가 orderId(옛 블록
       * id) 단위로 한 par-ws-block 박스로 병합 렌더하고, packFlow 는 페이지 경계에서
       * 조각 단위로 나눈다 — 첫 콘텐츠 블록이 잔여 공간보다 크면 섹션 첫 페이지가
       * 헤더만 남고 통째로 비던 결함의 근본 수정. orderId/editId 를 옛 id 로 유지해
       * 저장 문서의 blockOrder·hidden 메타·선택/드래그가 그대로 호환된다.
       */
      const pushWsList = (blockKey: string, parts: ReactNode[]) => {
        const groupId = `s${si}-${blockKey}`;
        parts.forEach((node, idx) => {
          push("ws-list", `${blockKey}::p${idx}`, node, {
            orderId: groupId,
            editId: groupId,
            showGrip: idx === 0,
            resizable: false,
          });
        });
      };
      const workbookSet = s.workbookSet;
      const consolidatedWordOrders = getConsolidatedWordOrders(s);
      const showDrillWordOrders = !workbookSet && !!s.drills?.wordOrders?.length;
      const showAnswerKey = !worksheetAnswersAreHidden(s);
      const showClozeTranslations = !worksheetClozeTranslationsAreHidden(s);
      push(
        "note",
        "ws-title",
        <div className="par-ws-title">
          <Field as="div" className="par-ws-title-k" editable={editable} value={s.title} onCommit={(v) => patch({ title: v })} />
          {s.note ? <Field as="div" className="par-ws-note" editable={editable} value={s.note} onCommit={(v) => patch({ note: v })} /> : null}
        </div>,
      );
      if (!options?.skipWorksheetLogic) {
        push(
          "note",
          "ws-logic",
          <WorksheetLogicMapBlock section={s} editable={editable} onPatch={patch} />,
        );
      }
      if (s.cloze) {
        const clozeItemNode = (item: NonNullable<typeof s.cloze>["items"][number], i: number) => (
          <div className="par-ws-cloze">
            <div className="par-ws-cloze-en">
              <span className="par-ws-cloze-no">({item.no})</span>
              <Field
                as="span"
                editable={editable}
                value={item.text}
                onCommit={(v) =>
                  s.cloze &&
                  patch({
                    cloze: { ...s.cloze, items: s.cloze.items.map((entry, j) => (i === j ? { ...entry, text: v } : entry)) },
                  })
                }
              />
            </div>
            {showClozeTranslations && item.translation ? (
              <Field
                as="div"
                className="par-ws-cloze-ko"
                editable={editable}
                value={item.translation}
                onCommit={(v) =>
                  s.cloze &&
                  patch({
                    cloze: { ...s.cloze, items: s.cloze.items.map((entry, j) => (i === j ? { ...entry, translation: v } : entry)) },
                  })
                }
              />
            ) : null}
          </div>
        );
        const clozeBank = toStudentWorksheetWordBank(s.cloze.wordBank, s.cloze.items);
        const clozeParts: ReactNode[] = [
          // 미니제목은 첫 문항과 한 조각 — 페이지 바닥에 제목만 남는 고아 방지.
          <>
            <WorksheetMiniTitle
              {...miniHeadProps(s, patch, editable, "ws-cloze", s.cloze.title, "Key Phrase Cloze", (v) =>
                s.cloze ? patch({ cloze: { ...s.cloze, title: v } }) : undefined,
              )}
            />
            {s.cloze.items.length ? clozeItemNode(s.cloze.items[0], 0) : null}
          </>,
          ...s.cloze.items.slice(1).map((item, i) => clozeItemNode(item, i + 1)),
        ];
        if (clozeBank && clozeBank.length) clozeParts.push(<WordBank words={clozeBank} />);
        pushWsList("ws-cloze", clozeParts);
      }
      if (s.practice) {
        const practiceItemNode = (item: NonNullable<typeof s.practice>["items"][number], i: number) => (
          <div className="par-ws-practice">
            <span className="par-ws-cloze-no">({item.no})</span>
            <Field
              as="span"
              editable={editable}
              value={item.text}
              onCommit={(v) =>
                s.practice &&
                patch({
                  practice: { ...s.practice, items: s.practice.items.map((entry, j) => (i === j ? { ...entry, text: v } : entry)) },
                })
              }
            />
          </div>
        );
        const practiceBank = toStudentWorksheetWordBank(s.practice.wordBank, s.practice.items);
        const practiceParts: ReactNode[] = [
          <>
            <WorksheetMiniTitle
              {...miniHeadProps(s, patch, editable, "ws-practice", s.practice.title, "No Translation", (v) =>
                s.practice ? patch({ practice: { ...s.practice, title: v } }) : undefined,
              )}
            />
            {s.practice.items.length ? practiceItemNode(s.practice.items[0], 0) : null}
          </>,
          ...s.practice.items.slice(1).map((item, i) => practiceItemNode(item, i + 1)),
        ];
        if (practiceBank && practiceBank.length) practiceParts.push(<WordBank words={practiceBank} />);
        pushWsList("ws-practice", practiceParts);
      }
      if (s.drills?.grammarChoices?.length || showDrillWordOrders) {
        const grammarChoices = s.drills?.grammarChoices ?? [];
        const drillWordOrders = showDrillWordOrders ? s.drills?.wordOrders ?? [] : [];
        const grammarChoiceNode = (item: (typeof grammarChoices)[number], i: number) => (
          <div className="par-ws-grammar-choice">
            <div className="par-ws-drill-line">
              <span className="par-ws-cloze-no">{item.no}.</span>
              {editable ? (
                <Field
                  as="span"
                  editable
                  value={item.text}
                  onCommit={(v) =>
                    patch({
                      drills: {
                        ...s.drills,
                        grammarChoices: s.drills?.grammarChoices?.map((entry, j) => (i === j ? { ...entry, text: v } : entry)),
                      },
                    })
                  }
                />
              ) : (
                <span>{renderGrammarChoiceText(item.text)}</span>
              )}
            </div>
            <div className="par-ws-drill-options">[{item.choices.join(" / ")}]</div>
          </div>
        );
        const drillWordOrderNode = (item: (typeof drillWordOrders)[number], i: number) => (
          <div className="par-ws-wordorder">
            <div className="par-ws-wordorder-ko">
              <span className="par-ws-cloze-no">{item.no}.</span>
              <Field
                as="span"
                editable={editable}
                value={item.korean}
                onCommit={(v) =>
                  patch({
                    drills: {
                      ...s.drills,
                      wordOrders: s.drills?.wordOrders?.map((entry, j) => (i === j ? { ...entry, korean: v } : entry)),
                    },
                  })
                }
              />
            </div>
            <div className="par-ws-wordorder-chunks">[{item.chunks.join(" / ")}]</div>
            <div className="par-ws-write-space" aria-hidden>
              <span className="par-ws-write-line" />
              <span className="par-ws-write-line" />
            </div>
          </div>
        );
        const drillMiniTitle = (
          <WorksheetMiniTitle {...miniHeadProps(s, patch, editable, "ws-drills", "어법 선택 · 단어배열 영작", "Workbook Drills")} />
        );
        const drillParts: ReactNode[] = [];
        if (grammarChoices.length) {
          drillParts.push(
            <>
              {drillMiniTitle}
              <div className="par-ws-drill-set">
                <EditableSectionLabel section={s} onPatch={patch} editable={editable} slot="ws-drill-grammar-label" defaultText="어법 선택" className="par-ws-drill-label" />
                {grammarChoiceNode(grammarChoices[0], 0)}
              </div>
            </>,
          );
          grammarChoices.slice(1).forEach((item, i) => drillParts.push(grammarChoiceNode(item, i + 1)));
        }
        if (drillWordOrders.length) {
          const orderHead = (
            <div className={`par-ws-drill-set${grammarChoices.length ? " par-ws-run-subsep" : ""}`}>
              <EditableSectionLabel section={s} onPatch={patch} editable={editable} slot="ws-drill-order-label" defaultText="주요문장 단어배열 영작" className="par-ws-drill-label" />
              {drillWordOrderNode(drillWordOrders[0], 0)}
            </div>
          );
          drillParts.push(grammarChoices.length ? orderHead : <>{drillMiniTitle}{orderHead}</>);
          drillWordOrders.slice(1).forEach((item, i) => drillParts.push(drillWordOrderNode(item, i + 1)));
        }
        if (drillParts.length) pushWsList("ws-drills", drillParts);
      }
      if (workbookSet) {
        push(
          "note",
          "ws-workbook-topic",
          <div className="par-ws-block">
            <WorksheetMiniTitle
              {...miniHeadProps(s, patch, editable, "ws-workbook-topic", workbookSet.title, "Workbook Training", (v) =>
                patch({ workbookSet: { ...workbookSet, title: v } }),
              )}
            />
            <div className="par-ws-topic-card">
              <Field
                as="span"
                className="par-ws-topic-label par-no-fontrun"
                editable={editable}
                value={workbookSet.topicGist.title}
                onCommit={(v) => patch({ workbookSet: { ...workbookSet, topicGist: { ...workbookSet.topicGist, title: v } } })}
              />
              <Field
                as="div"
                className="par-ws-topic-title"
                editable={editable}
                value={workbookSet.topicGist.topicTitle}
                onCommit={(v) =>
                  patch({
                    workbookSet: { ...workbookSet, topicGist: { ...workbookSet.topicGist, topicTitle: v } },
                  })
                }
              />
              <Field
                as="div"
                className="par-ws-topic-gist"
                editable={editable}
                value={workbookSet.topicGist.gist}
                onCommit={(v) =>
                  patch({
                    workbookSet: { ...workbookSet, topicGist: { ...workbookSet.topicGist, gist: v } },
                  })
                }
              />
            </div>
          </div>,
        );
        push(
          "note",
          "ws-workbook-grammar",
          <div className="par-ws-block">
            <WorksheetMiniTitle
              {...miniHeadProps(s, patch, editable, "ws-workbook-grammar", workbookSet.grammarSelection.title, "Grammar Choice", (v) =>
                patch({ workbookSet: { ...workbookSet, grammarSelection: { ...workbookSet.grammarSelection, title: v } } }),
              )}
            />
            {editable ? (
              <Field
                as="div"
                className="par-ws-workbook-passage"
                editable
                value={workbookSet.grammarSelection.passage}
                onCommit={(v) =>
                  patch({
                    workbookSet: {
                      ...workbookSet,
                      grammarSelection: { ...workbookSet.grammarSelection, passage: v },
                    },
                  })
                }
              />
            ) : (
              <div className="par-ws-workbook-passage">{renderGrammarChoiceText(workbookSet.grammarSelection.passage)}</div>
            )}
          </div>,
        );
        if (workbookSet.vocabularySelection) {
          const vocabSelection = workbookSet.vocabularySelection;
          push(
            "note",
            "ws-workbook-vocab-select",
            <div className="par-ws-block">
              <WorksheetMiniTitle
                {...miniHeadProps(s, patch, editable, "ws-workbook-vocab-select", vocabSelection.title, "Vocabulary Choice", (v) =>
                  patch({ workbookSet: { ...workbookSet, vocabularySelection: { ...vocabSelection, title: v } } }),
                )}
              />
              {editable ? (
                <Field
                  as="div"
                  className="par-ws-workbook-passage"
                  editable
                  value={vocabSelection.passage}
                  onCommit={(v) =>
                    patch({
                      workbookSet: {
                        ...workbookSet,
                        vocabularySelection: { ...vocabSelection, passage: v },
                      },
                    })
                  }
                />
              ) : (
                <div className="par-ws-workbook-passage">{renderGrammarChoiceText(vocabSelection.passage)}</div>
              )}
            </div>,
          );
        }
        push(
          "note",
          "ws-workbook-vocab",
          <div className="par-ws-block">
            <WorksheetMiniTitle
              {...miniHeadProps(s, patch, editable, "ws-workbook-vocab", workbookSet.vocabularyCloze.title, "Vocabulary Cloze", (v) =>
                patch({ workbookSet: { ...workbookSet, vocabularyCloze: { ...workbookSet.vocabularyCloze, title: v } } }),
              )}
            />
            <Field
              as="div"
              className="par-ws-workbook-passage"
              editable={editable}
              value={toStudentVocabularyClozePassage(workbookSet.vocabularyCloze.passage, workbookSet.vocabularyCloze.blanks)}
              onCommit={(v) =>
                patch({
                  workbookSet: {
                    ...workbookSet,
                    vocabularyCloze: { ...workbookSet.vocabularyCloze, passage: v },
                  },
                })
              }
            />
          </div>,
        );
        const workbookOrderNode = (item: (typeof consolidatedWordOrders)[number], i: number) => (
          <div className="par-ws-wordorder">
            <div className="par-ws-wordorder-ko">
              <span className="par-ws-cloze-no">{item.no}.</span>
              <Field
                as="span"
                editable={editable}
                value={item.korean}
                onCommit={(v) =>
                  patch({
                    workbookSet: {
                      ...workbookSet,
                      wordOrders: workbookSet.wordOrders.map((entry, j) => (i === j ? { ...entry, korean: v } : entry)),
                    },
                  })
                }
              />
            </div>
            <div className="par-ws-wordorder-chunks">[{item.chunks.join(" / ")}]</div>
            <div className="par-ws-write-space" aria-hidden>
              <span className="par-ws-write-line" />
              <span className="par-ws-write-line" />
            </div>
          </div>
        );
        pushWsList("ws-workbook-order", [
          <>
            <WorksheetMiniTitle {...miniHeadProps(s, patch, editable, "ws-workbook-order", "주요문장 단어배열 영작", "Word Order")} />
            {consolidatedWordOrders.length ? workbookOrderNode(consolidatedWordOrders[0], 0) : null}
          </>,
          ...consolidatedWordOrders.slice(1).map((item, i) => workbookOrderNode(item, i + 1)),
        ]);
      }
      const inferenceSet = s.inferenceSet;
      if (inferenceSet?.questions.length) {
        push(
          "note",
          "ws-inference-title",
          <div className="par-ws-block">
            <WorksheetMiniTitle
              {...miniHeadProps(s, patch, editable, "ws-inference-title", inferenceSet.title, "Suneung Inference", (v) =>
                patch({ inferenceSet: { ...inferenceSet, title: v } }),
              )}
            />
          </div>,
        );
        inferenceSet.questions.forEach((q, qi) => {
          push(
            "note",
            `ws-iq${qi}`,
            <WorksheetQuestionCard
              q={q}
              editable={editable}
              hiddenAnswers
              onPatch={(questionPatch) => {
                const safePatch = { ...questionPatch };
                delete safePatch.type;
                patch({
                  inferenceSet: {
                    ...inferenceSet,
                    questions: inferenceSet.questions.map((item, j) => (qi === j ? { ...item, ...safePatch } : item)),
                  },
                });
              }}
            />,
          );
        });
      }
      (s.questions ?? []).forEach((q, qi) => {
        push(
          "note",
          `ws-q${qi}`,
          <WorksheetQuestionCard
            q={q}
            editable={editable}
            hiddenAnswers
            onPatch={(questionPatch) =>
              patch({
                questions: (s.questions ?? []).map((item, j) => (qi === j ? { ...item, ...questionPatch } : item)),
              })
            }
          />,
        );
      });
      if (showAnswerKey) {
        let firstAnswer = true;
        for (const sub of worksheetAnswerKeySubsections(s, consolidatedWordOrders, editable, patch)) {
          // 정답·해설은 맨 뒤 '별도 페이지'에서 시작 (학생 시험지와 분리)
          push("note", `ws-answer-${sub.key}`, sub.node, firstAnswer ? { breakBefore: true } : undefined);
          firstAnswer = false;
        }
      }
}
