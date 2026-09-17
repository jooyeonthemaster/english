# 학생 분석 리포트 조회 경로 전수 조사 (26-09-01)

> 발단: 「내신 시험 분석」과 「내신 리포트 관리」 탭 차이를 확인하다가 나온 두 번째 과제 —
> "학생들한테 분석 리포트를 볼 수 있는 기능이 너무 복잡하다".
> 이 문서는 **코드 실측**만 담는다. 추정·제안은 §5 에 따로 표시했다.

---

## 0. 한 줄 결론

**복잡한 게 아니라 없다.** 로그인한 학생이 자기 내신 분석 리포트를 볼 수 있는 경로는
**0건**이다. 유일한 통로는 선생님이 학생 한 명씩 수동으로 토큰 링크를 발급해
카카오톡·복사로 보내는 `/r/[token]` 하나뿐이고, 그 링크에 닿기까지 선생님이 통과해야
하는 화면이 **7단계**다.

---

## 1. 실측: 학생 세션으로 내신 리포트에 닿는 경로 = 0건

`ExamReportStudent`(내신 분석 리포트가 저장되는 모델, `prisma/schema.prisma:912`)를
읽거나 쓰는 파일 **23개** 중, 학생 세션(`requireStudentAuth` / `getStudentSession` /
`auth-student`)을 쓰는 파일은 **하나도 없다**.

```
$ grep -rl "examReportStudent" src/ | wc -l
23
$ (그 23개 중 requireStudentAuth|getStudentSession|auth-student 를 쓰는 파일)
0
```

23개 전부 `requireAuth()`(스태프 세션) 아니면 **무인증 토큰 라우트**다.

| 접근 주체 | 경로 | 인증 | 비고 |
|---|---|---|---|
| 스태프(원장·강사) | `/director/workbench/exam-report/**` | 스태프 세션 | 생성·채점·리포트 전 과정 |
| 아무나(토큰 소지자) | `/r/[token]` | **무인증** | 리포트 열람. `shareEnabled` 만 검사 |
| 아무나(토큰 소지자) | `/a/[token]` | **무인증** | 학생 답안 입력 |
| 로그인 학생 | — | — | **경로 없음** |
| 로그인 학부모 | — | — | **경로 없음** (§3 참조) |

### 1-1. 학생 앱에는 리포트 표면 자체가 없다

`src/app/(student-app)/layout.tsx` 의 하단 탭은 3개뿐이다.

```ts
const SECTIONS = [
  { label: "학습", href: "/student/learn" },
  { label: "홈",   href: "/student" },
  { label: "마이", href: "/student/mypage" },
];
```

`(student-app)` 디렉터리 전체에서 `examReportStudent` 검색 결과 **0건**. 내신 리포트는
학생 앱에 존재하지 않는다.

### 1-2. DB 연결고리는 **이미 깔려 있다**

`ExamReportStudent.studentId`(`schema.prisma:933`)가 로스터 `Student.id` 를 가리키는
soft-ref 로 **이미 존재하고, 인덱스도 있다**(`@@index([studentId])`, `:945`).

```prisma
// ── 26-07-09 로스터 귀속(soft-ref, FK 미설정) ──
studentId        String?   // Student.id — null=기존 자유 이름입력(하위호환)
```

즉 **스키마 변경 없이** 학생 세션으로 "내 리포트 목록"을 조회할 수 있다.
빠진 건 데이터가 아니라 **읽는 화면과 API**다.

---

## 2. 선생님이 리포트 1건을 학생에게 보내기까지 — 실측 7단계

| # | 화면 | 하는 일 | 코드 |
|---|---|---|---|
| 1 | 내신 시험 분석 허브 | 분석 카드 클릭 → 워크스페이스 팝업 | `hub-client.tsx` |
| 2 | 워크스페이스 · 학생 탭 | 학생 클릭 → **전체 페이지 이동**(모달-인-모달 회피) | `students-tab.tsx` |
| 3 | 학생 워크스페이스 스텝1 「답안 수집」 | 답안지 사진 업로드 **또는** `/a/` 링크 발급→학생이 입력 | `read-step.tsx` |
| 4 | 스텝2 「채점」 | 정오표 확인 → `gradingConfirmed` | `verdict` |
| 5 | 스텝3 「분석」 | 착지 허브 | `analysis-step.tsx` |
| 6 | 스텝4 「AI 리포트」 | 생성 버튼(**5크레딧**) | `report-step.tsx` |
| 7 | 리포트 에디터 **사이드 패널** | 「공유 링크 만들기」 → 복사/카카오 → **수동 전달** | `report/editor-side-panel.tsx:221` → `share-panel.tsx` |

스텝 정의(`student-workspace-client.tsx:56`):

```ts
const STEP_META = [
  { key: "read",     label: "답안 수집" },
  { key: "verdict",  label: "채점" },
  { key: "analysis", label: "분석" },
  { key: "report",   label: "AI 리포트" },
];
```

### 2-1. 공유 버튼이 4단계 깊이에 묻혀 있다

