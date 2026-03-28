# NARA 프로젝트 최적화 점검 보고서

> **점검일**: 2026-03-28
> **범위**: 프로젝트 전체 (ERP + 학습 시스템)
> **상태**: 분석 완료, 수정 미착수 — 공동작업자와 확인 후 진행 예정

---

## 요약

| 심각도 | 건수 | 설명 |
|--------|------|------|
| Critical | 6 | 즉시 수정 권장 (성능/데이터 일관성) |
| Major | 7 | 성능 개선 효과 큼 |
| Minor | 10 | 점진적 개선 권장 |
| **합계** | **23** | |

---

## Critical (즉시 수정 권장)

### C1. startSession N+1 쿼리

- **파일**: `src/actions/learning-session.ts` (~254행)
- **담당**: 학습 시스템
- **문제**: 카테고리 4~6개에 대해 각각 `prisma.question.findMany` 호출 (6번 DB 왕복)
- **개선**: 한 번에 모든 카테고리 조회 후 메모리에서 분류

```ts
// AS-IS
for (const [category, count] of Object.entries(composition)) {
  const questions = await prisma.question.findMany({
    where: { passageId, learningCategory: category },
    include: { explanation: true },
    take: count * 3,
  });
}

// TO-BE
const allQuestions = await prisma.question.findMany({
  where: { passageId, learningCategory: { in: Object.keys(composition) } },
  include: { explanation: true },
});
const grouped = groupBy(allQuestions, q => q.learningCategory);
```

---

### C2. submitSession 순차 실행

- **파일**: `src/actions/learning-session.ts` (~434행)
- **담당**: 학습 시스템
- **문제**: `addXpInternal` → `updateLessonProgress` → `updateStreak` → `studyProgress.upsert` 4개가 순차 실행 (4~8초 소요)
- **개선**: `Promise.all`로 병렬화 (1~2초)

```ts
// AS-IS
await addXpInternal(studentId, xpEarned);
await updateLessonProgress(studentId, passageId, sessionType, seasonId);
await updateStreak(studentId);
await prisma.studyProgress.upsert({ ... });

// TO-BE
await Promise.all([
  addXpInternal(studentId, xpEarned),
  updateLessonProgress(studentId, passageId, sessionType, seasonId),
  updateStreak(studentId),
  prisma.studyProgress.upsert({ ... }),
]);
```

---

### C3. submitSession 트랜잭션 미사용

- **파일**: `src/actions/learning-session.ts` (~398행)
- **담당**: 학습 시스템
- **문제**: SessionRecord + WrongAnswerLog + XP + LessonProgress + Streak + StudyProgress 6개 write 작업이 트랜잭션 없이 분리. 중간 실패 시 데이터 불일치 발생
- **개선**: `prisma.$transaction(async (tx) => { ... })` 래핑

---

### C4. addXpInternal Race Condition

- **파일**: `src/actions/learning-session.ts` (~507행)
- **담당**: 학습 시스템
- **문제**: read → compute → write 패턴. 동시에 2개 세션 제출 시 XP 유실 가능
- **개선**: atomic increment 사용 또는 트랜잭션 내에서 처리

```ts
// AS-IS
const student = await prisma.student.findUnique({ where: { id: studentId }, select: { xp: true, level: true } });
let newXp = student.xp + amount; // race condition!
await prisma.student.update({ where: { id: studentId }, data: { xp: newXp, level: newLevel } });

// TO-BE (트랜잭션 + SELECT FOR UPDATE 또는 atomic)
await prisma.$transaction(async (tx) => {
  const student = await tx.student.findUniqueOrThrow({ where: { id: studentId } });
  // 계산 후 업데이트 (트랜잭션 내 안전)
});
```

---

### C5. "use client" 과다 사용 (학생 앱 90%)

- **파일**: `src/app/(student-app)/student/` 하위 대부분
- **담당**: ERP (학생 앱 UI)
- **문제**: 서버 컴포넌트로 충분한 페이지가 대부분 클라이언트 컴포넌트. `useEffect` + 서버액션 호출 패턴으로 SSR 미활용
- **영향**: 초기 번들 25~35% 증가, Suspense/스트리밍 SSR 미활용
- **핵심 대상**:
  - `student/page.tsx` — 홈 대시보드
  - `student/mypage/page.tsx` — 마이페이지
  - `student/learn/page.tsx` — 학습
  - `student/review/page.tsx` — 복습
  - `student/attendance/page.tsx` — 출석
- **개선**: async 서버 컴포넌트 + Suspense + 인터랙션 부분만 클라이언트

