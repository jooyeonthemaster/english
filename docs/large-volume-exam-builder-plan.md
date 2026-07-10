# 대량 시험지 생성(1000+ 문항) — 성능/스케일 구현 계획

> 상태: **검토 대기 (구현 전)** · 작성 2026-06-29
> 목적: 시험지 생성(빌더) 왼쪽 문제 목록에서 1000개 이상을 선택해 **한 번에 미리보기에 올리고 실제 대량 시험지를 출력**하면서도 렌더가 무거워지지 않게 만든다.
> 결정된 사용 목적: **진짜 대량 시험지 출력** (큰 묶음을 미리보기에 올려두고 추려내는 용도가 아님).

---

## 1. 배경 / 현재 동작 (조사로 확인된 사실)

| 영역 | 현재 구현 | 위치 |
|------|-----------|------|
| 서버 로드 천장 | 문항을 한 번에 `take: 1000` 으로 일괄 로드 | [src/actions/exam-paper-builder.ts:170](../src/actions/exam-paper-builder.ts#L170) |
| 왼쪽 목록 렌더 | `filteredQuestions.map()` 전체 eager 마운트 (가상화/페이지네이션 없음) | [src/components/exams/paper-builder/components/question-library-panel.tsx:564](../src/components/exams/paper-builder/components/question-library-panel.tsx#L564) |
| 전체 선택 | `toggleSelectAllFiltered` — **이미 로드된 카드만** 선택 가능 | [question-library-panel.tsx:253](../src/components/exams/paper-builder/components/question-library-panel.tsx#L253) |
| 페이지네이션 계산 | `paginateGroups` = **순수 높이 추정(estimation)**, DOM 측정 불필요 | [src/components/exams/paper-builder/pagination.ts:82](../src/components/exams/paper-builder/pagination.ts#L82) |
| 미리보기 렌더 | `paperPages.map()` 으로 **모든 A4 페이지 eager 마운트** | [src/components/exams/exam-paper-builder-client-parts/preview-pages.tsx:134](../src/components/exams/exam-paper-builder-client-parts/preview-pages.tsx#L134) |
| 선택 → 삽입 | `addQuestionIdsToPaper` → `questionById` Map 으로 문항 조회 후 `paperItems` 갱신 | [src/components/exams/exam-paper-builder-client.tsx:563](../src/components/exams/exam-paper-builder-client.tsx#L563) |

### 핵심 인사이트
`paginateGroups` 가 **DOM 렌더 없이 높이를 추정**해 페이지 break 를 계산한다([pagination.ts](../src/components/exams/paper-builder/pagination.ts) 의 `estimate*` 계열). 따라서 페이지 break 계산은 가볍게 유지하면서 **렌더만 가상화**할 수 있다 — 미리보기 가상화의 전제 조건이 이미 충족돼 있음.

### 무한스크롤이 아님 (참고)
왼쪽 목록은 무한스크롤도 가상화도 아니고, 서버가 끊어온 최대 1000개를 단일 `overflow-y-auto` 컨테이너([#exam-question-bank-scroll](../src/components/exams/paper-builder/components/question-library-panel.tsx#L461))에 **전부 마운트**한 뒤 일반 스크롤하는 구조다.

---

## 2. 병목 3곳 + 출력 끝단

대량 선택→미리보기→출력은 단일 병목이 아니라 4개 레이어가 순차로 막힌다.

1. **왼쪽 목록 렌더** — 1000개 카드 eager 마운트
2. **전체 선택 천장** — 로드된 1000개를 넘어 선택 불가 (구조적)
3. **미리보기 렌더** — 수백 페이지 eager 마운트 (가장 큰 벽)
4. **Export(docx/hwpx) 서버단** — "진짜 출력"의 성패가 갈리는 끝단

---

## 3. Phase별 구현 계획

### Phase 1 — 왼쪽 목록 가상화 *(쉬움 · 효과 즉시)*
**목표:** 카드를 수백~천 개 로드해도 보이는 것만 마운트.

- **파일:** [question-library-panel.tsx](../src/components/exams/paper-builder/components/question-library-panel.tsx)
- `@tanstack/react-virtual` 의 `useVirtualizer` 를 스크롤 컨테이너에 연결.
- 그리드(2/3열)는 **row 단위 가상화**: `gridColumns` 로 row당 카드 수 계산 → row 가상 아이템 안에서 카드 N개 렌더.
- 1차 범위: **문제별 보기만** 가상화. 지문별 보기([PassageGroupedView](../src/components/workbench/question-bank-passage-view.tsx))는 그룹 접힘 구조라 후순위.
- **리스크:** `DragSelect` 마키 선택의 교차 판정이 "카드 DOM 존재"에 의존하면 언마운트된 카드를 못 잡음. 선택 자체는 id 기반이라 데이터는 안전하지만 드래그 박스 로직 점검 필요.
- **예상 분량:** 반나절.

### Phase 2 — 미리보기 페이지 가상화 *(핵심 · 중간)*
**목표:** 수백 페이지를 계산은 다 하되 화면 근처만 렌더.

- **파일:** [preview-pages.tsx](../src/components/exams/exam-paper-builder-client-parts/preview-pages.tsx), [exam-paper-builder-client.tsx](../src/components/exams/exam-paper-builder-client.tsx)
- `paginateGroups` 는 그대로 둠(순수 JS, 가벼움). `paperPages.map` 을 windowing 으로 교체.
  - A4 페이지 높이는 `paperSize` 에서 계산 가능 → **고정 높이 가상화**라 단순.
  - 뷰포트 밖 페이지는 동일 높이 placeholder `div`, 안쪽만 `A4PaperPage` 마운트. [exam-paper-thumbnail.tsx:48](../src/components/exams/exam-paper-thumbnail.tsx#L48) 의 IntersectionObserver 패턴 재사용.
- 대량 삽입 시 입력 멈춤 방지: `paginationResult` useMemo([client:957](../src/components/exams/exam-paper-builder-client.tsx#L957)) 적용을 `useDeferredValue` / `startTransition` 으로 감쌈.
- **리스크:** 활성 문항 스크롤([client:536 근처](../src/components/exams/exam-paper-builder-client.tsx#L536))·줌·페이지 썸네일([page-thumbnails.tsx](../src/components/exams/exam-paper-builder-client-parts/page-thumbnails.tsx))이 "전체 페이지 DOM 존재" 를 가정할 수 있음 → 스크롤 대상 페이지를 먼저 마운트하는 보정 필요.
- **예상 분량:** 1~2일.

### Phase 3 — 1000 천장 제거 + ID-only 전체선택 *(중간)*
**목표:** 1000개를 넘겨 선택·삽입.

- **파일:** [exam-paper-builder.ts](../src/actions/exam-paper-builder.ts) + 빌더 클라이언트
- `take: 1000` 상향/제거. 단 카드 데이터 전체를 일괄 로드하면 무거우니, **목록 표시용**은 페이지/필터 단위 fetch 로 분리하는 게 이상적(현재는 1회 일괄). 1차 절충: take 상향(예 3000) + Phase 1 가상화로 버팀.
- 워크벤치의 `getWorkbenchQuestionIds(academyId, filters)` 패턴을 빌더용으로 추가 → **id만** 반환. `toggleSelectAllFiltered`([panel:253](../src/components/exams/paper-builder/components/question-library-panel.tsx#L253))가 로드된 카드가 아니라 이 id 집합으로 동작하게.
- `addQuestionIdsToPaper`([client:563](../src/components/exams/exam-paper-builder-client.tsx#L563))는 `questionById` Map 의존 → 로드 안 된 id 가 들어오면 누락. 대량 삽입 시 **선택 id 들의 문항 데이터를 배치 fetch** 하는 단계 필요.
- **예상 분량:** 1일.

### Phase 4 — Export 경로 검증 *(대량 출력의 진짜 끝단)*
**목표:** 미리보기가 가벼워져도 docx/hwpx 생성이 1000문항을 견뎌야 의미가 있음.

- export route(서버)가 `paginateGroups` 를 재사용하는지, 문서 빌드가 메모리/타임아웃 안에서 도는지 확인. **여기서 막히면 앞 3개를 해도 "출력"은 실패.**
- 점검 항목:
  - 직렬화 페이로드 크기(선택 id 수백 개)
  - 서버 함수 타임아웃
  - 이미지 data URL 누적 메모리 (관련: 이미지 종횡비 동기 파싱 경로)
- **예상 분량:** 반나절(스파이크).

---

## 4. 권장 순서

1. **Phase 1** — 체감 개선 즉시, 리스크 낮음
2. **Phase 4 스파이크 먼저** — "진짜 대량 출력" 의 성패는 미리보기보다 **export 서버단**에서 갈림. 여기가 안 되면 선택 UI 를 다듬어도 산출물이 안 나오므로, Phase 3 본격 착수 전에 export 가 1000문항을 견디는지부터 검증.
3. **Phase 2** — 대량의 핵심 병목(미리보기)
4. **Phase 3** — 1000 천장 실제 돌파

---

## 5. 미해결/결정 필요 사항

- [ ] 한 시험지에 1000+ 문항(=수백 페이지)이 산출물로서 타당한가, 아니면 **여러 시험지로 분할 출력**이 맞는가?
- [ ] 목록 표시용 데이터를 서버 페이지네이션으로 전환할지, take 상향 + 가상화로 버틸지.
- [ ] 지문별 보기 가상화를 언제 할지(1차 제외).
- [ ] Export 서버단이 대량을 못 견디면 → 비동기 잡/스트리밍 생성으로 재설계할지.

---

## 6. 검증 방법

- Phase 1/2: 빌더에 수백 문항 시드(`EXAM_SEED_QUESTION_IDS_KEY` 경유) 후 스크롤/입력 반응성 측정.
- Phase 4: 실제 docx/hwpx export 호출로 생성 시간·메모리·산출물 페이지 수 확인.
- 회귀: `/code-review` 로 가상화 도입 후 선택/드래그/스크롤 동작 점검.
