"use client";

// ============================================================================
// 클래스 스튜디오 「학습지 조판」 합본 — **문항 본문 배치 로더**(E22 / docs/class-studio-spec.md §3.10.22)
//
// `sheet-compose-surface.tsx` 의 문서 로더(`:221-302`)를 **문항 축에 그대로 복제**한 것이다.
// 학습지 조판이 "체크 → 즉시 조판"을 성립시키려고 세운 5계약을 한 글자도 바꾸지 않고
// 가져온다(계약이 갈리면 같은 표면 안에서 두 축의 체감 반응이 달라진다):
//   ① **증분만 요청** — 캐시에 있거나 in-flight 인 id 는 다시 부르지 않는다.
//   ② **체크 해제로 캐시를 지우지 않는다** — 재체크가 네트워크 0으로 즉시 복귀해야
//      "실시간"이다(`sheet-compose-surface.tsx:29-36` 요구 ①과 동일 문장).
//   ③ **취소 플래그를 두지 않는다**(아래 fetch effect 주석 — 정지 상태 함정).
//   ④ **응답에 없던 id 는 사유를 적어 둔다** — 안 적으면 무한 재요청이 된다
//      (`sheet-compose-surface.tsx:275-282` 가 같은 이유로 같은 방어를 한다).
//   ⑤ **참조 안정성이 성능의 전부**(`sheet-compose-surface.tsx:326-333`).
//
// ─── 이 훅이 일부러 **하지 않는** 것 ────────────────────────────────────────────────
//  · **서버 액션을 새로 만들지 않는다.** `getExamPaperBuilderQuestionsByIds`
//    (`src/actions/exam-paper-builder.ts:634-648`)를 그대로 쓴다 — 이미
//    `requireStaffAuth()`(`:638`) + `staff.academyId !== academyId` 거부(`:639`) +
//    `deletedAt: null` 휴지통 가드(`:644`)가 붙어 있다. 조판 표면이 신규 액션을 뚫으면
//    그 3중 가드를 처음부터 다시 증명해야 한다.
//  · **뷰모델을 직접 만들지 않는다.** 정규화·표기 확정은 전부 U2 순수층
//    (`compose/question-view.ts` `buildComposedQuestionViews`)이 소유한다. 여기는
//    "id → BuilderQuestion 캐시"까지만 책임진다.
//  · **FlowItem 을 만들지 않는다.** 그건 U3(`compose/question-flow.tsx`) 몫이고,
//    호출부(U9)가 이 훅의 `views` 를 그쪽으로 넘긴다.
//
// ─── 순서 계약(E22-2 함정 1) ────────────────────────────────────────────────────────
// `getExamPaperBuilderQuestionsByIds` 의 `orderBy: [{starred:"desc"},{createdAt:"desc"}]`
// (`exam-paper-builder.ts:646`)는 **입력 id 순서를 보존하지 않는다**. 그래서 이 훅은
// 응답을 Map(캐시)에 흩뿌려 두기만 하고, 반환 `views` 는 언제나
// `buildComposedQuestionViews(ids, cache)` = **ids(=체크) 순서**다. 서버 반환 순서를
// 그대로 쓰면 체크 순번 배지와 인쇄 순서가 어긋난다.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getExamPaperBuilderQuestionsByIds } from "@/actions/exam-paper-builder";
import type { BuilderQuestion } from "@/components/exams/paper-builder/types";
import {
  buildComposedQuestionViews,
  type ComposedQuestionView,
} from "@/components/workbench/analysis-report/compose/question-view";

/**
 * 한 왕복에 실어 보낼 문항 수. 「전체 선택」에서 수백 id 가 한 번에 몰려도 왕복 하나가
 * 폭주하지 않게 잘라 **순차** 요청한다(청크마다 캐시를 갱신하므로 화면이 점진적으로 찬다).
 * 학습지 축의 배치 상한(SHEET_COMPOSE_DOC_BATCH = 12)보다 큰 이유는 페이로드 성질이
 * 다르기 때문이다 — 학습지는 문서당 pages JSON(중앙값 49KB·최대 458KB)이고 문항은
 * 발문+선지+지문 한 벌이라 한 자릿수 KB 급이다.
 */
const QUESTION_FETCH_CHUNK = 40;