```tsx
// AS-IS (모든 페이지 공통 패턴)
"use client";
const [data, setData] = useState(null);
const [loading, setLoading] = useState(true);
useEffect(() => { getStudentDashboard().then(setData).finally(() => setLoading(false)); }, []);
if (loading) return <Skeleton />;

// TO-BE
// page.tsx (서버 컴포넌트)
export default async function StudentPage() {
  const data = await getStudentDashboard();
  return <StudentView data={data} />;
}
// StudentView.tsx ("use client" — 인터랙션만)
```

> **참고**: `src/app/(director)/director/page.tsx`가 올바른 패턴(async 서버 컴포넌트 + Suspense)을 이미 사용하고 있음

---

### C6. learn 페이지 워터폴 패턴

- **파일**: `src/app/(student-app)/student/learn/page.tsx` (~29행)
- **담당**: 학습 시스템 / ERP (UI)
- **문제**: `getActiveSeason()` 완료 후에야 `getLessonList(seasonId)` 시작 → 2번 왕복 지연
- **개선**: 서버 컴포넌트에서 한 번에 처리하거나, season + lesson을 합친 서버액션 제공

---

## Major (성능 개선 효과 큼)

### M1. analysisData 불필요 로드

- **파일**: `src/actions/workbench.ts` (~109행)
- **담당**: ERP (워크벤치)
- **문제**: 지문 **목록** 조회에서 `analysisData` (거대 JSON, 수백 KB) 포함
- **개선**: 목록에서 제외, 상세 조회에서만 로드

```ts
// AS-IS
analysis: { select: { id: true, updatedAt: true, analysisData: true } }

// TO-BE
analysis: { select: { id: true, updatedAt: true } }
```

---

### M2. passage.content 목록에서 로드

- **파일**: `src/actions/workbench.ts` (~256행)
- **담당**: ERP (워크벤치)
- **문제**: 문제 목록 조회에서 지문 전체 `content` (수 KB) 로드
- **개선**: 목록에서 `content` 제외

---

### M3. explanation 항상 include

- **파일**: `src/actions/learning-questions.ts` (~334행)
- **담당**: 학습 시스템
- **문제**: 문제 목록 조회에서 해설 데이터 항상 포함
- **개선**: 상세 조회에서만 include

---

### M4. 문제 저장 N+1 + 트랜잭션 미사용

- **파일**: `src/actions/learning-questions.ts` (~102행)
- **담당**: 학습 시스템
- **문제**: `for` 루프 안에서 순차 `create` (N회). question + explanation 생성이 분리되어 중간 실패 시 orphan 레코드
- **개선**: `prisma.$transaction` + `Promise.all`

---

### M5. Prisma 인덱스 6개 누락

- **담당**: 공통 (스키마)

| 모델 | 누락 인덱스 | 사용처 |
|------|-----------|--------|
| `SessionRecord` | `@@index([studentId, passageId])` | 중복 출제 최소화 쿼리 |
| `SessionRecord` | `@@index([studentId, passageId, sessionType])` | 세션 타입별 조회 |
| `LessonProgress` | `@@index([studentId, seasonId])` | 시즌별 진행도 조회 |
| `LessonProgress` | `@@index([seasonId])` | 시즌 단독 조회 |
| `NaeshinQuestion` | `@@index([academyId, learningCategory])` | 학원별 카테고리 필터 |
| `StudyProgress` | `@@index([studentId, date])` | 날짜 범위 쿼리 |

---

### M6. framer-motion 번들 과다

- **담당**: ERP (학생 앱 UI)
- **문제**: 8개 학생 앱 페이지에서 직접 import. 대부분 간단한 fade-in 애니메이션
- **영향 페이지**: student/page, mypage, learn, review, attendance, notifications 등
- **개선**: CSS transition으로 대체 또는 `next/dynamic` import

---

### M7. 1000줄 이상 컴포넌트 (코드 분할 필요)

- **담당**: ERP (워크벤치)

| 파일 | 줄수 | 분할 방안 |
|------|------|---------|
| `question-bank-client.tsx` | 1363 | 필터/액션/다이얼로그 분리 |
| `passage-detail-client.tsx` | 1122 | 문법/어휘/구조 탭별 분리 |
| `question-renderers.tsx` | 983 | 문제 타입별 분리 |
| `exam-create-wizard.tsx` | 865 | 스텝별 분리 |

---

## Minor (점진적 개선)

### m1. 오답 로그 upsert N+1

- **파일**: `src/actions/learning-session.ts` (~416행)
- **담당**: 학습 시스템
- **문제**: `wrongAnswers.map`으로 N번 upsert
- **개선**: 배치 처리 또는 raw SQL `ON CONFLICT`

---

### m2. 랭킹 매번 재계산

- **파일**: `src/actions/learning-gamification.ts` (~172행)
- **담당**: 학습 시스템
- **문제**: 주간 XP 랭킹을 조회할 때마다 raw SQL GROUP BY 실행
- **개선**: 캐시 (1시간 TTL) 또는 materialized view

