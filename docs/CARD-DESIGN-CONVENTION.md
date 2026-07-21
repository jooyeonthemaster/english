# 카드 디자인 규약 (Card Design Convention)

앱 전반의 카드(문제·시험지·지문·학습지·분석·큐·폴더)가 **하나의 시스템**처럼 보이도록
하는 단일 규약. 새 카드를 만들거나 기존 카드를 손볼 때 이 문서를 기준으로 삼는다.

> 이 문서는 실제 컴포넌트에서 역으로 추출해 만든 규약이다. 표준 레퍼런스는
> [`ExamFileCard`](../src/components/exams/exam-file-card.tsx) 이며, 가로형 콘텐츠
> 카드는 모두 이 레이아웃을 따른다(각 카드 주석이 "시험지 관리 카드"를 명시적으로
> 참조한다).

---

## 0. 원칙 3가지

1. **복붙하지 말고 조합하라.** 공용 프리미티브(§3)를 반드시 재사용한다. 셸을
   새로 그릴 땐 표준 레시피(§2)의 className 을 그대로 가져와 시작한다.
2. **표준 레퍼런스는 `ExamFileCard`.** 가로형 콘텐츠 카드(시험지·지문·학습지·분석)는
   좌측 썸네일/상태 열 + 우측 본문 구조를 공유한다.
3. **요소별 스펙(§4)은 카드 종류가 달라도 동일하다.** 제목·삭제·체크박스·메타·
   상세 버튼은 어느 카드든 같은 규격을 쓴다. (현재 편차는 §7에 정리 — 새 코드는
   편차가 아니라 표준을 따른다.)

---

## 1. 카드 분류 (taxonomy)

| 분류 | 레이아웃 | 대표 컴포넌트 | 용도 |
|------|----------|----------------|------|
| **가로형 콘텐츠 카드** | `flex-row` 좌측 열 + 우측 본문 | `ExamFileCard`(표준), `PassageFileCard`, `BoardCard`(분석) | 시험지·지문·학습지·분석처럼 썸네일/상태를 가진 항목 |
| **문항 카드** | `flex-col` 접이식 | `QuestionBankCard` | 문제 은행. 본문(발문·선지)이 카드 내용 자체라 세로·collapsible |
| **큐/로딩 카드** | `flex-col` | `WorkbenchLoadingCard` | 생성·분석 진행 중 상태(공용 셸) |
| **폴더 카드** | `flex items-center` 한 줄 | `FolderCard` | 드롭 타깃 폴더 행 |

> 문항 카드가 세로·접이식인 건 의도된 예외다. 나머지 콘텐츠 카드는 전부 가로형.

---

## 2. 표준 가로형 카드 레시피 (canonical)

새 콘텐츠 카드는 이 골격에서 시작한다.

```tsx
<div
  role="button"
  tabIndex={0}
  data-drag-item-id={item.id}            // 드래그·마키 선택용
  className={cn(
    "group relative flex min-h-[128px] w-full min-w-0 max-w-full flex-row " +
      "overflow-hidden rounded-xl border bg-white transition-all duration-200 " +
      "hover:shadow-md cursor-pointer md:min-h-[176px]",
    selected
      ? "ring-2 ring-blue-400 border-blue-300"
      : "border-slate-200 hover:border-slate-300",
    isDragging && "opacity-40 scale-95",
  )}
>
  {/* 좌측: 썸네일 또는 상태 패널 (카드 높이를 세로로 가득) */}
  <div className="relative w-[24%] min-w-[74px] max-w-[96px] shrink-0 self-stretch
                  overflow-hidden border-r border-slate-100 bg-slate-50
                  md:w-[164px] md:min-w-[118px] md:max-w-[164px]">
    {/* <Thumbnail/> 또는 <StatusPanel/> */}
  </div>

  {/* 우측: 본문 */}
  <div className="flex min-w-0 flex-1 flex-col p-4">
    {/* 헤더: 드래그핸들 + 체크박스 + 제목 + 삭제 */}
    {/* 메타 칩 줄 */}
    {/* mt-auto 액션 행 + 상세 버튼 */}
  </div>
</div>
```

**핵심 상수**
- 모서리: `rounded-xl`, 배경 `bg-white`, 테두리 `border-slate-200`.
- 높이: `min-h-[128px]` + `md:min-h-[176px~232px]`(썸네일이 실사면 232, 상태
  패널이면 176 권장).
