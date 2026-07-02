# 보안 리메디에이션 — 테넌트 격리 / 민감정보 노출 (SMOAT)

> 상태: **조사 완료 · 코드 미수정.** 이 문서만 보고 새 세션(다른 채팅)에서 바로 수정 작업을 이어갈 수 있도록 작성됨.
> 작성 근거: 2026-07 다중 에이전트 보안 감사(인증/권한, 테넌트 격리, 학생·학부모 노출, 클라이언트 유출).
> 검증 명령: `npx tsc --noEmit -p tsconfig.json` / `npx eslint <파일>` / (가능 시) `next build`.
> 참고: 기존 미커밋 파일 `src/components/admin/members-list-client/bulk-credit-expiry-modal.tsx`의 tsc 에러 1건은 본 작업과 무관.

---

## 0. 배경 · 근본 원인 (먼저 읽기)

- **역할 모델**
  - 관리자(Admin): 별도 JWT. 가드 = `requireAdminAuth()` (`src/lib/auth-admin.ts`).
  - 원장/교사(Staff): `getStaffSession()` / `requireStaffAuth(role?)` (`src/lib/auth.ts`). 세션에 `academyId`(테넌트), `id`, `role`(DIRECTOR|TEACHER).
  - 학생/학부모/튜터학생: `getStudentSession()`(`auth-student.ts`), `auth-parent.ts`, `auth-tutor-student.ts`. 세션에 `academyId`/`studentId`(또는 parentId, studentIds).
- **멀티테넌트**: `School`, `Passage`, `Question`, `VocabularyList`, `Webtoon`, `Consultation`, `Material` 등 대부분 모델에 `academyId`가 있음. 유효 세션만으로는 부족하고 **반드시 `academyId`로 스코프**해야 함.
- **핵심 근본 원인 (체계적 패턴)**
  1. **서버 액션(`"use server"`)엔 미들웨어 게이트가 없음** → 모든 export는 클라이언트가 임의 인자로 직접 POST 호출 가능. 각 액션이 스스로 가드해야 함.
  2. `requireStaffAuth()`를 호출하고도 **세션의 academyId를 쓰지 않고 클라이언트가 넘긴 `academyId` 인자를 신뢰**.
  3. `findUnique/update/delete({ where: { id } })`를 **academyId 절 없이** 사용(전형적 IDOR).
  4. 일부 액션/라우트는 **인증 가드 자체가 없음**.

### 공통 수정 레시피 (모든 항목에 적용)
- **academyId는 세션에서만** 도출. 클라이언트 academyId 인자는 제거하거나, 남긴다면 `if (arg !== staff.academyId) throw`로 검증.
- **읽기**: `findUnique({where:{id}})` → `findFirst({ where: { id, academyId: staff.academyId } })` (학생 소유 데이터는 `studentId: session.studentId`).
- **쓰기/삭제**: `update/delete({where:{id}})` → `updateMany/deleteMany({ where: { id, academyId: staff.academyId } })` (절이 실제로 강제됨). 결과 `count===0`이면 권한 없음 처리.
- **무인증 액션**엔 `requireStaffAuth()` / `getStudentSession()` 추가. `studentId`는 클라이언트가 아니라 세션에서.
- **민감필드**는 `select` 화이트리스트로 제한(예: `loginToken`, `passwordHash`, 타인 `email`/`phone`/`memo` 제외).
- 권장: 공용 헬퍼 도입 — 예) `assertOwnedByAcademy(model, id, academyId)` 또는 `scopedWhere(id, academyId)` 유틸을 만들어 반복 제거.

---

## 1. CRITICAL (즉시)