/**
 * ids 내용 해시용 구분자. cuid/uuid 는 `[A-Za-z0-9_-]` 만 쓰므로 제어문자와 절대 충돌하지
 * 않는다(문항 id 는 전부 prisma cuid). 눈에 보이는 구분자(`,` 등)를 쓰면 언젠가 id 규약이
 * 바뀔 때 조용히 충돌한다.
 */
const IDS_KEY_SEP = "\u0001";

/** 참조 안정용 모듈 상수 — 매 렌더 새 배열을 만들면 하위 useMemo 가 전부 무효화된다. */
const EMPTY_IDS: string[] = [];
const EMPTY_VIEWS: ComposedQuestionView[] = [];

/**
 * 본문 캐시 + 결번 사유를 **한 state 로** 묶는다(DocStore 와 같은 설계 —
 * `sheet-compose-surface.tsx:154-165`). 둘을 따로 두면 "결번만 갱신했는데 byId 참조가
 * 바뀌어" 조판 파이프라인이 통째로 재계산되는 사고가 나기 쉽다. 아래 setStore 는
 * **실제로 바뀐 축만** 새 컨테이너로 갈아 끼우고 나머지는 이전 참조를 그대로 재사용한다.
 */
interface QuestionStore {
  /** questionId → 원본 문항. **체크 해제로 절대 지우지 않는다**(계약 ②). */
  byId: ReadonlyMap<string, BuilderQuestion>;
  /**
   * 요청했는데 응답에 없던 id(삭제됨·권한 밖·존재하지 않음). 여기 적어 두지 않으면
   * 체크가 바뀔 때마다 같은 id 를 영원히 다시 요청한다. `retry()` 가 이 집합만 비우므로
   * 사용자는 언제든 회복할 수 있다(본문 캐시는 그대로 = 재조회 0).
   */
  missing: ReadonlySet<string>;
}
const EMPTY_STORE: QuestionStore = { byId: new Map(), missing: new Set() };

export interface ComposeQuestionsState {
  /** **ids 순서**의 조판 뷰모델. 아직 안 온 id 는 조용히 빠지고 `loading` 이 그 사실을 말한다. */
  views: ComposedQuestionView[];
  /** 진행 중인 배치가 하나라도 있는가. */
  loading: boolean;
  /**
   * 사용자에게 보여 줄 실패 문자열. null 이면 정상.
   *
   * 【A22-M2 실측 수정】 이 값은 **state 가 아니라 파생값**이다. 예전에는 실패 시점에
   * setError 한 문자열이 그대로 눌러앉아, ⓐ 실패한 id 가 다음 배치에서 자동 복구되고
   * ⓑ 문항을 전부 해제해 조판 문항이 0개가 된 뒤에도 붉은 배너가 계속 떠 있었다
   * (`.tmp-worksheet-compose/_a22-m2.log` — RECOVERED / ALL UNCHECKED 두 단계 모두
   * "Failed to fetch" 잔존). 지금은
   *   · 결번 고지 = **현재 체크된 ids ∩ store.missing** 에서 매번 다시 계산하고,
   *   · 통신 실패 고지 = 성공 배치가 한 번이라도 끝나면 스스로 청산된다.
   * 그래서 화면 상태와 배너 문구가 항상 같은 사실을 가리킨다.
   */
  error: string | null;
  /** 결번 기록만 비우고 재시도. 이미 받은 문항은 다시 받지 않는다. */
  retry: () => void;
}

