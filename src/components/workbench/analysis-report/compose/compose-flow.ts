import type { AnalysisReport, BlockMeta } from "@/lib/passage-report/analysis-report/schema";
import { isActivityAnswerId, orderIdOf, visibleFlowItems } from "../report-pages/items";
import { reportFlowItems, type FlowItem } from "../report-sections";
// SectionFlowCache 는 배럴이 아니라 정의 파일에서 직접 가져온다 — `AnalysisReportEditor.tsx:62-65`
// 가 같은 이유(같은 웨이브 신설 계약 API 는 배럴 갱신과 무관하게 컴파일되어야 한다)로 굳혀 둔 관용구.
import { SectionFlowCache } from "../report-sections/flow-cache";
import { assertUniqueIds, nsAttachedFlowItem, nsBlockMetaKeys, nsFlowItem } from "./compose-ids";

/**
 * E21 학습지 조판 — 합성 뷰 빌더 (docs/class-studio-spec.md §3.10.21 E21-1 의 7단계 절차).
 *
 * 「편집 중인 활성 문서 1개 + 읽기전용 부착 문서 N개」를 **1 par-root · 1 페이지네이션**으로
 * 보여 주기 위한 **순수 함수**다. 저장은 끝까지 문서별 PATCH — 이건 합성 **뷰**이지 합성
 * **문서**가 아니다(E21-0. sections 병합은 `schema.ts:1016,1062` max(12) 와
 * `section-slots.ts:81` kind-첫-occurrence 슬롯팅으로 원리적 사망, par-root 세로 스택은
 * `report-styles.ts:1878-1885` 의 `position:absolute` 로 인쇄 겹침).
 *
 * ─── 이 함수의 산출물이 어디로 흘러가는지(이걸 모르면 아래 설계가 과해 보인다) ───────────
 * 반환한 `flowItems`/`pagesReport` 는 `EditorCanvas` → `ReportPages` 로 그대로 내려간다.
 * 그런데 `ReportPages` 는 주입받은 flowItems 를 **자연 순서로 취급해**
 * `pages.tsx:54-56` 에서 `visibleFlowItems(report, natural)` 을 **한 번 더** 돌린다.
 * 그래서 이 함수의 최상위 요구는 「합성 결과가 두 번째 `visibleFlowItems` 를 통과해도
 * **완전히 같은 배열이어야 한다**」 = **멱등성**이다. 이 파일의 두 축이 그 멱등성을 만든다:
 *
 *  (A) `pagesReport.blockOrder` 를 **합성 스트림에서 직접 유도**해 사전 확정한다
 *      → 2차 `applyBlockOrder` 가 `order.filter(존재하는 id)` 만 하고 끝나는 무동작이 된다.
 *  (B) 이미 걸러낸 hidden 아이템은 2차 hidden 검사에서도 그대로 부재 → 무동작.
 *
 * ─── 왜 blockOrder 사전 확정이 **필수**인가 (E21-7 1번) ─────────────────────────────
 * `applyBlockOrder`(`editor-mutations.ts:165-188`)는 저장된 order 에 없는 id 를 맨 뒤로 보내지
 * 않고, `:173-186` 루프에서 **자연 순서상 앞 이웃의 「저장된」 위치 뒤**로 splice 한다.
 * 활성 문서가 blockOrder 를 한 번이라도 가지면 부착 문서의 모든 id 가 "order 에 없는 새 id" 라
 * 이 splice 를 타고 **문서 B 전체가 문서 A 한가운데로 빨려 들어간다**. 에러도 경고도 없고
 * 인쇄물에서만 발견된다. 사전 확정 외의 차단책은 공유 파일 `pages.tsx` 개변뿐이라 채택 불가.
 *
 * ─── 왜 blockMeta 병합이 **필수**인가 (E21-1 6번) ──────────────────────────────────
 * 조판 파이프라인 전체가 `report.blockMeta` **하나**만 읽는다:
 *   - `packFlow`(`report-pages/items.ts:195`) `blockMeta?.[editIdOf(it)] ?? blockMeta?.[it.id]`
 *     → 여기서 `minHeight`(:225-226)·`breakBefore`(:215)·`keepWithPrev`(:219,235) 가 페이지 분할을 결정
 *   - `runs.tsx:88,98,108,122,159,172,185,196` RunBlock/RowShell/LiShell 이 같은 식으로 조회
 *     → `blockStyleOf`(`items.ts:105-115`) 의 fontScale/bold/italic/align/minHeight
 * 병합하지 않으면 부착 문서는 **서식이 전부 초기값**으로 조판되어 단독 열람과 결과가 달라진다.
 * 반대로 접미 없이 병합하면 부착 문서의 `s0-head` 메타가 활성 문서의 `s0-head` 를 덮어쓴다.
 * → `nsBlockMetaKeys`(compose-ids.ts) 로 키 전량 접미 후 병합이 유일한 답.
 *
 * ─── 수용된 한계: `tableColWidths` 는 병합하지 않는다 ────────────────────────────────
 * 열 너비의 group 키는 표 **종류**(grammar/exam/vocab — `items.ts:180-183` `theadOf`,
 * `pages.tsx:68-79` colCtx)라서 **id 축이 아니다**. 접미를 붙일 자리가 원리적으로 없으므로
 * 문서별 분리가 불가능하다 → 부착 문서는 **활성 문서의 열 너비를 상속**한다(스펙 E21-1 명시).
 * 상속이 싫다면 표 렌더러의 group 키 체계를 바꿔야 하는데 그건 학생 뷰어까지 닿는 별건이다.
 *
 * ─── 러닝헤더/푸터 귀속은 **문서별**이어야 한다 (26-08-18 실측 결함 수정) ─────────────
 * 아래 `pagesReport` 는 `...active.report` 상속이라 `meta.titleKo`·`docNo` 까지 활성 문서
 * 것이 된다. 그런데 그 값은 `pages.tsx:197`(RunningHeader title)·`:206`(RunningFooter docNo)
 * 에서 **par-root 의 모든 시트**에 찍힌다 — E21 이전에는 par-root 1개 = 문서 1개라 언제나
 * 옳았지만, 조판은 하나의 report 로 N문서를 덮으므로 부착 문서 페이지가 **활성 문서 제목**을
 * 머리글에 달고 인쇄된다. 실측(2학년 클래스 기본 학습지 3건 조판, 36시트): 고유 러닝헤더
 * 제목 1종 vs 본문 h1 제목 3종 → p6–p11·p13–p35 총 **29/36 시트가 오귀속**.
 * → 수정: 부착 문서 아이템마다 `docHeader`(그 문서의 title/docNo)를 달아 보낸다.
 *   `pages.tsx` 는 **페이지 첫 아이템**의 `docHeader` 를 조회해 있으면 그것을, 없으면
 *   현행 `report.meta.titleKo`/`report.docNo` 를 쓴다(= 미조판 호출부 전부 바이트 동일).
 *   "페이지 첫 아이템 = 그 페이지 전체의 문서" 가 성립하는 근거는 아래 4번의 `breakBefore`
 *   강제 분할이다 — 문서 경계는 반드시 페이지 경계라 한 시트에 두 문서가 섞이지 않는다.
 * 여전히 상속되는 것: `brand`(학원 브랜드 = 문서 불변) · 테마 · 표지 · 열 너비.
 *
 * ─── E22 합본: 문항은 **문서에 저장될 수 없다**(읽기전용 in-memory 합성분) ────────────
 * 조판실(§3.10.22)은 학습지 문서 뒤에 시험지 문항을 이어붙여 **A4 한 묶음으로 1회 인쇄**한다.
 * 그런데 그 문항을 `AnalysisReport` 안에 눌러 담는 길은 스키마가 원리적으로 막고 있다
 * (전부 실측 확인):
 *   - `schema.ts:660` `questions: z.array(worksheetQuestionSchema).max(8)` — 문항 8개 상한.
 *   - `schema.ts:331-341` `worksheetQuestionSchema` — `no` 는 max(12), `choices` 는 min(2)·max(6),
 *     `explanation` 은 **필수 문자열**. 시험지 문항은 이 셋을 일상적으로 위반한다.
 *   - `schema.ts:799-812` `activityKindSchema` 는 **닫힌 enum 12종** — 시험지 유형이 들어갈 칸이 없다.
 *   - `schema.ts:815-826` `activityItemSchema` 에는 **선지 필드가 아예 없다**(prompt/chips/ko/answer뿐).
 * 그래서 문항은 저장 레코드가 아니라 **`FlowItem[]` 로 만들어져 이 함수에 주입**되고
 * (`input.questions`), 저장 경로(문서별 PATCH)에는 한 글자도 닿지 않는다. 같은 이유로
 * 아래에서 **문항의 blockMeta 는 병합하지 않는다**(원본 자체가 존재하지 않는다).
 */