### C1. 학부모 자동로그인 토큰 + PII가 교사/원장 클라이언트로 유출 → 학부모 계정 탈취
- 위치: `src/actions/students/queries.ts:120` `getStudent()`가 `parent: true`(Parent 전체 행) 포함 → `src/app/(teacher)/teacher/students/[studentId]/page.tsx`(:18,22-26)가 `student` 객체를 클라이언트 컴포넌트 `src/components/students/student-detail-client.tsx`("use client") prop으로 통째 전달.
- 노출: `Parent.loginToken`(패스워드리스 로그인 자격증명 — `src/lib/auth-parent.ts:48 loginParentByToken`이 이걸로 학부모 세션 발급) + `email`/`memo`/`emergencyContact`/`phone`. UI 미표시라도 RSC/네트워크 페이로드에 실림.
- 대상: 같은 학원 DIRECTOR·TEACHER.
- 수정:
  1. `getStudent()`의 `parent: true`를 `parent: { select: { id, name, phone, relation, emergencyContact } }`로 축소(=목록 액션 `getStudents()`와 동일 패턴). **`loginToken`은 절대 클라이언트로 보내지 않음.** 교사 컨텍스트에선 `email`/`memo`도 제외.
  2. 아래 H14(교사 담당반 스코프)와 함께 처리.

### C2. 학생 시험 응시 액션 전체 무인증 IDOR
- 위치: `src/actions/exam-taking.ts` — `getAvailableExams(studentId)`(:21), `startExam(examId, studentId)`(:79), `saveAnswer(submissionId,…)`(:200), `submitExam(submissionId)`(:228), `getExamResult(submissionId)`(:323). **인증 없음**, 클라이언트가 넘긴 id 신뢰. 페이지 `src/app/(student-app)/exams/page.tsx`, `.../[examId]/take/page.tsx`, `.../result/page.tsx`가 `localStorage`의 studentId 주입.
- 노출/영향: 임의 학생의 시험 목록·점수·문항·정답·해설·이름 열람, 남의 제출 조작/채점(무결성). 학원 경계 무시.
- 수정:
  1. 모든 액션에서 `const s = await getStudentSession()`로 `studentId`/`academyId` 도출, **studentId 인자 제거**.
  2. `submission`/`exam` 조회에 `studentId`(및 `academyId`) 절 추가; `getExamResult`는 `submission.studentId === s.studentId` 확인.
  3. 페이지 3곳이 `localStorage` studentId를 넘기지 않도록 정리(세션 기반). 참고: `src/actions/student-app-resources.ts:477 getStudentExamResults`가 `requireStudent()`를 쓰는 안전한 대체 패턴.

### C3. 출결(attendance) — 대부분 인증 없음 + 클라이언트 academyId 신뢰
- 위치: `src/actions/attendance.ts` — 무인증: `getTodayAttendance`(:225), `getAttendanceReport`(:262), `getMissingStudents`(:369), `getClassAttendance`(:325), `getClassesForAttendance`(:438), `getTeacherClasses`(:446), 키오스크 `checkIn`(:28)/`checkOut`(:110). `markAttendance`(:170)는 authed지만 **클라이언트 academyId로 씀**.
- 노출/영향: 임의 학원 전체 학생 명단 PII(이름·studentCode·학년·avatar) 열람, 출결 위조 쓰기, studentCode 존재 오라클.
- 수정:
  1. 모든 리더에 `requireStaffAuth()` 추가, academyId=세션값.
  2. `markAttendance`는 studentId/classId가 세션 academyId 소속인지 검증 후 쓰기.
  3. 키오스크 `checkIn/checkOut`은 로그인 세션이 없으므로 **별도 기기/키오스크 스코프 토큰**(academyId 바인딩)으로 게이트. 그 전까진 최소한 academyId를 세션/토큰에서만 받도록.

### C4. 대시보드 액션 — 클라이언트 academyId 신뢰, 원장 함수 무인증
- 위치: `src/actions/dashboard/director.ts` — `getDashboardKPIs`(:23), `getStudentTrend`(:146), `getPaymentSummary`(:193), `getTodayClasses`(:250), `getOverdueInvoices`(:292), `getRecentConsultations`(:326). `src/actions/dashboard/teacher.ts` — (:17,85,133,188) `(academyId, staffId)` 무인증.
- 노출: 타 학원 매출·수금률·학생수·미납 내역(학생 이름 포함)·상담·수업 데이터.
- 수정: 각 함수에서 `requireStaffAuth()` 호출 후 **세션 academyId 사용**, academyId/staffId 인자 제거(또는 검증).

