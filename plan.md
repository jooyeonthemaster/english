# 다른 영어 학원 온라인 강의실 - 구현 계획서

## Context

강동구 소재 영어학원 "다른 영어 학원"의 온라인 강의실 플랫폼을 처음부터 구축한다.

학교별 맞춤형 내신 대비 서비스로, 핵심 지문 분석/영단어 테스트/시험 해설/AI Q&A를 제공한다.

프로젝트 디렉토리(`c:\Users\jooye\Desktop\2026project\nara`)는 현재 완전히 비어있다.

**핵심 가치**: 학생별 개인 맞춤형 + 학교별 맞춤형 + AI 솔루션

---

## 기술 스택

| 영역 | 기술 |

|------|------|

| Framework | Next.js 15 (App Router, React 19) |

| UI | shadcn/ui + Tailwind CSS 4 |

| DB | Prisma ORM + SQLite (개발) → PostgreSQL (프로덕션) |

| Auth | NextAuth v5 (관리자) + JWT 쿠키 (학생) |

| AI | Vercel AI SDK + Google Gemini 3.0 Flash (`@ai-sdk/google`, `gemini-3-flash-preview`) |

| 상태관리 | TanStack Query v5 (서버 상태) + React Context (세션) |

| 폼 | React Hook Form + Zod |

| 애니메이션 | Framer Motion (스와이프 카드) |

| 차트 | Recharts (학습 통계) |

| 에디터 | Tiptap (관리자 리치 텍스트) |

| 토스트 | Sonner |

| 바텀시트 | Vaul |

---

## 디자인 시스템 (Toss 스타일)

### 색상 팔레트

```

--bg-primary:      #FFFFFF    (메인 배경)

--bg-secondary:    #F7F8FA    (380px 컨테이너 바깥 배경)

--bg-tertiary:     #F2F3F6    (카드 호버, 인풋 배경)

--text-primary:    #191F28    (제목, 본문)

--text-secondary:  #8B95A1    (설명, 플레이스홀더)

--text-tertiary:   #B0B8C1    (비활성, 힌트)

--accent:          #3182F6    (CTA 버튼, 링크 - 인터랙티브 요소만)

--accent-subtle:   #E8F3FF    (액센트 배경 틴트)

--success:         #34C759    (정답)

--error:           #F04452    (오답)

--border:          #E5E8EB    (카드 테두리, 구분선)

```

### 타이포그래피

-**메인 폰트**: Pretendard Variable (한국어+영문, `next/font/local`)

-**모노스페이스**: JetBrains Mono (관리자 프롬프트 에디터)

-**폴백**: "Apple SD Gothic Neo", "Malgun Gothic", sans-serif

### 레이아웃

-**학생 페이지**: `max-width: 380px`, 중앙 정렬, 모바일 최적화

-**관리자 페이지**: 사이드바(240px) + 메인 콘텐츠, PC 레이아웃

-**터치 타겟**: 최소 44x44px

-**카드 라운드**: 16px / 버튼: 12px / 인풋: 8px / 뱃지: pill(999px)

---

## 대상 학교 (33개교)

### 중학교 (19개)

강동중, 강명중, 강빛중, 강일중, 고덕중, 동북중, 동신중, 둔촌중, 명일중, 배재중, 상일중, 성내중, 성덕여중, 신명중, 신암중, 천일중, 천호중, 한산중, 한영중

### 고등학교 (14개)

강동고, 강일고, 광문고, 동북고, 둔촌고, 명일여고, 선사고, 성덕고, 상일여고, 한영고, 한영외고, 배재고, 서울컨벤션고, 상일미디어고

---

## 프로젝트 구조