/**
 * 활성 문서의 docKey. 활성 문서는 **정답 페이지 아이템에만** 이 키가 붙는다(아래 5번 참조).
 * 본문 아이템은 절대 접미하지 않으므로 "활성 문서 = 접미 없음"이 여전히 유효한 멘탈 모델이다.
 */
export const ACTIVE_DOC_KEY = "d0";

/**
 * 부착 문서 `sectionIndex` 오프셋 보폭. 문서당 1000.
 *
 * 근거(E21-7 5번): `runs.tsx:31-38` 의 런 병합 조건이 `(wrap, sectionIndex)` **쌍 비교**다
 * (`items[j].wrap === it.wrap && items[j].sectionIndex === it.sectionIndex`). 오프셋이 없으면
 * A 문서 마지막 어법 표(s0)와 B 문서 첫 어법 표(s0)가 wrap·sectionIndex 가 둘 다 같아
 * **한 표로 병합**되어 렌더된다(문서 경계가 표 중간에서 사라진다). `packFlow` 의 런 경계
 * 판정(`items.ts:285-295` `newSection`/`newRun`)도 같은 쌍을 보므로 페이지 예산까지 어긋난다.
 *
 * 1000 인 이유: 문서당 섹션은 `schema.ts:1016,1062` 로 최대 12개고 커스텀/표지는 -1 이라
 * 실제 사용 범위가 [-1, 12] 다. 보폭 1000 이면 문서 6개(E21-6 2번 상한)까지 구간이
 * 절대 겹치지 않고, 숫자만 봐도 `1003` = "부착 1번 문서의 s3" 로 읽혀 디버깅이 쉽다.
 */