### C5. 전 학원 학생 PII 대량 export — 잘못된 인증 티어
- 위치: `src/app/api/admin/tracking/export/route.ts:5-9,59-71` — 가드가 `auth()`(아무 staff), `/api/admin/` 경로인데 admin JWT 미확인, `vocabTestResult.findMany`의 `where`에 academyId 없음(최대 1만행).
- 노출: 모든 학원 학생 이름·학생코드·학교·점수 CSV.
- 수정: `requireAdminAuth()`로 변경(관리자 전용이면) **또는** 디렉터용이면 `where.academyId = staff.academyId` 강제.

---

## 2. HIGH

### H1. AI 챗 교차학원 노출 + conversationId IDOR (학생)
- `src/app/api/ai/chat/route.ts:49-55` `question.findFirst({ id, deletedAt:null })` academyId 없음; `:82-84` `aIConversation.findUnique({ id: conversationId })` 소유검증 없음(요청 본문 conversationId).
- 영향: 학생이 타 학원 문제의 정답/해설/지문, 남의 대화이력 수신. 과금은 공격자 학원.
- 수정: question 조회에 `academyId: session.academyId`; conversation은 `where:{ id, studentId: session.studentId }`. (`src/app/api/ai/question-edit/route.ts:93-94`가 올바른 패턴.)

### H2. 단어장 교차학원 읽기/쓰기
- 읽기: `src/app/api/vocab/[listId]/items/route.ts:16`(학생), `src/actions/student-app/vocab.ts:54-88 getVocabListForTest`.
- 쓰기: `src/app/api/vocab/import/route.ts:5-80`(`auth()`만, formData listId로 `createMany`).
- 수정: `vocabularyList`를 `findFirst({ id: listId, academyId: session.academyId })`로 소유 확인 후 items 접근/삽입.

### H3. 정답키·지문 콘텐츠 exfil (학생)
- `src/actions/learning-session/session.ts` — `startReviewSession`(~:156, `naeshinQuestion.findMany({ id:{in} , include:{explanation}})` 무스코프 → correctAnswer+해설), `startSession`(~:36, `passage.findUnique({id})` + prebuilt 세션 무스코프, sessionSeq 게이트 우회).
- `src/actions/learning-session-submit.ts:175-180 submitSession` — 클라 제공 id로 `naeshinQuestion.findMany` correctAnswer 유출 + 점수/XP 클라 제어(무결성).
- `src/actions/student-app-resources.ts:447-472 getPassageTranslations(passageId)` — `requireStudent()` 호출하나 미사용, `passageAnalysis.findUnique({passageId})` 무스코프 → 전체 번역.
- `src/actions/student-wrong-answers.ts:171-239 getPassageWrongDetail(passageId)` — `passage.findUnique({id})` 무스코프 → 지문 원문(오답로그 부분은 studentId 스코프로 안전).
- 수정: 모든 문제/지문 조회에 `academyId: session.academyId`; 정답은 서버가 채점하고 클라 isCorrect/score 신뢰 금지.

### H4. 레거시 시험 액션 미스코프 (원장/교사) — 하드닝된 `exams/` 대신 이게 import됨
- `src/actions/exam-grading.ts` — `getExamAnalytics(examId)`(:118, `director/exams/[examId]/page.tsx`가 import), `gradeSubmission`(:47), `getExamSubmissions`(:29) 모두 academyId 없음.
- `src/actions/exam-questions.ts` — `removeQuestionFromExam`(:71), `reorderExamQuestions`(:93), `deleteQuestion`(:245) raw-id 삭제/변경; `getQuestionBank`(:124)/`getClassesForFilter`(:157)/`getSchoolsForFilter`(:169) 클라 academyId 미검증.
- 수정: academyId 스코프 추가. **권장: 레거시 `exam-grading.ts`/`exam-questions.ts` 대신 하드닝된 `src/actions/exams/*`(crud/submissions/questions/lookups, `assert*BelongsToAcademy` 보유)로 import 교체 후 레거시 제거.**