```

nara/

├── prisma/

│   ├── schema.prisma

│   ├── seed.ts

│   └── migrations/

├── public/

│   └── fonts/

├── src/

│   ├── app/

│   │   ├── layout.tsx                    # 루트: 폰트, 프로바이더

│   │   ├── globals.css

│   │   │

│   │   ├── (student)/                    # 모바일 380px 라우트 그룹

│   │   │   ├── layout.tsx                # MobileLayout 래퍼

│   │   │   ├── page.tsx                  # 학교 선택 페이지

│   │   │   ├── login/page.tsx            # 학생 로그인

│   │   │   └── [schoolSlug]/

│   │   │       ├── layout.tsx            # 학교 컨텍스트 + 바텀 네비

│   │   │       ├── page.tsx              # 학교 홈 메뉴

│   │   │       ├── passages/

│   │   │       │   ├── page.tsx          # 지문 목록

│   │   │       │   └── [passageId]/page.tsx  # 지문 상세 분석

│   │   │       ├── vocab/

│   │   │       │   ├── page.tsx          # 단어장 목록

│   │   │       │   └── [listId]/

│   │   │       │       ├── page.tsx      # 단어 목록 상세

│   │   │       │       └── test/

│   │   │       │           ├── page.tsx  # 단어 테스트 (스와이프)

│   │   │       │           └── result/page.tsx  # 테스트 결과

│   │   │       ├── exams/

│   │   │       │   ├── page.tsx          # 시험 목록

│   │   │       │   └── [examId]/

│   │   │       │       ├── page.tsx      # 문항 번호 그리드

│   │   │       │       └── [questionNum]/page.tsx  # 문항 해설 + AI

│   │   │       └── mypage/

│   │   │           ├── page.tsx          # 마이페이지 대시보드

│   │   │           ├── wrong-answers/page.tsx  # 오답 노트

│   │   │           └── progress/page.tsx      # 학습 진도

│   │   │

│   │   ├── (admin)/                      # PC 레이아웃 라우트 그룹

│   │   │   ├── layout.tsx                # AdminLayout (사이드바+메인)

│   │   │   └── admin/

│   │   │       ├── page.tsx              # 관리자 대시보드

│   │   │       ├── login/page.tsx        # 관리자 로그인

│   │   │       ├── schools/

│   │   │       │   ├── page.tsx          # 학교 목록

│   │   │       │   └── [schoolSlug]/

│   │   │       │       ├── page.tsx      # 학교 상세

│   │   │       │       ├── passages/

│   │   │       │       │   ├── page.tsx  # 지문 관리

│   │   │       │       │   └── create/page.tsx

│   │   │       │       ├── vocab/

│   │   │       │       │   ├── page.tsx  # 단어장 관리

│   │   │       │       │   └── create/page.tsx

│   │   │       │       ├── exams/

│   │   │       │       │   ├── page.tsx  # 시험 관리

│   │   │       │       │   ├── create/page.tsx

│   │   │       │       │   └── [examId]/

│   │   │       │       │       └── questions/

│   │   │       │       │           ├── page.tsx

│   │   │       │       │           └── create/page.tsx

│   │   │       │       └── prompts/page.tsx  # AI 프롬프트 관리

│   │   │       ├── students/

│   │   │       │   ├── page.tsx          # 학생 목록

│   │   │       │   └── [studentId]/page.tsx  # 학생 상세

│   │   │       └── tracking/page.tsx     # 학습 추적 대시보드

│   │   │

│   │   └── api/

│   │       ├── auth/[...nextauth]/route.ts

│   │       ├── auth/student/login/route.ts

│   │       ├── ai/chat/route.ts          # AI 스트리밍 응답

│   │       └── vocab/import/route.ts     # CSV 벌크 임포트

│   │

│   ├── components/

│   │   ├── ui/                           # shadcn/ui 컴포넌트

│   │   ├── layout/

│   │   │   ├── mobile-layout.tsx         # 380px 래퍼

│   │   │   ├── admin-layout.tsx          # PC 사이드바 레이아웃

│   │   │   ├── admin-sidebar.tsx

│   │   │   ├── bottom-nav.tsx            # 학생 하단 네비 (홈/학습/MY)

│   │   │   └── top-bar.tsx               # 학생 상단 바 (뒤로가기+제목)

│   │   ├── school/

│   │   │   ├── school-selector.tsx       # 학교 선택 그리드

│   │   │   └── school-menu.tsx           # 학교 홈 메뉴 카드

│   │   ├── passage/

│   │   │   ├── passage-reader.tsx        # 지문 뷰어 (하이라이트+노트)

│   │   │   └── passage-list-item.tsx

│   │   ├── vocab/

│   │   │   ├── swipe-card.tsx            # 듀오링고 스타일 스와이프 카드

│   │   │   ├── swipe-card-stack.tsx      # 카드 스택 관리

│   │   │   ├── test-progress.tsx         # 테스트 진행률 바

│   │   │   ├── test-result-summary.tsx   # 결과 요약 (원형 프로그레스)

│   │   │   └── vocab-card.tsx            # 단어 카드 (목록용)

│   │   ├── exam/

│   │   │   ├── question-navigator.tsx    # 가로 스크롤 문항 번호

│   │   │   ├── explanation-viewer.tsx    # 해설 뷰어

│   │   │   └── question-number-grid.tsx  # 문항 번호 그리드

│   │   ├── ai/

│   │   │   ├── ai-chat-sheet.tsx         # 바텀시트 AI 챗

│   │   │   ├── ai-message-bubble.tsx     # 메시지 버블

│   │   │   └── ai-chat-input.tsx         # 입력 필드

│   │   ├── mypage/

│   │   │   ├── wrong-answer-card.tsx

│   │   │   ├── study-stats.tsx

│   │   │   ├── progress-chart.tsx

│   │   │   └── calendar-heatmap.tsx      # 학습 활동 히트맵

│   │   ├── admin/

│   │   │   ├── question-editor.tsx       # 문제 에디터

│   │   │   ├── explanation-editor.tsx    # 해설 에디터

│   │   │   ├── vocab-bulk-import.tsx     # CSV 임포트

│   │   │   ├── prompt-editor.tsx         # AI 프롬프트 에디터

│   │   │   ├── student-tracking-table.tsx

│   │   │   └── school-switcher.tsx

│   │   └── shared/

│   │       ├── empty-state.tsx

│   │       ├── loading-skeleton.tsx

│   │       └── confirm-dialog.tsx

│   │

│   ├── lib/

│   │   ├── prisma.ts                     # Prisma 클라이언트 싱글턴

│   │   ├── auth.ts                       # NextAuth 설정

│   │   ├── auth-student.ts               # 학생 JWT 인증

│   │   ├── ai.ts                         # Vercel AI SDK 설정

│   │   ├── utils.ts                      # cn(), formatDate() 등

│   │   ├── constants.ts                  # 33개 학교 데이터

│   │   ├── validations.ts               # Zod 스키마

│   │   └── fonts.ts                      # Pretendard 폰트

│   │

│   ├── actions/                          # Server Actions

│   │   ├── auth.ts

│   │   ├── passages.ts

│   │   ├── vocab.ts

│   │   ├── exams.ts

│   │   ├── ai-chat.ts

│   │   ├── prompts.ts

│   │   └── tracking.ts

│   │

│   ├── hooks/

│   │   ├── use-vocab-test.ts             # 단어 테스트 상태 머신

│   │   ├── use-swipe.ts                  # 스와이프 제스처

│   │   ├── use-school.ts                 # 현재 학교 컨텍스트

│   │   └── use-student.ts               # 현재 학생 세션

│   │

│   ├── providers/

│   │   ├── query-provider.tsx

│   │   └── session-provider.tsx

│   │

│   └── types/

│       └── index.ts                      # 모든 타입 정의

```

