import type { ReactNode } from "react";
import type { AnalysisSection } from "@/lib/passage-report/analysis-report/schema";
import { getConsolidatedWordOrders, toStudentVocabularyClozePassage, toStudentWorksheetWordBank, worksheetAnswersAreHidden, worksheetClozeTranslationsAreHidden } from "@/lib/passage-report/analysis-report/worksheet-surface";
import { Field, renderGrammarChoiceText } from "./editable-field";
import type { LearningWorksheetSection, SectionFlowCtx } from "./types";
import { EditableSectionLabel, miniHeadProps, WordBank, WorksheetMiniTitle, WorksheetQuestionCard, worksheetAnswerKeySubsections } from "./worksheet";

export function worksheetSectionFlow(section: Extract<AnalysisSection, { kind: "learning-worksheet" }>, ctx: SectionFlowCtx): void {
  const { si, editable, commit, push } = ctx;
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
          // ══ [E34-R4] 미니헤드 고아 방지 — 이 파일에서 **유일한 규약 위반**이었다 ══
          // 이 파일의 다른 미니헤드 12종(cloze·practice·drills·워크북 4종·word-order·
          // 정답키·활동·문항 정답표·국어 전량)은 전부 「미니헤드를 첫 콘텐츠와 **같은
          // FlowItem** 에 담는다」는 규약을 지킨다. 추론 미니헤드만 자기 혼자 든 독립
          // 아이템이라, packFlow 가 잔여 공간에 미니헤드(11.5mm)만 밀어 넣고 Q1(70mm)을
          // 다음 장으로 보냈다 — 「수능추론 문제」 제목만 있는 페이지(사용자 실측 10p/11p).
          //
          // 기존 고아 방지 2종이 **둘 다 이 아이템을 못 잡는다**:
          //   · orphanBreak 는 `isSecHeader` 게이트에 갇혀 wrap="note" 에 미도달
          //     (그 함수 주석이 「ws-list 조각에는 한 번도 실행되지 않는다」로 이미 자인).
          //   · atomicBreak 는 `it.atomic` 옵트인인데 학습지 축은 이 필드를 쓴 적이 없다.
          // → 세 번째 장치를 만들지 않고 **기존 atomicBreak 에 옵트인**한다.
          //
          // ⚠ 융합(다른 12종처럼 헤드+Q1 을 한 노드로)을 택하지 않은 이유: 블록 id
          //   `s{si}-ws-inference-title` 이 소멸해 그 id 로 저장된 blockMeta(hidden·
          //   fontScale·align·minHeight)가 죽은 키가 된다. 특히 hidden 은 **숨겨 둔 제목이
          //   되살아나는** 가시적 회귀이고, deleteItem 이 note 블록을 hidden 으로 처리하는
          //   경로가 실재한다. 플래그 방식은 DOM·인쇄물이 바이트 동일이다.
          { atomic: true, keepWithNextGroup: true },
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
            // [E34-R4] **전 문항에 부여한다 — 첫 문항만 주면 안 된다.**
            // `visibleFlowItems` 가 hidden 메타로 Q1 을 걸러내는 순간 미니헤드의
            // keepWithNextGroup 1홉이 Q2 를 향하는데, Q2 가 atomic 이 아니면
            // items.ts 의 `!nx.atomic → break` 에 걸려 동봉이 조용히 사라진다.
            // question-flow.tsx 가 같은 이유로 「원자성은 그룹 전 조각에 실어야 한다」를
            // 관용구로 못박아 두었다 — 그 규율을 그대로 따른다.
            { atomic: true },
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