---

### m3. myClassIds 중복 조회

- **파일**: `src/actions/dashboard.ts` (~620, 676행)
- **담당**: ERP
- **문제**: 같은 데이터를 2개 함수에서 각각 조회
- **개선**: 상위에서 1번 조회 후 인자로 전달

---

### m4. Enum 미사용 (5개)

- **담당**: 공통 (스키마)

| 현재 (String) | 권장 Enum | 값 |
|--------------|-----------|-----|
| Student.status | `StudentStatus` | ACTIVE, PAUSED, WITHDRAWN, WAITING |
| SessionRecord.sessionType | `SessionType` | MIX_1, MIX_2, STORIES, VOCAB_FOCUS, GRAMMAR_FOCUS, WEAKNESS_FOCUS |
| NaeshinQuestion.learningCategory | `LearningCategory` | VOCAB, INTERPRETATION, GRAMMAR, COMPREHENSION |
| Exam.status | `ExamStatus` | DRAFT, PUBLISHED, IN_PROGRESS, COMPLETED, ARCHIVED |
| ClassEnrollment.status | `EnrollmentStatus` | ENROLLED, DROPPED |

---

### m5. SessionRecord 중복 방지 unique 없음

- **담당**: 학습 시스템
- **문제**: 동일 학생이 같은 세션을 중복 제출 가능
- **개선**: `@@unique([studentId, passageId, seasonId, sessionType])` 추가 고려

---

### m6. WrongAnswerLog 역정규화

- **담당**: 학습 시스템
- **문제**: `where: { studentId, question: { passageId } }` → 관계 JOIN 필요
- **개선**: WrongAnswerLog에 `passageId` 필드 추가 + `@@index([studentId, passageId])`

---

### m7. onDelete 미설정 (4곳)

- **담당**: 공통 (스키마)

| 관계 | 권장 |
|------|------|
| SessionRecord → StudySeason | `onDelete: SetNull` |
| LessonProgress → StudySeason | `onDelete: SetNull` |
| Passage → School | `onDelete: SetNull` |
| Student → School | `onDelete: SetNull` |

---

### m8. wrongQuestionIds JSON 정규화

- **담당**: 학습 시스템
- **문제**: `SessionRecord.wrongQuestionIds`가 JSON 문자열. 역방향 쿼리 불가
- **개선**: 별도 `SessionQuestion` 테이블로 분리 (장기)

---

### m9. recharts 동적 임포트

- **담당**: ERP (마이페이지)
- **문제**: recharts (~190KB) 번들. 차트 1~2개만 사용
- **개선**: `next/dynamic`으로 lazy-load

---

### m10. next/image 미사용

- **담당**: 공통
- **문제**: 프로젝트 전체에서 `next/Image` import 0개. 모든 이미지가 기본 `<img>` 태그
- **개선**: `next/Image`로 교체 (WebP 자동 변환, 반응형, lazy-load)

---

## 담당 영역별 분류

### ERP 담당 (이 사용자)

| # | 이슈 | 파일 |
|---|------|------|
| C5 | "use client" 과다 | student/ 전체 |
| M1 | analysisData 불필요 로드 | workbench.ts |
| M2 | passage.content 불필요 로드 | workbench.ts |
| M6 | framer-motion 번들 | student/ 전체 |
| M7 | 1000줄+ 컴포넌트 | workbench 컴포넌트 |
| m3 | myClassIds 중복 조회 | dashboard.ts |
| m9 | recharts 동적 임포트 | mypage |
| m10 | next/image 미사용 | 전체 |

### 학습 시스템 담당 (공동작업자)

| # | 이슈 | 파일 |
|---|------|------|
| C1 | N+1 카테고리별 쿼리 | learning-session.ts |
| C2 | submitSession 순차 실행 | learning-session.ts |
| C3 | 트랜잭션 미사용 | learning-session.ts |
| C4 | addXpInternal race condition | learning-session.ts |
| C6 | learn 워터폴 패턴 | learn/page.tsx |
| M3 | explanation 항상 include | learning-questions.ts |
| M4 | 문제 저장 N+1 | learning-questions.ts |
| m1 | 오답 upsert N+1 | learning-session.ts |
| m2 | 랭킹 매번 재계산 | learning-gamification.ts |
| m5 | SessionRecord 중복 방지 | 스키마 |
| m6 | WrongAnswerLog 역정규화 | 스키마 |
| m8 | wrongQuestionIds 정규화 | 스키마 |

### 공통 (스키마 — 합의 후 진행)

| # | 이슈 |
|---|------|
| M5 | 인덱스 6개 추가 |
| m4 | Enum 5개 도입 |
| m7 | onDelete 4곳 명시 |