---

## 데이터베이스 스키마 (핵심 모델)

### Enums

-`SchoolType`: MIDDLE | HIGH

-`Semester`: FIRST | SECOND

-`ExamType`: MIDTERM | FINAL | MOCK

-`VocabTestType`: EN_TO_KR | KR_TO_EN | SPELLING

-`UserRole`: STUDENT | TEACHER | ADMIN

### 모델 (15개)

| 모델 | 용도 | 주요 필드 |

|------|------|----------|

| `School` | 33개 학교 | name, slug, type, grades[] |

| `Student` | 학생 | name, studentCode(unique), grade, schoolId |

| `Admin` | 관리자/선생님 | email, password, role, schoolIds[] |

| `Passage` | 핵심 지문 | schoolId, title, content, grade, semester, unit |

| `PassageNote` | 지문 강조 노트 | passageId, content, noteType, highlightStart/End |

| `VocabularyList` | 단어장 | schoolId, title, grade, semester |

| `VocabularyItem` | 개별 단어 | listId, english, korean, partOfSpeech, example |

| `VocabTestResult` | 테스트 결과 | studentId, listId, testType, score, total, takenAt |

| `WrongVocabAnswer` | 오답 단어 | studentId, itemId, testType, count, lastMissedAt |

| `Exam` | 시험지 | schoolId, grade, semester, examType, year, title |

| `ExamQuestion` | 시험 문항 | examId, questionNumber, correctAnswer, passageId |

| `QuestionExplanation` | 문항 해설 | questionId, content(HTML), keyPoints[] |

| `TeacherPrompt` | 선생님 AI 프롬프트 | schoolId, passageId?, content, promptType |

| `AIConversation` | AI 대화 기록 | studentId, questionId, messages(JSON) |

| `StudyProgress` | 일별 학습 현황 | studentId, date, vocabTests, vocabScore |