- hover: `hover:shadow-md` + `hover:border-slate-300`. **hover 시 배경색 변경 금지**
  (그림자로만 반응 — 예전 `hover:bg-blue-50/30` 은 폐기).
- 선택: `ring-2 ring-blue-400 border-blue-300`.
- 드래그 중: `opacity-40 scale-95`.

---

## 3. 공용 프리미티브 (반드시 재사용)

| 프리미티브 | 파일 | 규칙 |
|-----------|------|------|
| **상세보기 버튼** | [`CardDetailIconButton`](../src/components/ui/card-detail-icon-button.tsx) | 카드 열기 액션. 카드마다 `className="size-7 shrink-0 rounded-md shadow-none"` + `iconClassName="size-3.5"`. 기본 아이콘 `Maximize2`. 자체적으로 `data-card-click-ignore`/`data-drag-select-ignore` 를 달아 카드 선택과 충돌하지 않는다. **raw `Maximize2` 버튼 직접 만들지 말 것.** |
| **드래그 핸들** | [`DragHandle` + `makeCardDragPreview`](../src/components/ui/drag-handle.tsx) | `GripVertical h-4 w-4`, `hidden lg:flex`(모바일 숨김), `mt-1 shrink-0`. 네이티브 드래그는 **핸들에만** 등록해 본문은 마키 영역선택용으로 비워둔다. |
| **클릭 규약 헬퍼** | [`shared/card-click.ts`](../src/components/workbench/shared/card-click.ts) | 단일클릭=선택 / 더블클릭=열기. `shouldIgnoreCardSelectionClick`·`preventCardDoubleClickTextSelection` 등을 그대로 쓴다. |
| **로딩 셸** | [`WorkbenchLoadingCard`](../src/components/workbench/workbench-loading-card.tsx) | 생성·분석 진행 중은 이 셸로 렌더(직접 스피너 카드 만들지 말 것). `progressPercent`·`metaSlot`·`rightActions` 로 커스터마이즈. |

---

## 4. 요소별 표준 스펙

### 제목
```
text-[13px] font-semibold leading-snug text-slate-800 line-clamp-2 break-words
transition-colors group-hover:text-blue-600
```
`min-w-0 flex-1` 로 넓히고 `title={...}` 로 전체 텍스트 툴팁 제공.

### 삭제 버튼 — **표준: 저채도 슬레이트 → hover 로즈, `h-6 w-6`**
제목 줄 우측 상단 아이콘.
```
flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md
border border-slate-200 bg-white text-slate-300 transition-colors
hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600
```
`<Trash2 className="h-3.5 w-3.5" />`. 클릭 시 `e.stopPropagation()` 필수.
(과거 red-filled `h-7 w-7` 변형은 §7에서 정리 대상.)

### 선택 체크박스 — **표준: 18px 정사각 Check 버튼**
```
w-[18px] h-[18px] rounded flex items-center justify-center shrink-0 mt-1 transition-all
// selected:  bg-blue-600 text-white border border-blue-600
// unselected: bg-white border border-slate-300 text-transparent
//             hover:border-blue-400 hover:text-blue-400
```
`<Check className="w-3 h-3" />`. 헤더에서 순서: `DragHandle → 체크박스 → 제목`.

### 메타 칩 줄 — **표준: `text-[11px]`, 아이콘 `w-3 h-3 text-slate-400`**
```
<span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
  <Icon className="w-3 h-3 text-slate-400" /> 라벨
</span>
```
날짜/시간은 `text-[11px] tabular-nums text-slate-400`.

### 액션 버튼(하단 행)
`h-7 ... text-[11px]~[12px] font-semibold`, `mt-auto ... pt-3` 로 카드 바닥 정렬.
주 CTA 는 `flex-1 justify-center` 로 넓히고, 행 끝에 `CardDetailIconButton` 을 둔다.
톤 규약은 [워크벤치 버튼 색 규칙] 준수(학습자료=파랑, 검수=초록, 삭제=로즈).

### 상세보기 버튼
행 맨 끝 `CardDetailIconButton size-7`. 클릭 = 카드 열기(`onOpen`).

---

## 5. 상태·검수 색 규약

- **검수 완료(reviewed)**: 테두리 `border-emerald-300` + `hover:shadow-md`.
- **미검수(unreviewed) 핑크 글로우**: `border-red-200/80` +
  `shadow-[0_0_0_1px_rgba(252,165,165,0.35),0_0_18px_rgba(248,113,113,0.12)]`
  (문항·지문 카드 공통 언어).