export const SECTION_INDEX_STRIDE = 1000;

/** 조판에 부착할 읽기전용 문서 1건. */
export interface ComposeDoc {
  /** `[A-Za-z0-9_]` 만(`isValidDocKey`). 호출부가 사전 검증한다 — 여기선 강제하지 않는다. */
  docKey: string;
  title: string;
  report: AnalysisReport;
}

/**
 * 부착 문서 아이템이 들고 다니는 **러닝헤더/푸터 귀속 정보**(파일 상단 「러닝헤더/푸터 귀속은
 * 문서별이어야 한다」). 문서당 객체 **1개**를 만들어 그 문서의 모든 아이템이 같은 참조를 공유한다
 * — 아이템마다 새 객체를 만들면 `ReportPages` 하위의 memo 비교가 매 렌더 어긋난다.
 */
export interface ComposedDocHeader {
  /** `RunningHeader`(`report-pages/runs.tsx:203`) 의 `title` 로 쓰인다. */
  title: string;
  /** `RunningFooter`(`runs.tsx:218`) 의 `docNo`. 부재면 **그 문서엔 docNo 가 없는 것**이다
   *  — 활성 문서 docNo 로 폴백하면 오귀속이 그대로 남으므로 `docHeader` 존재 자체가 스위치다. */
  docNo?: string;
}

/**
 * 합성 스트림의 아이템. `FlowItem`(`report-sections/types.ts:44-64`)에 `docHeader` 를 얹은
 * **구조적 확장**이라 `FlowItem` 을 받는 기존 함수(`visibleFlowItems`·`packFlow`·`describeItems`)
 * 에 그대로 대입되고, 이 필드를 안 읽는 소비처의 동작은 바이트 동일하다
 * (`compose-ids.ts:60 NsFlowItem` 과 같은 관용구).
 */
export type ComposedFlowItem = FlowItem & { docHeader?: ComposedDocHeader };

/** `EditorCanvas` → `ReportPages` 로 그대로 내려갈 합성 산출물. */
export interface ComposedView {
  /** `ReportPages`(`pages.tsx:39`)의 `flowItems` — **자연 순서 취급**되어 한 번 더 정렬된다. */
  flowItems: FlowItem[];
  /** `ReportPages` 의 `report` — 편집 상태 `report`(useReducer present)는 절대 이걸로 바꾸지 마라. */
  pagesReport: AnalysisReport;
}

/** 원본 키에 저장된 BlockMeta 를 접미 키로 복제(있을 때만). */
function carryMeta(
  src: Record<string, BlockMeta> | undefined,
  dst: Record<string, BlockMeta>,
  fromKey: string,
  toKey: string,
): void {
  const v = src?.[fromKey];
  if (v !== undefined) dst[toKey] = v;
}

