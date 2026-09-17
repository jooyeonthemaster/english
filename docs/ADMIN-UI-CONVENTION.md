# 관리자 콘솔 UI 규약

관리자 화면(`/admin/**`)은 아래 부품과 값만 쓴다. 새 변형을 만들지 말고, 부족하면 부품을 고친다.
부품: `src/components/admin/kit/` · 라벨: `src/lib/admin-labels/` · 호버 상세: `src/components/admin/hover-detail/`

## 1. 디자인 값

| 항목 | 값 |
|---|---|
| 중성색 | `gray` 하나. `slate`·`zinc` 금지 (셸 다크 사이드바만 예외) |
| 주 버튼 | `Button` 기본 = blue-600 (`.admin-surface` 가 `--primary` 를 덮음). 위험 동작은 `bg-rose-600` |
| 성공 / 주의 / 실패 / 정보 | emerald / amber / rose / blue (`Tone` 어휘) |
| 글자 크기 | 11 · 12 · 13 · 15 · 22 · 26px 여섯 단계. 본문 13, 보조 12, 라벨 11, 구역 제목 15, 페이지 제목 22, 큰 숫자 26 |
| 모서리 | 입력·버튼 `rounded-lg`, 카드·팝업 `rounded-xl`, 칩 `rounded-full` |
| 카드 | `rounded-xl border border-gray-100 bg-white` (그림자 없음, 호버 시 `hover:shadow-md`) |
| 아이콘 | lucide, `size-4`(버튼·제목) / `size-3.5`(보조), `strokeWidth 2` (장식 1.8) |
| 숫자 | 표·카드의 숫자는 `tabular-nums` |
| 시각 | `formatDate`·`formatDateTime`(`@/lib/utils`, KST 고정). `toLocaleString`·`toLocaleDateString` 금지 — 서버(UTC)·브라우저(KST) 결과가 달라 화면이 다시 그려지고 날짜가 하루 어긋난다 |
| 간격 | 페이지 루트 `space-y-6`, 카드 내부 `p-5`, 표 셀 `px-4 py-3` |

## 2. 페이지 골격

```
<PageHeader title="결제 관리" description="…" actions={<Button>새 항목</Button>} />
<AdminTabs …/>              // 하위 화면이 있을 때만. 상태는 ?tab= 에 보존(useUrlTab)
<StatGrid><StatCard …/></StatGrid>   // 지표가 있을 때만
<FilterBar><SearchInput/><FilterChipGroup/></FilterBar>
<DataTable> … </DataTable>  // 또는 카드 목록
<AdminPagination/>          // 50건 넘는 목록은 반드시
```

- **제목 = 사이드바 메뉴명.** "관리" 접미사를 붙이지 않는다. 설명은 한 줄.
- 페이지 액션은 `PageHeader.actions` 에만 둔다. 주 버튼 1개, 나머지는 `variant="outline"`.
- 설정 위젯(가입 크레딧, 이미지 업로드 등)은 목록 페이지에 두지 않는다 → 설정 페이지.
- 상세 페이지는 `PageHeader back={{href,label}}` + `crumbs` 로 상단 바 브레드크럼을 채운다.
- 탭은 한 페이지에 한 줄만. 탭 안의 탭이 필요하면 페이지를 나눈다.

## 3. 부품별 규칙

| 용도 | 부품 | 금지 |
|---|---|---|
| 페이지 머리 | `PageHeader`, `BackLink` | 직접 쓴 `<h1>` |
| 하위 화면 전환 | `AdminTabs` + `useUrlTab` | `ui/tabs`, 직접 만든 세그먼트, `?view=` 링크 |
| 필터 | `FilterChip`/`FilterChipGroup`(사용자가 지운 분류는 `onRemove`), `SearchInput`(입력 즉시 + `useSearchDebounce` 250ms), `ui/select` | 네이티브 `<select>`, Enter 전용 검색 |
| 지표 | `StatCard`(md/sm) + `StatGrid` | 페이지별 MetricCard/StatCard/SummaryCard |
| 표 | `DataTable` + `Tr/Th/Td` (+`SortHeader`, `DataTableEmpty`) | raw `<table>`, 페이지별 헤더 스타일 |
| 상태 표시 | `StatusBadge map={…}` — 라벨·색은 레지스트리에서만 | 파일 안의 `STATUS_LABELS`, 인라인 삼항 |
| 팝업 | `AdminDialog` (sm 440 / md 600 / lg 768 / xl 1180). 2단 편집기는 `padded={false}`, 팝업 위에 Radix 밖 레이어를 띄우면 `onInteractOutside`·`onEscapeKeyDown` 로 닫힘을 가로챈다 | `fixed inset-0` 직접 오버레이, ui `Dialog` 직접 조립 |
| 확인 | `useConfirm()` / `ConfirmDialog` | `window.confirm`, `alert()` |
| 스위치 | `ui/switch` | `role="switch"` 버튼 |
| 빈 상태 | `AdminEmptyState` | 텍스트 한 줄, 페이지별 EmptyState |
| 구역 | `SectionCard` | 카드 마크업 반복 |
| 로딩 | 라우트 `loading.tsx`(공통) · 데이터 갱신 중 `opacity-60` · 버튼 안 `Loader2` | "불러오는 중..." 텍스트, CSS 스피너 |
| 알림 | `toast.*`(sonner) — 성공/실패 모두 | 인라인 성공 배너, `alert()` |
| 호버 상세 | `AdminHoverDetail` (행·카드) — 클릭 동작이 있으면 `click="none"` | — |