- **분석/큐 상태 틴트**(StatusPanel·WorkbenchLoadingCard):
  - 분석 완료 = emerald · 실패 = rose · 임시/대기 = slate · 진행 = blue.
- **뱃지 pill**: `text-[9px]~[10px] font-bold`, shadcn `<Badge>` 또는 동일 규격 span.
  - 세트/자체 시험지 등 파란 계열 = `border-blue-200 bg-blue-50 text-blue-600`.
  - 중복 카운트 = `bg-red-500 text-white rounded-full`.

크레딧 소모 표기는 항상 `CreditCostChip`(별도 규약) 사용.

---

## 6. 인터랙션 규약

- **단일클릭 = 선택, 더블클릭 = 열기** (`shared/card-click.ts`). 네비게이션 전용
  카드(예: 분석 `BoardCard`)는 단일클릭=열기로 예외 허용.
- 네이티브 드래그는 **`DragHandle` 에만** 등록, 카드 본문은 마키 선택용.
- 카드 내부 버튼/링크는 전부 `e.stopPropagation()` (+ 링크는 `onKeyDown` 도).
  선택/열기와 충돌 없어야 할 버튼엔 `data-card-click-ignore` /
  `data-drag-select-ignore`(CardDetailIconButton 은 내장).
- 루트에 `data-drag-item-id={id}` 를 달아 드래그·마키 대상이 되게 한다.

---

## 7. 알려진 편차 & 정리 방향

새 코드는 **표준(오른쪽)** 을 따른다. 아래는 현존 편차(리팩터 시 수렴 대상).

| 요소 | 현재 편차 | 표준 |
|------|-----------|------|
| 삭제 버튼 | `PassageFileCard`·`QuestionBankCard` = red-filled `h-7 w-7` (`border-red-200 bg-red-50 text-red-600`) | 저채도 슬레이트 `h-6 w-6` → hover 로즈 (`ExamFileCard`·`BoardCard`) |
| 선택 링 | 라이브러리 카드 `ring-blue-500` / `ring-1 ring-blue-200` | `ring-2 ring-blue-400` |
| 선택 컨트롤 | shadcn `<Checkbox>`(문항), `size-[18px] rounded-[6px]`·`CheckSquare/Square`(라이브러리) | 18px 정사각 `Check` 버튼 |
| 상세/열기 | `exam-passage-library` 카드가 raw `Maximize2`/`ArrowRight` 직접 구현 | `CardDetailIconButton` |
| 메타 아이콘/글자 | `BoardCard.MetaChipsRow` = `h-3.5 w-3.5`·`text-xs` | `w-3 h-3`·`text-[11px]` |

---

## 8. 새 카드 체크리스트

- [ ] 가로형 콘텐츠 카드면 §2 레시피에서 시작했는가.
- [ ] `CardDetailIconButton`(size-7) 로 상세 버튼을 넣었는가(raw 아님).
- [ ] 드래그가 필요하면 `DragHandle` + `data-drag-item-id` 를 썼는가.
- [ ] 제목/삭제/체크박스/메타 칩이 §4 스펙과 일치하는가.
- [ ] 선택 링 `ring-2 ring-blue-400`, hover 는 그림자만(배경색 변경 없음).
- [ ] 내부 버튼에 `stopPropagation` 을 걸었는가.
- [ ] 진행 중 상태는 `WorkbenchLoadingCard` 로 그렸는가.

---

### 부록 — 컴포넌트 인덱스

| 카드 | 파일 |
|------|------|
| 시험지(표준) | `src/components/exams/exam-file-card.tsx` |
| 문항 | `src/components/workbench/question-bank-card.tsx` |
| 문항 세트 | `src/components/workbench/question-set-card.tsx` |
| 지문·학습지 | `src/components/workbench/passage-file-card.tsx` |
| 지문 큐 | `src/components/workbench/passage-queue-card.tsx` |
| 기출 지문/시험지 | `src/components/workbench/exam-passage-library/*.tsx` |
| 분석 | `src/components/exam-report/hub/analyses-board-cards.tsx` |
| 로딩(공용) | `src/components/workbench/workbench-loading-card.tsx` |
| 폴더 | `src/components/workbench/shared/folder-card.tsx` |
| 상세 버튼(공용) | `src/components/ui/card-detail-icon-button.tsx` |
| 드래그 핸들(공용) | `src/components/ui/drag-handle.tsx` |