/**
 * 활성 1 + 부착 N → 단일 flow 스트림 + 단일 pagesReport.
 *
 * @param input.active   편집 중인 문서. `natural` 은 편집기가 이미 만든 **자연 순서**
 *   FlowItem[](`AnalysisReportEditor.tsx:1364-1366` `naturalFlowItems`)를 그대로 넘긴다 —
 *   여기서 다시 `reportFlowItems` 를 부르면 편집 콜백(med/sectionEdit/ced/…)이 빠진
 *   **읽기전용 JSX** 가 만들어져 활성 문서의 인라인 편집이 통째로 죽는다.
 * @param input.companions 부착 문서. 배열 **순서가 곧 조판 순서**(호스트의 `pickedSheets` 삽입 순서).
 * @param input.caches   `docKey → SectionFlowCache`. **호출부가 소유**해야 한다(문서 간 공유는
 *   오염 — 슬롯키가 `sec:{si}:{key}`(`assemble.tsx:352-354`)라 문서가 달라도 같은 키가 나온다.
 *   `flow-cache.ts:23` 의 "슬롯키 충돌은 miss 로 안전 실패" 보장은 **키 배열이 다를 때** 얘기이고,
 *   여기선 키 배열(`[section, si, no, …]`)까지 우연히 같아질 수 있어 안전망이 되지 않는다).
 *   호스트가 Map 을 ref 로 들고 있으면 활성 문서 타이핑 시 부착 문서 재계산이 0이 된다.
 *   없는 docKey 는 여기서 만들어 Map 에 넣는다(호출부가 잊어도 정상 동작 — 캐시 이득만 없음).
 * @param input.questions **E22 additive**. 시험지 문항을 조판 껍데기로 옮긴 읽기전용
 *   `FlowItem[]`(`compose/question-flow.tsx` 산출). **미전달(또는 빈 배열)이면 이 함수의 산출물은
 *   바이트 동일**이다 — 기존 학습지 조판 무회귀가 판정 기준 ①이다. 배열 순서가 곧 인쇄 순서이고,
 *   문항은 저장 문서가 아니므로 blockMeta 병합 대상이 **아니다**(파일 상단 「E22 합본」).
 */