### H5. 자료실(materials) 교차학원
- `src/actions/materials.ts` — `getMaterials(academyId)`(:44, 클라 academyId), `uploadMaterial`(:79, formData academyId로 저장경로+DB), `deleteMaterial(id)`(:153, `findUnique({id})` 무스코프). `getStudentMaterials`(:194)는 안전.
- 수정: academyId=세션값; delete는 `deleteMany({ id, academyId })`.

### H6. 워크벤치 액션 광범위 IDOR (원장/교사)
- 변경 IDOR(raw id, academyId 없음): `src/actions/workbench/passages.ts:706 updateWorkbenchPassage`, `:737 deleteWorkbenchPassage`, `:791 bulkUpdatePassageTags`; `questions.ts:707 updateWorkbenchQuestion`(+선행 read :607), `:1055 toggleQuestionStar`; `collections-question.ts:84/100/112/159`; `collections-passage.ts:68/84/96/142`; `collections-webtoon.ts:58/73/84/126`; `annotations.ts:104 updatePassageAnalysis`.
- 읽기 IDOR/미검증 academyId 인자: `passages.ts:122/175/247`, `questions.ts:222/290/321/411`, `stats.ts:10/103`, `annotations.ts:20`, `collections-question.ts:11`, `collections-passage.ts:12/172`, `collections-webtoon.ts:16`, `collections-draft.ts:15`.
- 정상(참고): `_question-where.ts`, `question-ai-edit.ts`, `question-drafts.ts`, `exam-passages.ts`, `passage-lookups.ts`, `getWorkbenchPassageIds:91`, `getAcademyQuestionCollectionMembership:34`.
- 수정: read는 academyId 인자 검증, 변경은 `updateMany/deleteMany({ id, academyId })` 또는 관계경로(`collection/exam/job:{academyId}`).

### H7. AI 지문분석/해설/수정 교차학원 read+write
- `src/app/api/ai/passage-analysis/[passageId]/route.ts` GET(:109-115)·POST(:260-263) `passage.findUnique({id})` 무스코프 → 읽기 + `passageAnalysis.upsert({where:{passageId}})`(:209-222/471-484)로 타 학원 분석 덮어쓰기.
- `src/app/api/ai/generate-explanation/route.ts:40-45`(read)+`:113-143`(write) — 타 학원 문제 읽고 official 해설 덮어쓰기.
- `src/app/api/ai/modify-question/route.ts:47-56` — 타 학원 문제/지문 읽기(읽기전용).
- 수정: `question`/`passage`를 `findFirst({ id, academyId: staff.academyId })`로.

### H8. 상담(consultations) IDOR + 학생 전화번호
- `src/actions/consultations.ts` — `getConsultation(id)`(:51), `updateConsultation`(:107), `deleteConsultation`(:147), `getStudentConsultations(studentId)`(:158) 무스코프.
- 수정: academyId 스코프(변경은 updateMany/deleteMany).

### H9. 커뮤니케이션(communication) IDOR + 학부모 PII 수확
- `src/actions/communication.ts` — `getNotice`(:44)/`updateNotice`(:88)/`deleteNotice`(:120) raw-id; `getConversation(partnerId)`(:238)가 `parent.findUnique({id})`로 **임의 학부모 이름·전화·자녀 수확**; `updateCalendarEvent`(:364)/`deleteCalendarEvent`(:388) raw-id.
- 수정: academyId 스코프; getConversation은 대화 상대가 세션 academyId 소속인지 검증.

### H10. 리포트(reports) IDOR + 학부모/성적 PII
- `src/actions/reports/generate-weekly.ts:10`, `generate-monthly.ts` — `student.findUnique({id})` 무스코프 → 임의 학생 리포트(출결·성적·분석·학부모 PII).
- `src/actions/reports/manage.ts` — `sendReport`(:8)/`updateReportComment`(:65)/`deleteReport`(:94) raw reportId.
- `src/actions/reports/bulk.ts:9 bulkGenerateReports(classId)` — class academy 미검증.
- 수정: student/report/class 모두 academyId 스코프.