### 핵심 인덱스

-`School.slug` (unique)

-`Student.studentCode` (unique)

-`Exam(schoolId, grade, year)` (composite)

-`VocabTestResult(studentId, takenAt)` (composite)

-`WrongVocabAnswer(studentId, itemId, testType)` (unique composite)

-`AIConversation(studentId, questionId)` (unique composite)

---

## 인증 시스템

### 관리자 (NextAuth v5)

- 이메일 + 비밀번호 (bcrypt 해시)

-`/admin/login` 페이지

- 세션 쿠키 기반
- role: TEACHER | ADMIN

### 학생 (경량 JWT)

- 학교 선택 + 학생 코드 입력 (비밀번호 없음)

-`/login` 페이지

- httpOnly 쿠키에 JWT 저장 (30일 유효)
- 지문/단어장/해설은 로그인 없이 열람 가능
- 마이페이지/테스트 결과 저장만 로그인 필요

---

## AI 통합 (문항별 Q&A)

### 흐름

```

학생이 문항 해설 페이지에서 AI 질문 →

바텀시트 챗 UI 열림 →

POST /api/ai/chat (스트리밍) →

시스템 프롬프트 구성:

  1. 문항 텍스트 + 선택지

  2. 정답

  3. 해설 내용

  4. 관련 지문 (있으면)

  5. 선생님 등록 프롬프트 (학교별/지문별)

→ AI 응답 스트리밍 → DB에 대화 저장

```

### AI 모델

-**모델**: Google Gemini 3.0 Flash (`gemini-3-flash-preview`)

-**SDK**: Vercel AI SDK의 `@ai-sdk/google` 패키지

-**환경변수**: `GOOGLE_GENERATIVE_AI_API_KEY` (Google AI Studio에서 발급)

### 시스템 프롬프트 구조

- 역할: "다른 영어 학원" 영어 튜터
- 한국어로 답변
- 해당 문항에만 집중
- 선생님 강조사항 반영
- 다른 문항 답 미공개

---

## 핵심 UX 상세

### 단어 테스트 (듀오링고 스타일)

1. 카드 스택 형태로 단어 표시

2.**영→한**: 영단어 보여주고 한국어 뜻 4지선다

3.**한→영**: 한국어 뜻 보여주고 영단어 4지선다

4.**스펠링**: 한국어 뜻 보여주고 영단어 직접 입력

5. 정답 시 초록색 피드백 + 다음 카드로 자동 전환
6. 오답 시 빨간색 + 정답 표시 + WrongVocabAnswer count++
7. 완료 시 원형 프로그레스로 점수 표시 + "틀린 단어만 재시험" 버튼
8. Framer Motion 스프링 물리: `{ stiffness: 500, damping: 30 }`

### 문항 해설 + AI

1. 상단: 가로 스크롤 문항 번호 필 (현재 문항 하이라이트)
2. 중앙: 문항 텍스트 → 정답 → 상세 해설 (리치 텍스트)
3. 하단 고정: "AI에게 질문하기" 버튼
4. 탭 시 바텀시트(60%/90% 스냅) 올라옴
5. 스트리밍 타이핑 효과로 AI 응답 표시

### 마이페이지

1. 상단: 이름 + 학교 + 학년 카드
2. 통계 행: 총 테스트 / 평균 점수 / 연속 학습일
3. 자주 틀리는 단어: 칩 형태로 상위 10개
4. 캘린더 히트맵: 일별 학습 활동 시각화
5. 최근 테스트 기록: 날짜별 점수 리스트

---

## 관리자 페이지 핵심 기능

### 문제 생성

- 리치 텍스트 에디터로 문항 작성
- 선택지 동적 추가/삭제
- 정답 지정
- 해설 에디터 (별도 탭)
- 관련 지문 연결 (드롭다운)

### 단어 등록

- 개별 추가: 영단어, 한국어 뜻, 품사, 예문
- CSV 벌크 임포트: 드래그앤드롭 → 미리보기 → 확인
- 일별 테스트 세트 구성

### AI 프롬프트 등록

- 학교별 + 지문별로 선생님이 강조사항 수기 입력
- 프롬프트 타입: 일반/문법/어휘/시험 포커스
- 미리보기: 등록한 프롬프트가 AI 응답에 어떻게 반영되는지 테스트

### 학생 추적