export function buildComposedView(input: {
  active: { report: AnalysisReport; natural: FlowItem[] };
  companions: ComposeDoc[];
  caches: Map<string, SectionFlowCache>;
  questions?: FlowItem[];
  /**
   * [E27 · §3.10.26 R1] `docKey → 그 문서 아이템 **직후**에 끼워 넣을 문항 FlowItem[]`.
   * 활성 문서의 키는 `ACTIVE_DOC_KEY`("d0") 다.
   *
   * 왜 필요한가: E22 까지는 문항이 언제나 스트림 **맨 끝**이었다(아래 `questions`).
   * 그런데 같은 지문에 학습지를 여러 장 올리면 「지문1 학습지 → 지문2 학습지 → 문제 전부」가
   * 되어, 지문1 문제를 풀려면 지문2 학습지를 넘겨야 한다. E27 은 인쇄 묶음을 **지문 단위**로
   * 자른다: `[지문1 학습지들][지문1 문제들][지문2 학습지들][지문2 문제들]`.
   *
   * 호스트는 「그 지문 그룹의 **마지막** 문서」의 docKey 에 그 지문 문항 전량을 매단다.
   * 학습지가 하나도 없는 지문의 문항과 **정답표**는 여기가 아니라 `questions`(꼬리)로 간다.
   *
   * 미전달(또는 빈 Map)이면 산출물 **바이트 동일**이다.
   */
  questionsAfterDoc?: ReadonlyMap<string, FlowItem[]>;
}): ComposedView {
  const { active, companions, caches, questions, questionsAfterDoc } = input;

  // 방어적 무회귀 — 부착이 없으면 계약상 이 함수는 호출되지 않지만, 호출돼도 **참조까지 그대로**
  // 돌려준다. 새 배열/새 report 를 만들면 그것만으로 ReportPages 의 useMemo 가 전부 무효화되어
  // (`pages.tsx:47-56`) 문서 전체 재측정이 돈다 — "부착 0건인데 조판이 느려진다"의 정확한 원인.
  //
  // **E22: 가드에 문항 축을 반드시 함께 걸어야 한다.** 합본은 「학습지 1(활성) + 부착 0 + 문항 N」
  // 이 정상 조합이라(도시에서 학습지 1건만 체크하고 문항을 얹는 경로) `companions.length === 0`
  // 만 보면 여기서 `active.natural` 을 그대로 반환해 **문항 N개가 통째로 사라진다**.
  // 에러도 경고도 없이 인쇄물에서만 드러나는 계통이다.
  // [E27] 가드에 `questionsAfterDoc` 축을 반드시 함께 걸어야 한다 — 「학습지 1(활성) +
  // 부착 0 + 그 지문 문항 N」이 정상 조합이라(지문 1개만 체크하고 그 지문 문제를 얹는
  // 경로) 이 Map 을 빠뜨리면 문항이 통째로 사라진다. E22 가 `questions` 에서 겪은 것과
  // 같은 계통이고, 증상도 같다 — 에러 0 · 경고 0 · 인쇄물에서만 발견.
  if (
    companions.length === 0 &&
    (questions?.length ?? 0) === 0 &&
    (questionsAfterDoc?.size ?? 0) === 0
  ) {
    return { flowItems: active.natural, pagesReport: active.report };
  }

  // ── 1~2) 활성 문서: 자기 blockOrder/hidden 을 **선적용**한다. ────────────────────────
  // 부착 문서와 섞기 전에 각 문서가 자기 규칙으로 자기만 정리해야, 합성 blockOrder 가
  // 「이미 정렬된 결과의 받아쓰기」가 되어 2차 정렬이 무동작(멱등)이 된다.
  const activeVisible = visibleFlowItems(active.report, active.natural);

  // ── 5) 활성 문서의 **정답 페이지 아이템만** 접미한다. ───────────────────────────────
  // `visibleFlowItems`(`items.ts:59-89`)는 `isActivityAnswerId` 인 아이템을 본문에서 떼어내
  // `:84-88` 에서 **묶음 전체의 맨 끝**에 붙인다. 합성 스트림에서 이 규칙이 살아 있으면
  // 활성(A) 문서의 정답지가 A 뒤가 아니라 **마지막 부착 문서(C) 뒤**로 튕겨 나간다.
  // 접미를 먹이면 `isActivityAnswerId`(`items.ts:12-14`)의 `endsWith("-ans")` /
  // `id === "activity-answers-head"` 가 둘 다 깨져 그냥 본문 아이템이 되고,
  // 사전 확정한 composite blockOrder 가 순서를 지배해 정답지가 A 문서 끝에 앉는다.
  //
  // **본문 아이템은 절대 접미하지 않는다** — 편집 계약(blockMeta 키 · `scrollToBlock`
  // (`AnalysisReportEditor.tsx:745-747`) · descriptors)이 활성 report 의 **원본 id** 를 쓴다.
  // 정답 아이템만 예외로 둘 수 있는 근거는 코드로 확인했다:
  //   - `describeItems`(`items.ts:31-49`)가 `:35` 에서 정답 아이템을 **제외**한다
  //     → 속성 패널·목차·드래그 재정렬 대상이 아니다(= 원본 id 를 요구하는 소비처가 없다).
  //   - `activityAnswerItems`(`assemble.tsx:90-124`)가 매 렌더 재생성하는 **파생 블록**이라
  //     사용자가 직접 정렬/편집할 수 있는 대상이 애초에 아니다.
  const activeItems: FlowItem[] = [];
  const answerMeta: Record<string, BlockMeta> = {};
  for (const it of activeVisible) {
    if (!isActivityAnswerId(it.id)) {
      activeItems.push(it);
      continue;
    }
    const ns = nsFlowItem(it, ACTIVE_DOC_KEY);
    activeItems.push(ns);
    // 접미한 정답 아이템의 서식 메타를 접미 키로 **복제**한다(원본 키는 남겨 둔다 —
    // 활성 report 는 저장 대상이라 그 키를 지우면 다음 PATCH 에서 서식이 사라진다).
    // 복제가 없으면 `packFlow`(`items.ts:195`)·`runs.tsx` 의 `blockMeta?.[editIdOf(it)] ??
    // blockMeta?.[it.id]` 조회가 전부 빗나가 정답 페이지의 minHeight/fontScale 이 소실된다.
    carryMeta(active.report.blockMeta, answerMeta, it.id, ns.id);
    if (it.editId !== undefined && ns.editId !== undefined) {
      carryMeta(active.report.blockMeta, answerMeta, it.editId, ns.editId);
    }
    if (it.orderId !== undefined && ns.orderId !== undefined) {
      carryMeta(active.report.blockMeta, answerMeta, it.orderId, ns.orderId);
    }
  }

  const flowItems: FlowItem[] = [...activeItems];
  // [E27] 활성 문서가 자기 지문 그룹의 **마지막 문서**이면 그 지문 문항이 여기 붙는다.
  //  (그룹에 부착 문서가 더 있으면 호스트가 그 마지막 부착 문서 docKey 에 매단다.)
  const afterActive = questionsAfterDoc?.get(ACTIVE_DOC_KEY);
  if (afterActive?.length) flowItems.push(...afterActive);
  // 활성 메타가 먼저, 접미 메타가 나중 — 접미 키는 원본 키와 충돌하지 않으므로 순서는
  // 안전상 의미만 있다(부착 문서 메타도 전부 접미라 활성 키를 덮을 수 없다).
  const blockMeta: Record<string, BlockMeta> = { ...(active.report.blockMeta ?? {}), ...answerMeta };

  // ── 1~4) 부착 문서 순차 처리 ────────────────────────────────────────────────────
  companions.forEach((doc, docIndex) => {
    let cache = caches.get(doc.docKey);
    if (!cache) {
      cache = new SectionFlowCache();
      caches.set(doc.docKey, cache);
    }
    // 편집 콜백 없이(=읽기전용 JSX) 만든다. 부착 문서는 인라인 편집 대상이 아니고,
    // 콜백을 주면 그 콜백이 **활성 문서의 setReport** 를 향해 남의 문서 편집을 활성 문서에
    // 커밋하게 된다(`assemble.tsx:125-134` 2번째 인자 미전달 = 읽기전용 경로).
    const docNatural = reportFlowItems(doc.report, undefined, cache);
    // 2) 부착 문서도 **자기** blockOrder/hidden 으로 먼저 정리한다.
    const docVisible = visibleFlowItems(doc.report, docNatural);
    const offset = (docIndex + 1) * SECTION_INDEX_STRIDE;
    // 이 문서의 러닝헤더/푸터 귀속 — 문서당 **객체 1개**를 만들어 아이템 전부가 공유한다.
    const docHeader: ComposedDocHeader = { title: doc.title, docNo: doc.report.docNo };
    // 「첫 섹션 헤더 면제」를 **문서마다** 복원하기 위한 1회용 플래그(아래 4-b 참조).
    let firstSecHeaderSeen = false;

    docVisible.forEach((it, i) => {
      // 3) 접미 네임스페이스 + sectionIndex 오프셋.
      //    **`nsAttachedFlowItem`**(= nsFlowItem + `showGrip:false`/`resizable:false`)를 쓴다.
      //    `pages.tsx:204` 가 부착 문서 아이템에도 활성 문서와 **같은 `edit`** 를 내리므로
      //    (아이템 출처 게이트 없음) 봉인하지 않으면 `shells.tsx` 의 그립·블록 휴지통·리사이즈
      //    핸들이 읽기전용 문서에 그대로 뜨고, 누르는 순간 `deleteItem`(`editor-mutations.ts:250`)
      //    → `:262/:285 setBlockMeta(hidden)` 이 **활성 문서 blockMeta 에 외래 접미 id 를
      //    써 넣는다**(`schema.ts:1020` 키 무제한 → 스키마 통과 → 영구 저장).
      //    위 5번의 **활성 문서 정답 아이템**(`:192` nsFlowItem)에는 적용하지 않는다.
      const ns: ComposedFlowItem & { docKey?: string } = nsAttachedFlowItem(it, doc.docKey);
      ns.sectionIndex = it.sectionIndex + offset;
      // 3-b) 러닝헤더/푸터 귀속을 아이템에 실어 보낸다. `pages.tsx` 가 **페이지 첫 아이템**의
      //      이 값을 읽어 머리글 제목·푸터 docNo 를 그린다(파일 상단 「러닝헤더/푸터 귀속」).
      //      활성 문서 아이템에는 일부러 달지 않는다 — 폴백인 `report.meta.titleKo`/`docNo`
      //      가 곧 활성 문서 값이라 이미 옳고, 미부착(조판 아님) 경로와도 완전히 같아진다.
      ns.docHeader = docHeader;
      // 4) 문서 경계 = 새 페이지. `packFlow` 의 `forceBreak`(`items.ts:214-220`)가
      //    `|| !!it.breakBefore` (`:216`) 로 **blockMeta 경유 없이** 아이템 필드를 직접 받는다.
      //    그래서 더미 spacer 블록을 끼워 넣을 필요가 전혀 없다 — spacer 를 넣으면
      //    그게 `describeItems`/blockOrder 에 잡혀 "정체불명 블록"이 속성 패널에 뜬다.
      //    `!autoFit` 예외(`:215`)는 `meta?.breakBefore` 쪽에만 걸리므로 부착 문서 첫
      //    아이템이 필기분석 조각이어도 이 강제 분할은 살아남는다.
      if (i === 0) ns.breakBefore = true;
      // 4-b) **제목만 있는 빈 페이지 방지** — 부착 문서의 첫 섹션 헤더에 keepWithPrev 를 준다.
      //
      // 왜: `packFlow` 의 `sawSecHeader`(`report-pages/items.ts:193`)는 `items.forEach` **밖**에
      // 선언된 **스트림 전역** 플래그다(`:316` 에서 true 로 세운다). 합성은 N개 문서를
      // `packFlow` **1회**(`report-pages/pages.tsx:122`)로 밀어 넣으므로, 활성 문서에서 이미
      // true 가 된 채 부착 문서에 도달한다 → `:219`
      // `(isSecHeader && sawSecHeader && !it.keepWithPrev && !meta?.keepWithPrev)` 가 걸려
      // 방금 위 `i === 0` 이 연 새 페이지(제목 블록)에서 **또 한 번** 분할된다.
      // 결과: 부착 문서 1건당 「제목 KO/EN 2줄 + 95% 백지」 페이지가 1장씩 삽입된다
      // (실측: `.tmp-worksheet-compose/shots/states/s5-compose-three-docs--w2560.png` 6번 썸네일 —
      //  러닝헤더·러닝푸터가 있는 본문 페이지인데 제목 2줄뿐. 같은 스크린샷의 1번 썸네일
      //  = 활성 문서는 제목+01+02+03 이 한 페이지에 정상 병합돼 비대칭이 눈으로 보인다).
      // 단독 열람에서는 `sawSecHeader === false` 라 첫 헤더가 면제되고
      // (표준 PRIME 첫 슬롯 `report-sections/section-slots.ts:113` summary 는
      //  `{ breakBefore: false }` 뿐이라 무방비), 제목과 같은 페이지에 병합된다.
      //
      // 어떻게: 문서당 첫 `secheader` **1개**에만 `keepWithPrev` 를 부여해 `:219` 의
      // `!it.keepWithPrev` 로 면제를 복원한다. 두 번째 헤더부터는 손대지 않으므로
      // 「섹션마다 새 페이지」 정책은 그대로다(= 단독 열람과 동일한 조판).
      // 예외: `it.breakBefore` 가 이미 참인 헤더(`section-slots.ts:117-146` 의 slot.breakBefore,
      // `assemble.tsx:337` englishOnlyPage 첫-가시-헤더 분할)는 **건드리지 않는다** —
      // 그 문서가 단독으로도 거기서 페이지를 여는 것이 정본 동작이다. 그래도 플래그는
      // 소비해, 단독 열람에서 `sawSecHeader` 가 첫 헤더 뒤 true 가 되는 것과 보조를 맞춘다.
      // 고아 방지(`items.ts:235`)는 `meta?.keepWithPrev` 만 보므로 여기 부여로 무력화되지 않는다
      // (= 헤더가 제목 페이지 하단에 홀로 남는 반대 사고는 그대로 차단된다).
      if (!firstSecHeaderSeen && it.wrap === "secheader") {
        firstSecHeaderSeen = true;
        if (!it.breakBefore) ns.keepWithPrev = true;
      }
      flowItems.push(ns);
    });

    // [E27] 이 문서가 자기 지문 그룹의 마지막 문서면 그 지문 문항 전량이 **여기** 붙는다.
    //  삽입 위치가 이 루프 **안**이라는 것이 계약의 전부다 — 아래 blockOrder 사전 확정
    //  루프보다 앞이라 문항 orderId 가 등장 순서대로 order 에 받아써지고, 그 덕에
    //  `ReportPages` 2차 `applyBlockOrder` 가 `order.filter(존재)` 만 하는 무동작이 된다.
    //  (밖에서 append 하면 splice 폴백이 문항 묶음을 학습지 한가운데로 빨아들인다.)
    const afterDoc = questionsAfterDoc?.get(doc.docKey);
    if (afterDoc?.length) flowItems.push(...afterDoc);

    // 6) blockMeta 병합 — 키 전량 접미(파일 상단 「왜 blockMeta 병합이 필수인가」).
    Object.assign(blockMeta, nsBlockMetaKeys(doc.report.blockMeta, doc.docKey));
  });

  // ── E22) 문항 묶음을 스트림 **맨 끝**에 잇는다 (합류 지점은 여기가 유일한 정답) ───────
  // 위치 = companions 루프 **직후** · 아래 blockOrder 사전 확정 **직전**. 근거는 파일 상단
  // 「왜 blockOrder 사전 확정이 필수인가」가 이미 문서화한 그대로다:
  //   - 여기서 push 하면 바로 아래 `:blockOrder` 루프가 문항 orderId 까지 **등장 순서대로
  //     받아써** 사전 확정에 포함시킨다 → `ReportPages` 의 2차 `visibleFlowItems`
  //     (`pages.tsx:77`) → `applyBlockOrder`(`editor-mutations.ts:165-188`)가
  //     `order.filter(존재)` 만 하는 **순수 무동작**이 되어 멱등성이 유지된다.
  //   - 반대로 이 함수 **밖에서** append 하면 문항 id 는 저장 order 에 없는 새 id 라
  //     `editor-mutations.ts:173-186` 의 splice 폴백이 「자연 순서상 앞 이웃의 저장된 위치 뒤」로
  //     밀어 넣는다 → **문항 묶음이 활성 학습지 한가운데로 빨려 들어간다**. 에러도 경고도 없고
  //     인쇄물에서만 발견된다(부착 문서에서 실제로 겪은 것과 동일한 계통).
  //
  // **blockMeta 는 병합하지 않는다** — 문항은 저장 문서가 아니라 blockMeta **원본이 존재하지
  // 않는다**(파일 상단 「E22 합본」의 schema 근거 4건). `packFlow`(`report-pages/items.ts:195`)의
  // `blockMeta?.[editIdOf(it)] ?? blockMeta?.[it.id]` 가 undefined 로 떨어지는 것이 **정상**이고,
  // 활성 report 에 `qb-` 키가 한 개도 생기지 않는 것이 편집 관문(`rejectComposedId`)의 성립 조건이다.
  // 페이지 분할에 필요한 `breakBefore` 는 아이템 필드로 직접 온다(`items.ts:216` `|| !!it.breakBefore`).
  if (questions?.length) flowItems.push(...questions);

  // ── 6) blockOrder 사전 확정 ─────────────────────────────────────────────────────
  // 스펙의 형식은 `[...applyBlockOrder(활성 자연 orderIds, 활성 blockOrder), ...부착 순차]` 인데,
  // 여기서는 **완성된 합성 스트림의 orderId 를 등장 순서대로 받아쓴다**. 결과는 같고(활성 구간은
  // 이미 `visibleFlowItems` 가 그 `applyBlockOrder` 를 적용한 산출물이다) 두 가지가 더 안전하다:
  //   ① 위 5번에서 접미한 **활성 정답 아이템 id 가 반드시 포함**된다. 문자 그대로의 형식은
  //      이 id 들이 빠져 2차 `applyBlockOrder` 의 splice 폴백(`editor-mutations.ts:173-186`)에
  //      운을 맡기게 된다.
  //   ② hidden 으로 걸러진 id 가 섞이지 않아, order 와 실제 스트림이 **정확히 일치**한다
  //      → 2차 정렬이 `order.filter(존재)` 만 하는 순수 무동작이 되어 멱등성이 증명된다.
  // 키는 `orderIdOf`(`items.ts:16-18` = `orderId ?? editId ?? id`) — `visibleFlowItems` 의
  // 그룹핑 키(`:66`)와 **같은 함수**여야 한다. 다른 키를 쓰면 조각난 블록(ws-list/activity)의
  // 그룹이 통째로 순서에서 이탈한다.
  const blockOrder: string[] = [];
  const seenOrderIds = new Set<string>();
  for (const it of flowItems) {
    const oid = orderIdOf(it);
    if (seenOrderIds.has(oid)) continue;
    seenOrderIds.add(oid);
    blockOrder.push(oid);
  }

  // `...active.report` 스프레드로 themeId/cover/meta/tableColWidths 등은 **활성 문서 것을
  // 그대로 상속**한다(= 조판 표면 전체가 활성 문서의 테마·표지·열 너비로 통일된다).
  // tableColWidths 를 병합하지 않는 근거는 파일 상단 「수용된 한계」.
  const pagesReport: AnalysisReport = { ...active.report, blockMeta, blockOrder };

  // 7) 개발 모드 유일성 검증(throw 없음). 중복은 `pages.tsx:99-106` heightById(**먼저 만난 것
  //    우선**)와 `:58` itemsById(**나중 것이 이김**)의 규칙이 정반대라 에러 없이
  //    "페이지 넘침"으로만 드러난다 — 콘솔에서 먼저 잡는다.
  assertUniqueIds(flowItems);

  return { flowItems, pagesReport };
}