`SharePanel` 의 유일한 호출부는 `editor-side-panel.tsx:221` 한 곳이다.
= 리포트 에디터 안 → 리포트 에디터는 스텝4 안 → 스텝4는 학생 워크스페이스 안 →
학생 워크스페이스는 분석 워크스페이스 안.
**리포트를 다 만들고도 "어디서 보내지?"가 안 보이는 구조.**

### 2-2. 일괄 공유가 없다

`students-tab.tsx` 는 `shareEnabled` 를 **표시만** 한다(`:469`, 공개/비공개 뱃지 · `:304` 정렬).
켜는 동작은 없다. 학생 30명이면 위 7단계 중 6~7번을 **30번 반복**해야 한다.

---

## 3. 학부모 앱도 연결돼 있지 않다

`(parent-app)/parent/reports/[reportId]` 는 **`ParentReport` 라는 완전히 다른 모델**을 읽는다
(`src/actions/parent/reports.ts:10`, `:36`). `ExamReportStudent` 와 어떤 링크도 없다
(`src/actions/exam-report/` 전체에서 `ParentReport` 참조 **0건**).

내신 분석 리포트 ↔ 학부모 앱은 **서로 다른 두 시스템**이고 이어져 있지 않다.

> 부수 관찰: `ParentReport` 에는 `status: SENT|VIEWED` 가 있어 **열람 여부를 안다**.
> 내신 분석 리포트에는 그런 필드가 없다 → 선생님은 **학생이 링크를 열었는지 알 수 없다**.

---

## 4. `/r/[token]` 링크 자체의 성질 (실측)

`src/app/r/[token]/page.tsx` + `src/actions/exam-report/share.ts`

| 항목 | 실측 | 평가 |
|---|---|---|
| 인증 | 없음. **토큰 소지 = 접근 권한** | 의도된 설계(주석 명시) |
| 색인 | `robots: { index:false, follow:false }` | 적절 |
| 메타데이터 | 학생명·점수 미포함 | 적절 |
| **만료** | **없음**. `shareEnabled` 불리언만 검사 | 한 번 보내면 영구 유효 |
| 폐기 | `shareEnabled=false` + **`shareToken=null`** → 재발급 시 rotate | 적절 |
| 열람 로그 | **없음** | 열었는지 알 수 없음 |
| 전달 | 선생님이 복사/카카오로 **수동** | 자동 발송 없음 |

---

## 5. 여기서부터는 제안 (실측 아님)

우선순위는 "학생이 겪는 마찰" 기준.

### P0 — 학생 앱에 「내 리포트」 붙이기
DB 연결고리(`studentId`)가 이미 있으므로 **스키마 변경 0**.
필요한 것: 학생 세션 조회 액션 1개 + `/student/mypage` 하위 목록/상세 화면.
이러면 "링크를 잃어버렸다 / 카톡에서 못 찾겠다"가 통째로 사라진다.

**결정 필요**: 학생 앱 표면은 `NEXT_PUBLIC_SHOW_USER_RESULTS` 로 잠겨 있다
(기본값 `false`, `feature-flags.ts:42`; `.env.production.example` 은 `true`).
프로덕션 실제 값 확인 후 새 표면을 이 플래그에 물릴지 별도 플래그로 뺄지 정해야 한다.

### P1 — 공유를 리포트 완성 지점으로 끌어올리기
지금은 에디터 사이드 패널 깊숙이 있다. 리포트 생성 완료 화면과
`students-tab` 행 액션에 「보내기」를 노출.

### P2 — 일괄 공유
`students-tab` 에 체크박스 + 「선택 학생 공유 켜기」. 지금은 표시만 하고 있어
컴포넌트 구조상 추가 비용이 작다.

### P3 — 열람 여부
`ExamReportStudent` 에 `viewedAt` 추가(`ParentReport.status` 관용구 미러).
"보냈는데 봤나?"에 답할 수 있게 된다.

### P4 — 링크 만료
현재 무기한. 학기/시험 단위 만료나 최소한 "만료일 표시"는 검토 가치.

---

## 6. 이 조사에서 나온 함정 (재발 방지)

1. **`(student-app)` 에 리포트가 있을 거라고 가정하면 안 된다.** 탭이 3개(학습·홈·마이)뿐이고
   `examReportStudent` 참조가 0건이다. "학생 리포트"라는 이름 때문에 학생 표면이
   있다고 착각하기 쉽다 — 그 이름은 **스태프 화면의 이름**이다.
2. **학부모 앱의 `/parent/reports` 는 내신 리포트가 아니다.** `ParentReport` 라는 별개
   모델이다. 경로 이름만 보고 이어져 있다고 판단하면 틀린다.
3. **`studentId` 는 이미 있다.** 학생 표면을 붙이는 작업을 "스키마 마이그레이션 필요"로
   잘못 견적내기 쉽다 — 아니다. 인덱스까지 있다.
4. **`students-tab` 의 공개/비공개 뱃지는 읽기 전용이다.** 거기서 공유를 켤 수 있다고
   오해하기 쉬움(뱃지가 클릭 가능해 보인다).