버튼: `ui/button` 만. `size="sm"`(h-8) 이 기본, 페이지 주 버튼은 `default`(h-9). 아이콘 전용은 `size="icon-sm"` + `aria-label`.
삭제 아이콘 버튼: `variant="ghost" size="icon-sm" className="text-gray-400 hover:bg-rose-50 hover:text-rose-600"`.

## 4. 라벨 레지스트리

`src/lib/admin-labels/` 가 유일한 원본이다. 화면·상세 빌더·서버 액션 모두 여기서 가져온다.

```ts
import { ACADEMY_STATUS, statusOf, labelOf } from "@/lib/admin-labels";
<StatusBadge map={ACADEMY_STATUS} value={academy.status} />
labelOf(PAYMENT_METHOD_STATUS, method)  // 문자열만 필요할 때
```

| 맵 | 값 |
|---|---|
| `ACADEMY_STATUS` | ACTIVE 활성 · TRIAL 체험 · SUSPENDED 정지 · DEACTIVATED 비활성 |
| `SUBSCRIPTION_STATUS` | TRIAL 체험 · ACTIVE 이용 중 · PAST_DUE 연체 · CANCELLED 해지 · SUSPENDED 중단 |
| `PLAN_TIER` · `STAFF_ROLE` · `AUTH_PROVIDER` | 요금제 등급 · 원장/강사 · Google/Kakao/이메일 |
| `TOPUP_STATUS` (+`TOPUP_MANUAL_COMPLETE`) | 결제 대기 · 입금 대기 · 충전 완료 · 실패 · 결제 취소 · 환불 (수동 충전 완료) |
| `PAYMENT_METHOD` (`paymentMethodLabel`) | 카드 · 간편결제 · 계좌이체 · 가상계좌 · 휴대폰 · 무통장입금 |
| `BANK_DEPOSIT_STATUS` | 미매칭 · 확인 필요 · 처리 실패 · 지급 완료 · 수동지급 · 무시됨 |
| `TRANSACTION_TYPE` | 월 정기 지급 · 사용 · 충전 · 수동 조정 · 환불 · 초기화 · 이월 · 소멸 |
| `REFERRAL_STATUS` | 지급 완료 · 승인 지급 · 보류 · 반려 · 회수됨 |
| 헬프센터 상태 | `src/lib/help-center.ts` (원본 유지) |

새 enum 은 맵에 추가한다. 맵에 없는 값은 회색 원문으로 보여 누락이 눈에 띈다.

## 5. 상세 보기 방식 (셋만)

1. **별도 페이지** — 학원·회원처럼 여러 구역이 있는 엔티티. `PageHeader back` + 브레드크럼.
2. **호버 팝오버 · 클릭 팝업** — 행·카드의 빠른 확인 (`AdminHoverDetail`).
3. **편집 팝업** — `AdminDialog`. 내용이 아주 길면 `lg`/`xl`.

우측 고정 패널, 인라인 펼침, 직접 만든 오버레이는 새로 만들지 않는다.

## 6. 페이지 교체 체크리스트

- [ ] `PageHeader` 로 제목 교체, 제목 = 메뉴명, 액션은 `actions` 로 이동
- [ ] 탭 → `AdminTabs` + `useUrlTab`(서버 `searchParams` 로 초기값 전달)
- [ ] 지표 카드 → `StatCard`/`StatGrid`
- [ ] 필터 줄 → `FilterBar` + `SearchInput` + `FilterChipGroup`
- [ ] 표 → `DataTable`, 숫자 열 `align="right"`
- [ ] 상태 라벨 맵 삭제 → `StatusBadge map=`
- [ ] raw `<button>` → `Button`; `confirm()`/`alert()` → `useConfirm`/`toast`
- [ ] 빈 상태 → `AdminEmptyState`; 50건 넘는 목록은 `AdminPagination`
- [ ] 동작은 그대로(핸들러·데이터 흐름 변경 금지), 500줄 넘는 파일은 `-parts/` 로 분리
- [ ] 브라우저 확인: 호버·클릭·필터·페이지 이동, 콘솔 에러 0

## 7. 아직 이 규약을 따르지 않는 곳 (의도적)

| 파일 | 이유 |
|---|---|
| `plans-admin-client.tsx` (1,175줄) | 구독 요금제 기능이 꺼져 있어(`SHOW_SUBSCRIPTION_BILLING=false`) 화면에 나오지 않는다. 기능을 켤 때 함께 정리한다. |
| `banner-target-picker.tsx` (665줄) | 색·칩만 규약에 맞췄다. 분할(다이얼로그 셸/필터/후보 표)은 별도 작업. |
| `exam-print-view.tsx` | 관리자 셸 밖의 인쇄 전용 화면. `alert()` 1곳 남음. |
| 단체 세미나 미리보기 본문 | 원장이 보는 화면을 그대로 재현하므로 관리자 회색 팔레트를 적용하지 않는다. |