### H11. 급여(finance) 교차학원 쓰기
- `src/actions/finance.ts` — `updateSalary(staffId, month,…)`(:296) staff 소속 미검증; `markSalaryPaid(salaryId)`(:333) `salary.update({id})` 무스코프. (finance summary/revenue/expenses는 안전.)
- 수정: staffId/salaryId가 세션 academyId 소속인지 확인 후 쓰기.

### H12. 학습 시즌(learning-admin) IDOR
- `src/actions/learning-admin.ts` — `updateSeason`(:105), `updateSeasonPassages`(:130), `getSeasonStudentProgress`(:150), `deleteSeason`(:257), `removeSeasonPassage`(:281), `reorderSeasonPassages`(:310) raw seasonId.
- 수정: seasonId academyId 스코프.

### H13. 내신문제(learning-questions) IDOR
- `src/actions/learning-questions/mutations.ts:11/25/36/54/71` approve/delete(+bulk) — `requireAuth()`만, academyId 절 없음.
- `src/actions/learning-questions/queries.ts:14 getLearningQuestionStats`(무인증), `:31 getLearningSets(academyId)`(미검증, 지문 유출), `:75 getNaeshinQuestions`, `:128 getSetCategoryStats`.
- 수정: 인증 추가 + academyId 스코프.

### H14. 교사 학생상세 IDOR (담당반 미검증)
- `src/actions/students/_helpers.ts:6 requireAuth()`는 role 미확인, `getStudent()`는 academyId만 스코프 → 교사가 안 가르치는 학생 상세(C1 데이터 포함)까지 URL 직접 접근으로 열람. 목록 `getStudentsByTeacher()`는 담당반 제한 있으나 상세가 우회됨.
- 수정: TEACHER면 해당 학생이 교사 담당반 소속인지 검증(또는 교사용 제한 변형 분리).

### H15. 학교/지문 교차학원 읽기
- `src/app/api/schools/[schoolSlug]/route.ts:16-24` `school.findFirst({slug})` academyId 없음(`@@unique([academyId, slug])`라 slug만으론 비유일).
- `src/app/api/schools/[schoolSlug]/passages/route.ts:16-30` school→passages 무스코프.
- 수정: `findFirst({ slug, academyId: session.academyId })`.

---

## 3. MEDIUM

- **M1. 학부모 교차학원 쓰기**: `src/actions/parent/messages.ts:122 sendParentMessage(staffId,…)`(staffId academy 미검증), `src/actions/parent/notices.ts:35 markNoticeAsRead(noticeId)`(무스코프 upsert), `src/actions/student-app-resources.ts:178`(동일 패턴). 수정: 대상이 세션 academyId 소속인지 검증.
- **M2. 게이미피케이션/분석 무인증·전역**: `src/actions/learning-gamification.ts:367 getIndividualRanking`(전 학원 대상 raw SQL, 행에 `Student.id` PK 노출; 이름 마스킹), `:303 getActiveMultiplier(studentId)` 및 `src/actions/learning-analytics.ts:150 updateStudentAnalytics(studentId)`(무인증 write 프리미티브). 수정: academyId 필터 + 세션 studentId 사용, ranking에서 PK 미노출.
- **M3. 로그인 열거(레이트리밋 없음)**: `src/app/api/auth/student-login/route.ts:17-28`, `src/app/api/auth/parent-login/route.ts:13-31` — 전 학원 대상 조회 + 구별되는 404 → 유효 학생코드/전화 무차별 탐색. (`tutor-student-login`은 리밋 있음.) 수정: 동일 IP/윈도우 레이트리밋 + 균일 응답.
- **M4. 무인증 AI 이미지 생성(비용 남용)**: `src/app/api/ai/generate-image/route.ts:7-16` — 인증/크레딧/레이트리밋 없음. 데이터 유출은 아니나 Atlas 비용 남용. 수정: 세션+크레딧 게이트 또는 최소 레이트리밋.

---