export function useComposeQuestions({
  academyId,
  ids,
}: {
  /** 소유 검증 입력. 빈 문자열이면 조회 자체를 하지 않는다(학원 컨텍스트 미확정). */
  academyId: string;
  /**
   * 체크 순서(= 조판 순서)의 문항 id. 호출부가 매 렌더 새 배열을 만들어도 **내용이 같으면
   * 아래 idsKey 가 같아** 하류 계산이 전부 건너뛴다(계약 ⑤). `string[]` 도 그대로 받는다.
   */
  ids: readonly string[];
}): ComposeQuestionsState {
  const [store, setStore] = useState<QuestionStore>(EMPTY_STORE);
  const [pending, setPending] = useState(0);
  /**
   * **통신 실패만** 담는다(결번은 store.missing 이 이미 사실을 들고 있으므로 문자열로
   * 복제하지 않는다 — 복제하면 둘이 어긋난다). 성공 배치 하나로 청산된다.
   */
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  // ── ids 참조 안정화 ─────────────────────────────────────────────────────────
  //
  // 【R4 실측】 참조 churn 하나가 「내용이 안 바뀐 토글」에도 전량 재합성 + 전량 재측정
  // 489ms 를 태운다. 호출부(U9)의 `[...pickedQuestions.keys()]` 는 Map 참조가 바뀔 때마다
  // 새 배열이 되므로, 여기서 **내용 기준으로 한 번 접지 않으면** 그 비용이 그대로 흐른다.
  //
  // 구현이 "직전 값을 ref 에 두고 비교"가 아니라 **문자열 키 → useMemo** 인 이유:
  // 렌더 중 ref 쓰기는 React Compiler 순수성 위반이라 이 리포가 명시적으로 금지한 관용이다
  // (`sheet-compose-surface.tsx:437-440` 주석 — 「렌더 중 ref 쓰기는 하지 않는다」).
  // 순수 파생 키로 memo 하면 같은 내용 → 같은 키 → **같은 배열 참조**가 부수효과 없이
  // 보장되고, deps 가 원시값 하나뿐이라 exhaustive-deps 와도 다투지 않는다.
  const idsKey = ids.length === 0 ? "" : ids.join(IDS_KEY_SEP);
  const stableIds = useMemo(
    () => (idsKey === "" ? EMPTY_IDS : idsKey.split(IDS_KEY_SEP)),
    [idsKey],
  );

  // ── 지연 조회 + 캐시 ────────────────────────────────────────────────────────
  const storeRef = useRef(store);
  useEffect(() => {
    // 조회 effect 보다 **먼저 선언**해야 같은 커밋에서 ref 가 최신으로 갱신된 뒤 조회가 돈다
    // (`sheet-compose-surface.tsx:225-228` 과 같은 순서 규약).
    storeRef.current = store;
  }, [store]);
  const inFlightRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!academyId) return;
    // 증분만 — 캐시에 있거나(성공) 결번으로 확정됐거나 이미 날아간 id 는 제외.
    // 중복 id 는 첫 등장만 남긴다(하류 buildComposedQuestionViews 의 dedupe 와 동형).
    const wanted: string[] = [];
    const seen = new Set<string>();
    for (const id of stableIds) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      if (storeRef.current.byId.has(id)) continue;
      if (storeRef.current.missing.has(id)) continue;
      if (inFlightRef.current.has(id)) continue;
      wanted.push(id);
    }
    if (wanted.length === 0) return;
    for (const id of wanted) inFlightRef.current.add(id);
    setPending((n) => n + 1);

    // 의도적으로 **취소 플래그를 두지 않는다**. deps(stableIds)가 바뀌면 cleanup 이 도는데,
    // 거기서 응답을 버리면 그 사이 in-flight 로 표시된 id 들이 영영 다시 요청되지 않아
    // "체크했는데 안 뜨는" 정지 상태가 된다. 학습지 로더가 같은 이유로 같은 결정을 했다
    // (`sheet-compose-surface.tsx:249-251`). 언마운트만 mountedRef 로 막는다(setState 안전).
    void (async () => {
      try {
        for (let i = 0; i < wanted.length; i += QUESTION_FETCH_CHUNK) {
          const chunk = wanted.slice(i, i + QUESTION_FETCH_CHUNK);
          // 반환 타입은 prisma 결과 그대로라 구조적으로 BuilderQuestion 과 같지만 명목상
          // 다르다 — 빌더도 같은 지점에서 같은 캐스팅을 쓴다
          // (`exam-paper-builder-client.tsx:1009-1012`).
          const fetched = (await getExamPaperBuilderQuestionsByIds(
            academyId,
            chunk,
          )) as unknown as BuilderQuestion[];
          if (!mountedRef.current) return;

          const got = new Set(fetched.map((q) => q.id));
          const absent = chunk.filter((id) => !got.has(id));

          setStore((prev) => {
            let nextById = prev.byId;
            if (fetched.length > 0) {
              const next = new Map(prev.byId);
              for (const q of fetched) next.set(q.id, q);
              nextById = next;
            }
            let nextMissing = prev.missing;
            if (absent.length > 0) {
              const next = new Set(prev.missing);
              for (const id of absent) next.add(id);
              nextMissing = next;
            }
            // 【참조 안정 핵심】 바뀐 축이 없으면 **이전 state 를 그대로** 돌려준다.
            // 여기서 무조건 새 객체를 만들면 views useMemo(deps: store.byId)가 헛돌아
            // 조판 FlowItem 전량이 새 객체가 되고 A4 재측정이 따라온다.
            if (nextById === prev.byId && nextMissing === prev.missing) return prev;
            return { byId: nextById, missing: nextMissing };
          });
        }
        // 결번은 **조용히 빠뜨리지 않고 고지**한다(E21-6 정책 2 — 조용히 빠지는 것이 곧
        // 신뢰 사고). 다만 고지 문자열을 여기서 만들지 않는다 — 결번 사실은 이미
        // `store.missing` 에 적혔고, 문구는 아래 `absentError` 가 **현재 체크된 ids 기준**
        // 으로 매번 다시 만든다. 그래야 결번 문항의 체크를 풀면 배너도 같이 사라진다.
        //
        // 【A22-M2 실측】 이 배치가 예외 없이 끝났다는 것은 통신이 회복됐다는 뜻이므로
        // 여기서 통신 실패 고지를 청산한다. 이 한 줄이 없어서, 한 번 실패한 뒤 두 번째
        // 문항을 체크해 실패 id 가 **자동 재요청되어 정상 복구**된 뒤에도(증분 로더 계약은
        // 제대로 돌았다) 배너만 영구히 남았다(`.tmp-worksheet-compose/_a22-m2.log`).
        // 같은 값이면 이전 참조를 그대로 돌려줘 불필요한 리렌더를 만들지 않는다.
        if (mountedRef.current) setFetchError((prev) => (prev === null ? prev : null));
      } catch (err) {
        if (!mountedRef.current) return;
        // 원문 예외(`"Failed to fetch"` 같은 브라우저 영문 문자열)는 전면 한국어 표면에
        // 그대로 실으면 디렉터에게 아무 행동 지침이 되지 않는다 — 진단용으로만 남긴다.
        console.warn("[compose] 문항 조회 실패", err);
        setFetchError("문항을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      } finally {
        // in-flight 해제는 **언마운트 여부와 무관**하게 돈다 — 마운트 판정으로 감싸면
        // 재마운트 시 그 id 들이 영구히 요청 불가 상태로 남는다.
        for (const id of wanted) inFlightRef.current.delete(id);
        if (mountedRef.current) setPending((n) => n - 1);
      }
    })();
  }, [academyId, stableIds, reload]);

  const retry = useCallback(() => {
    setFetchError(null);
    // 본문 캐시는 유지하고 **결번 기록만** 비운다 — 이미 받은 문항을 다시 받을 이유가 없다.
    // `byId` 참조를 그대로 넘기므로 이 호출만으로는 views 참조가 바뀌지 않는다.
    setStore((prev) =>
      prev.missing.size === 0 ? prev : { byId: prev.byId, missing: new Set() },
    );
    setReload((n) => n + 1);
  }, []);

  // ── 뷰모델(ids 순서) ────────────────────────────────────────────────────────
  const views = useMemo(
    () =>
      stableIds.length === 0
        ? EMPTY_VIEWS
        : buildComposedQuestionViews(stableIds, store.byId),
    [stableIds, store.byId],
  );

  // ── 결번 고지(파생) ─────────────────────────────────────────────────────────
  //
  // **지금 체크된 id 중** 결번으로 확정된 것만 센다. state 문자열이 아니라 파생값인 이유는
  // 실측 결함 때문이다 — 예전 구현은 실패 시점 문자열을 눌러앉혀, 문항을 전부 해제해
  // 조판 문항이 0개가 된 뒤에도 붉은 배너가 남았다. 파생으로 바꾸면 체크 해제·재시도·
  // 자동 복구 어느 경로로 사실이 바뀌어도 문구가 저절로 따라간다.
  const absentError = useMemo(() => {
    if (store.missing.size === 0 || stableIds.length === 0) return null;
    let n = 0;
    const seen = new Set<string>();
    for (const id of stableIds) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      if (store.missing.has(id)) n += 1;
    }
    return n === 0
      ? null
      : `문항 ${n}개를 불러오지 못했습니다. 삭제되었거나 접근 권한이 없을 수 있어요.`;
  }, [stableIds, store.missing]);

  // 통신 실패가 우선 — 「다시 시도」로 즉시 벗어날 수 있는, 더 행동 가능한 사유다.
  const error = fetchError ?? absentError;

  return useMemo(
    () => ({ views, loading: pending > 0, error, retry }),
    [views, pending, error, retry],
  );
}