- 필터: 학교 / 날짜 범위 / 학생명 검색
- 테이블: 학생명, 학교, 날짜, 단어장, 점수, 소요시간
- 개별 학생 클릭 → 상세 학습 이력
- CSV 내보내기

---

## 구현 순서 (8단계)

### Phase 1: 프로젝트 초기화 및 기반

- [ ] `create-next-app` + TypeScript + Tailwind + App Router
- [ ] `shadcn/ui init` + 커스텀 테마 (Toss 색상)
- [ ] Pretendard 폰트 설정
- [ ] globals.css에 디자인 토큰 정의
- [ ] Prisma 스키마 작성 + 마이그레이션
- [ ] 33개 학교 시드 데이터
- [ ] MobileLayout (380px) + AdminLayout (사이드바) 컴포넌트
- [ ] TopBar + BottomNav 컴포넌트
- [ ] 공통 컴포넌트 (empty-state, loading-skeleton)

### Phase 2: 인증 시스템

- [ ] NextAuth v5 설정 (관리자)
- [ ] 관리자 로그인 페이지
- [ ] 학생 JWT 인증 시스템
- [ ] 학생 로그인 페이지 (학교 선택 + 코드 입력)
- [ ] 미들웨어 라우트 보호
- [ ] 세션 프로바이더

### Phase 3: 학생 - 학교 선택 & 홈

- [ ] 학교 선택 페이지 (중/고 탭 + 검색 + 학교 그리드)
- [ ] 학교 홈 메뉴 (지문분석/단어장/시험해설/마이페이지 카드)
- [ ] 학교 컨텍스트 레이아웃 (slug 기반)

### Phase 4: 관리자 - 콘텐츠 관리

- [ ] 관리자 사이드바 네비게이션
- [ ] 학교 목록/상세 페이지
- [ ] 지문 CRUD (Tiptap 에디터 + 노트 생성)
- [ ] 단어장 CRUD + CSV 벌크 임포트
- [ ] 시험 CRUD + 문항 생성/해설 에디터
- [ ] AI 프롬프트 등록/관리 페이지

### Phase 5: 학생 - 콘텐츠 열람

- [ ] 지문 목록 (학년/학기 필터)
- [ ] 지문 상세 뷰어 (하이라이트 + 인라인 노트)
- [ ] 시험 목록 (학년/학기/유형 필터)
- [ ] 문항 번호 그리드
- [ ] 문항 해설 뷰어

### Phase 6: 학생 - 단어 테스트 엔진

- [ ] `useVocabTest` 상태 머신 훅
- [ ] SwipeCard + SwipeCardStack (Framer Motion)
- [ ] 영→한 4지선다 모드
- [ ] 한→영 4지선다 모드
- [ ] 스펠링 입력 모드
- [ ] 테스트 진행률 바
- [ ] 테스트 결과 페이지 (원형 프로그레스)
- [ ] 오답 DB 기록 + "틀린 단어 재시험"

### Phase 7: AI Q&A + 마이페이지

- [ ] Vercel AI SDK 설정
- [ ] `/api/ai/chat` 스트리밍 엔드포인트
- [ ] 컨텍스트 빌더 (문항+해설+지문+프롬프트 조합)
- [ ] AI 챗 바텀시트 UI
- [ ] 대화 기록 저장
- [ ] 마이페이지 대시보드 (통계/오답/히트맵)
- [ ] 오답 노트 페이지
- [ ] 학습 진도 차트

### Phase 8: 관리자 추적 + 마무리

- [ ] 학생 목록/상세 페이지
- [ ] 일별 학습 추적 대시보드 (필터+테이블)
- [ ] CSV 내보내기
- [ ] 스켈레톤 로딩 전 페이지 적용
- [ ] 에러 바운더리
- [ ] 페이지 전환 애니메이션
- [ ] 성능 최적화 (RSC/Suspense 경계)

---

## 검증 방법

1.**DB**: `npx prisma studio`로 시드 데이터 확인, 모든 관계 검증

2.**관리자 플로우**: 로그인 → 학교 선택 → 지문/단어/시험/프롬프트 등록 → 학생 추적

3.**학생 플로우**: 학교 선택 → 지문 열람 → 단어 테스트 → 시험 해설 → AI 질문 → 마이페이지

4.**AI**: 문항 해설 페이지에서 질문 시 선생님 프롬프트가 반영된 응답 확인

5.**반응형**: 학생 페이지 380px 고정 확인, 관리자 페이지 PC 레이아웃 확인

6.**빌드**: `npm run build` 에러 없음 확인