## 4. 검증됨 · 정상 (수정 불필요, 회귀 방지 참고)
- 클라이언트 번들 시크릿/NEXT_PUBLIC: 전부 공개용(은행계좌·PortOne 공개코드·KAKAO_JS_KEY·feature flags·SUPABASE anon). 실제 시크릿(`PORTONE_API_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`)은 서버 전용.
- 웹훅 HMAC: `portone/webhook`(`Webhook.verify`), `credits/top-ups/bank-notify`(bearer/HMAC), `seo/submit`(bearer). 강제됨.
- 원장 크레딧/결제(`(director)/director/credits/**`, `/api/credits/**`): 자기 학원만, `customData` 서버 스트립, 청구키 원문 미반환.
- 튜터 대화(`api/tutor/conversations/...`), 알림(`notifications/*`), 학부모 성적/청구/출결(studentIds.includes 검증), 헬프센터 DTO, 사이트배너, custom-question-types, 하드닝된 `src/actions/exams/*`·`exam-paper-builder.ts`·`question-sets.ts`·`custom-prompts.ts`·`billing.ts`·`classes.ts`, extraction 클러스터(`loadJobWithAuth`).

---

## 5. 실행 체크리스트

수정 시 각 항목 완료 후 체크. 파일 단위로 tsc/eslint 통과 확인.

CRITICAL
- [ ] C1 학부모 loginToken/PII 유출 — `students/queries.ts getStudent` select 축소 + (H14와 함께) 교사 스코프
- [ ] C2 `exam-taking.ts` 전 액션 세션 기반 재작성 + 페이지 3곳 localStorage studentId 제거
- [ ] C3 `attendance.ts` 리더 requireStaffAuth + academyId 세션화 + 키오스크 토큰
- [ ] C4 `dashboard/director.ts`·`teacher.ts` 인증 + 세션 academyId
- [ ] C5 `api/admin/tracking/export` requireAdminAuth 또는 academyId 스코프

HIGH
- [ ] H1 `api/ai/chat` question academyId + conversation studentId
- [ ] H2 vocab items/import/getVocabListForTest academyId
- [ ] H3 learning-session(session/submit)·student-app-resources(translations)·student-wrong-answers 지문/정답 스코프
- [ ] H4 exam-grading.ts·exam-questions.ts (레거시 → exams/ 로 교체 권장)
- [ ] H5 materials.ts get/upload/delete academyId
- [ ] H6 workbench/* 변경·읽기 IDOR 일괄
- [ ] H7 ai passage-analysis/generate-explanation/modify-question academyId
- [ ] H8 consultations.ts
- [ ] H9 communication.ts (특히 getConversation)
- [ ] H10 reports/* generate·manage·bulk
- [ ] H11 finance.ts salary
- [ ] H12 learning-admin.ts seasons
- [ ] H13 learning-questions/* mutations+queries
- [ ] H14 students/_helpers 교사 담당반 스코프
- [ ] H15 schools/[schoolSlug](+passages) academyId

MEDIUM
- [ ] M1 parent messages/notices 대상 academy 검증
- [ ] M2 gamification/analytics 인증+academyId, ranking PK 제거
- [ ] M3 student-login/parent-login 레이트리밋
- [ ] M4 ai/generate-image 게이트

마무리
- [ ] 전체 `npx tsc --noEmit` 통과
- [ ] 변경 파일 `npx eslint` 통과
- [ ] (가능 시) `next build` 통과
- [ ] 공용 스코프 헬퍼 도입 여부 결정 및 반영

---

## 6. 새 세션에서 시작하는 법
1. 이 파일(`SECURITY_REMEDIATION.md`)을 연다.
2. 위 "공통 수정 레시피"를 규약으로 삼는다.
3. 원하는 우선순위(예: CRITICAL만 / CRITICAL+HIGH 일괄)를 지정한다.
4. 각 항목의 file:line으로 이동해 레시피대로 수정, 항목별 tsc/eslint로 검증, 체크박스 갱신.
5. 하드닝된 참고 구현: `src/actions/exams/*`, `src/app/api/ai/question-edit/route.ts:93-94`, `src/actions/student-app-resources.ts:477`.
