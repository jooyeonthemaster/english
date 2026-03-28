# 학생 앱 UI 변경 이력

## v2 — 전면 리디자인 (2026-03-26)

### 반응형 디자인 시스템

모든 하드코딩 px 제거 → `clamp()` 기반 CSS 변수로 전환. 320px~768px 뷰포트 자동 대응.

**`globals.css` 변수 체계:**

| 카테고리 | 변수 | 범위 |
|----------|------|------|
| 스페이싱 | `--space-xs` ~ `--space-xl` | 4px → 48px |
| 타이포 | `--text-2xs` ~ `--text-2xl` | 9px → 32px |
| 컴포넌트 | `--header-h`, `--tab-h`, `--avatar-sm/lg`, `--icon-sm/md` | 14px → 72px |
| 터치 | `--touch-min` | 44~48px (최소 터치 타겟) |
| 카드 | `--card-radius`, `--card-radius-sm` | 8~20px |
| 학습 노드 | `--node-size`, `--session-dot` | 56~72px / 6~10px |

**컬러 토큰 (NARA 블루 기반 독자 팔레트):**

| 토큰 | 값 | 용도 |
|------|-----|------|
| `--student-primary` | #3B82F6 | CTA, 활성 탭, 링크 |
| `--student-primary-dark` | #2563EB | 호버/프레스 |
| `--student-primary-light` | #DBEAFE | 연한 배경 |
| `--student-secondary` | #6366F1 | XP, 레벨, 그라디언트 쌍 |
| `--student-accent` | #F59E0B | 스트릭, 보상 |
| `--student-success` | #10B981 | 완료, 정답 |
| `--student-wrong` | #EF4444 | 오답, 결석 |
| `--student-locked` | #E5E7EB | 잠금 노드 |
| `--student-gold` | #FBBF24 | 크라운, 배지 |
| `--student-purple` | #8B5CF6 | 특별 보상 |

---

### 듀오링고식 학습 경로 잠금

**백엔드:**
- `LessonItem` 타입에 `isLocked`, `isCompleted`, `isCurrent`, `crownLevel(0~3)` 추가
- `getLessonList()`: 이전 레슨(MIX_1 + MIX_2 + STORIES) 미완료 시 다음 레슨 잠금
- `startSession()`: 잠긴 레슨 시작 시 서버에서도 검증 → 에러 throw

**프론트엔드:**
- S-커브 노드 배치: `i % 3`으로 좌/중앙/우 교차 배치
- SVG 점선/실선 연결
- 4상태 노드: 잠금(회색 자물쇠) / 해금(파란 별) / 진행중(세션 카운트) / 완료(초록 체크+왕관)
- 잠금 노드 탭 시 Sonner 토스트: "이전 레슨을 먼저 완료하세요!"

---

### 출결 시스템

**서버 액션:**
- `getStudentAttendance(year, month)` — Prisma Attendance 모델 조회, 월별 출결 기록 + 통계
- `getStudentDashboard()` — `todayAttendance` 필드 추가 (오늘 출석 여부 + 시간)

**UI:**
- 마이페이지: 월별 출석 캘린더 (◀▶ 월 이동, 상태별 아이콘/색상, 통계 요약)
- 홈: 오늘 출석 상태 카드 ("출석 완료 (09:15)" / "아직 출석 전")
- 마이페이지 탭 확장: 3탭 → 4탭 (출석 | 분석 | 배지 | 기록)

---

### 디자인 개선 상세

| 페이지 | 주요 변경 |
|--------|-----------|
| **홈** | Hero CTA 그라디언트, 출결 카드, 주간 캘린더 도트, Stagger 애니메이션 |
| **학습** | S-커브 경로, 노드 글로우, 시즌 진행률 바 |
| **복습** | 서브탭 `--student-primary` 활성색, 컬러 토큰 적용, `active:scale` |
| **마이페이지** | 프로필 헤더 fluid, Recharts 컬러 토큰, 히트맵 셀 fluid |
| **알림** | 카테고리 컬러 바 (학습=블루, 스트릭=앰버, 시험=에메랄드, 랭킹=바이올렛) |
| **설정** | `min-h-[var(--touch-min)]` 로그아웃 버튼, fluid 카드 |

---

## 수정 파일 목록

### 인프라
| 파일 | 작업 |
|------|------|
| `src/app/globals.css` | fluid CSS 변수 + 컬러 토큰 추가 |

### 레이아웃
| 파일 | 작업 |
|------|------|
| `src/app/(student-app)/layout.tsx` | max-w-2xl, 탭 fluid, strokeWidth 분기 |
| `src/components/layout/student-header.tsx` | 전체 크기 CSS 변수화 |

### 학습 경로
| 파일 | 작업 |
|------|------|
| `src/lib/learning-types.ts` | LessonItem 4필드 추가 |
| `src/actions/learning-session.ts` | 잠금 로직 + startSession 검증 |
| `src/app/(student-app)/student/learn/page.tsx` | 시즌 헤더 + 배지 리팩터 |
| `src/app/(student-app)/student/learn/_components/lesson-path.tsx` | **신규** — S-커브 컨테이너 + SVG |
| `src/app/(student-app)/student/learn/_components/lesson-node.tsx` | **신규** — 4상태 노드 |

### 홈 + 서버 액션
| 파일 | 작업 |
|------|------|
| `src/app/(student-app)/student/page.tsx` | fluid + 출결 카드 + Stagger |
| `src/actions/student-app.ts` | getStudentAttendance(), 대시보드 출결 확장 |

### 출결
| 파일 | 작업 |
|------|------|
| `student/mypage/_components/attendance-calendar.tsx` | **신규** — 월별 캘린더 |

### 마이페이지
| 파일 | 작업 |
|------|------|
| `student/mypage/page.tsx` | 탭 4개 확장 |
| `mypage/_components/profile-header.tsx` | fluid + 컬러 토큰 |
| `mypage/_components/stats-summary.tsx` | fluid + Recharts 컬러 토큰 |
| `mypage/_components/study-heatmap.tsx` | fluid 셀 크기 |
| `mypage/_components/badge-grid.tsx` | fluid 카드/텍스트 |
| `mypage/_components/study-history.tsx` | fluid + 컬러 토큰 |

### 기타
| 파일 | 작업 |
|------|------|
| `student/review/page.tsx` | fluid + 컬러 토큰 + active:scale |
| `student/notifications/page.tsx` | fluid + 카테고리 컬러 바 |
| `student/mypage/settings/page.tsx` | fluid + touch-min |

---

## 검증 결과

- `tsc --noEmit` — 에러 0개
- Playwright 3 뷰포트 (360×640 / 430×932 / 768×1024) × 5페이지 = 15/15 통과
