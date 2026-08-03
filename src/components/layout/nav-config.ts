import {
  LayoutDashboard,
  ClipboardCheck,
  CreditCard,
  BarChart3,
  Wallet,
  Coins,
  Gift,
  Megaphone,
  MessageSquare,
  Mail,
  Calendar,
  TrendingUp,
  FileBarChart,
  Settings,
  Palette,
  BookOpenText,
  Activity,
  LifeBuoy,
  Users,
  // 모바일 학습·배포 관리 임시 숨김으로 미사용. 복구 시 함께 주석 해제.
  // (Users 는 26-07-09 "학생 관리" 부활로 다시 활성 사용 중)
  // Smartphone,
  // Send,
  type LucideIcon,
} from "lucide-react";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import {
  ExamPaperGenerationIcon,
  GrammarStudioIcon,
  MaterialExtractionIcon,
  PassageAnalysisIcon,
  QuestionGenerationIcon,
} from "@/components/icons/workflow-icons";
// 노출 라벨 단일 소스(D6) — 학생 관리 children 은 (manage) 셸 스위처와
// 문자 일치(MANAGE_VIEW_LABELS 공용), 어법 훈련소는 D5-1 3분법 STUDIO.
import {
  GRAMMAR_STUDIO_NAV_LABELS,
  GRAMMAR_SURFACE_NAMES,
  MANAGE_VIEW_LABELS,
} from "@/lib/wording/director-glossary";

export interface NavChild {
  label: string;
  href: string;
  /** 베타 기능 — 사이드바에 BETA 배지를 노출한다. */
  beta?: boolean;
}

export interface NavItem {
  label: string;
  icon: LucideIcon;
  href: string;
  directorOnly?: boolean;
  children?: NavChild[];
  comingSoon?: boolean;
  feature?: string;
  /** 베타 기능 — 사이드바에 BETA 배지를 노출한다. */
  beta?: boolean;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
  directorOnly?: boolean;
  comingSoon?: boolean;
}

export const COMING_SOON_FEATURE_BY_PATH: Record<string, { feature: string; label: string }> = {
  attendance: { feature: "attendance", label: "출결 관리" },
  // assignments 엔트리는 26-07-21 v3 D4-1 로 삭제 — 실기능 「과제 달력」
  // (/students/assignments)과의 이중 노출 해소. maybe-coming-soon.tsx 는 이
  // 맵의 첫 세그먼트 조회 소비라 엔트리 삭제만으로 오버레이도 함께 소멸하며,
  // /students/assignments 는 세그먼트가 "students"라 애초 충돌 없음(무접촉).
  billing: { feature: "billing", label: "수납 관리" },
  finance: { feature: "finance", label: "재무 관리" },
  salaries: { feature: "salaries", label: "급여 관리" },
  messages: { feature: "messages", label: "메시지" },
  consultations: { feature: "consultations", label: "상담 관리" },
  calendar: { feature: "calendar", label: "일정 관리" },
  analytics: { feature: "analytics", label: "성적 분석" },
  reports: { feature: "reports", label: "학부모 리포트" },
};

/**
 * 워크스페이스 축 — 국어(/director/korean/**)와 영어(기존 전체)는 사이드바를
 * 완전 상호 격리한다(유저 확정): 영어 사이드바에 국어 그룹이 없고, 국어
 * 워크스페이스 안에서는 국어 메뉴만 보인다. 국어 진입은 URL 경로 전용.
 */
export type NavWorkspace = "default" | "korean";

/**
 * 국어 워크스페이스 전용 사이드바 — 영어(getNavGroups) 출제 파이프라인 구조를 1:1
 * 미러하되 모든 href 를 /korean/* 로 돌려 완전 독립시킨다(유저 확정: 좌측 탭 구조는
 * 영어와 완전 동일, 데이터/라우트는 완전 분리). 영어 요소 0 · "국어 워크스페이스" 허브
 * 제거(진입은 URL /director/korean 전용, 첫 탭=문제 생성). 운영/고객센터/설정 등
 * 과목무관 전역 그룹은 국어 워크스페이스에 포함하지 않는다.
 */
function getKoreanNavGroups(basePath: "/director" | "/teacher"): NavGroup[] {
  return [
    {
      title: "국어 출제 파이프라인",
      items: [
        {
          label: "문제 생성",
          icon: QuestionGenerationIcon,
          href: `${basePath}/korean/generate`,
          children: [
            { label: "문제 생성", href: `${basePath}/korean/generate` },
            { label: "문제 관리", href: `${basePath}/korean/questions` },
            { label: "휴지통", href: `${basePath}/korean/questions/trash` },
          ],
        },
        {
          label: "시험지 생성",
          icon: ExamPaperGenerationIcon,
          href: `${basePath}/korean/exams/create`,
          children: [
            { label: "시험지 생성", href: `${basePath}/korean/exams/create` },
            { label: "시험지 관리", href: `${basePath}/korean/exams` },
          ],
        },
        {
          label: "학습지 생성",
          icon: PassageAnalysisIcon,
          href: `${basePath}/korean/passages/create`,
          children: [
            { label: "학습지 생성", href: `${basePath}/korean/passages/create` },
            { label: "학습지 관리", href: `${basePath}/korean/passages` },
          ],
        },
        {
          label: "자료 추출",
          icon: MaterialExtractionIcon,
          href: `${basePath}/korean/extraction`,
          children: [
            { label: "자료 추출", href: `${basePath}/korean/extraction` },
            { label: "자료 관리", href: `${basePath}/korean/extraction/jobs` },
          ],
        },
      ],
    },
    {
      title: "기출 자료",
      items: [
        {
          label: "기출 지문",
          icon: BookOpenText,
          href: `${basePath}/korean/passage-library`,
          children: [
            { label: "기출 지문", href: `${basePath}/korean/passage-library` },
            {
              label: "수능완성 지문 분석",
              href: `${basePath}/korean/suneung-wanseong`,
            },
          ],
        },
      ],
    },
    {
      title: "AI 콘텐츠",
      items: [
        {
          label: "지문 기반 웹툰",
          icon: Palette,
          href: `${basePath}/korean/webtoon`,
          children: [
            { label: "웹툰 생성", href: `${basePath}/korean/webtoon` },
            { label: "웹툰 관리", href: `${basePath}/korean/webtoon/library` },
          ],
        },
      ],
    },
  ];
}

export function getNavGroups(
  basePath: "/director" | "/teacher",
  workspace: NavWorkspace = "default",
): NavGroup[] {
  if (workspace === "korean") return getKoreanNavGroups(basePath);
  const showResults = FEATURE_FLAGS.SHOW_USER_RESULTS;
  const showSimilarExamGeneration = FEATURE_FLAGS.SHOW_SIMILAR_EXAM_GENERATION;
  // 원장 대시보드는 제거됐다(문제 생성 페이지가 사실상의 홈). 교사(/teacher)는
  // 기존 대시보드를 그대로 쓰므로 교사일 때만 대시보드 메뉴를 노출한다.
  const isTeacher = basePath === "/teacher";

  return [
    ...(isTeacher
      ? [
          {
            title: "",
            items: [
              { label: "대시보드", icon: LayoutDashboard, href: basePath },
            ],
          },
        ]
      : []),
    {
      title: "출제 파이프라인",
      items: [
        {
          label: "문제 생성",
          icon: QuestionGenerationIcon,
          href: `${basePath}/workbench/questions/generate`,
          children: [
            { label: "문제 생성", href: `${basePath}/workbench/questions/generate` },
            { label: "문제 관리", href: `${basePath}/workbench/questions` },
            { label: "휴지통", href: `${basePath}/workbench/questions/trash` },
            // 동형 문제 생성·커스텀 유형 — 페이지는 살아있으나 좌측 메뉴에서만 임시 숨김.
            // 복구: 아래 두 항목 주석 해제.
            // { label: "동형 문제 생성", href: `${basePath}/workbench/questions/similar`, beta: true },
            // { label: "커스텀 유형", href: `${basePath}/workbench/questions/custom`, beta: true },
          ],
        },
        {
          label: "시험지 생성",
          icon: ExamPaperGenerationIcon,
          href: `${basePath}/workbench/exams/create`,
          children: [
            { label: "시험지 생성", href: `${basePath}/workbench/exams/create` },
            { label: "시험지 관리", href: `${basePath}/workbench/exams` },
            ...(showSimilarExamGeneration
              ? [
                  {
                    label: "동형 시험지 생성",
                    href: `${basePath}/workbench/similar-exams`,
                  },
                ]
              : []),
          ],
        },
        {
          label: "학습지 생성",
          icon: PassageAnalysisIcon,
          href: `${basePath}/workbench/passages/create`,
          children: [
            { label: "학습지 생성", href: `${basePath}/workbench/passages/create` },
            { label: "학습지 관리", href: `${basePath}/workbench/passages` },
          ],
        },
        // 26-07-21 v3 D5-1: 어법 훈련소 — 합성지문 AI 생성 허브(제작 축).
        // 「학습지 생성」 직후 5번째 NavItem(nav-ia 확정 자리).
        // ENABLE_GRAMMAR_STUDIO(기본 false) 다크런칭 — off 시 nav 미노출
        // (라우트도 /director redirect, D-1). children 「생성 기록」은
        // D-2(생성 뷰) 랜딩 전이라 실경로 부재 — 「유닛 둘러보기」 1개만
        // 배선(라벨 GRAMMAR_STUDIO_NAV_LABELS.HISTORY 선등재, 후속 D-2).
        ...(FEATURE_FLAGS.ENABLE_GRAMMAR_STUDIO
          ? [
              {
                label: GRAMMAR_SURFACE_NAMES.STUDIO,
                icon: GrammarStudioIcon,
                href: `${basePath}/workbench/grammar-studio`,
                children: [
                  {
                    label: GRAMMAR_STUDIO_NAV_LABELS.BROWSE_UNITS,
                    href: `${basePath}/workbench/grammar-studio`,
                  },
                ],
              },
            ]
          : []),
        {
          label: "자료 추출",
          icon: MaterialExtractionIcon,
          href: `${basePath}/workbench/extraction`,
          children: [
            { label: "자료 추출", href: `${basePath}/workbench/extraction` },
            { label: "자료 관리", href: `${basePath}/workbench/extraction/jobs` },
          ],
        },
      ],
    },
    // 국어 출제 그룹은 영어(기본) 사이드바에서 완전히 제외한다 — 국어 진입은
    // URL 경로(/director/korean) 전용이며, 국어 라우트 안에서는 위의
    // getKoreanNavGroups 가 국어 메뉴만 노출한다(워크스페이스 상호 격리).
    {
      title: "AI 콘텐츠",
      items: [
        // 지문 변형(/workbench/passage-variant) — 페이지는 살아있으나 UI 개편 전까지
        // 좌측 메뉴에서만 임시 숨김. 복구: 아래 항목 주석 해제 + Shuffle 아이콘 import.
        // {
        //   label: "지문 변형",
        //   icon: Shuffle,
        //   href: `${basePath}/workbench/passage-variant`,
        // },
        {
          label: "지문 기반 웹툰",
          icon: Palette,
          href: `${basePath}/workbench/webtoon`,
          children: [
            { label: "웹툰 생성", href: `${basePath}/workbench/webtoon` },
            { label: "웹툰 관리", href: `${basePath}/workbench/webtoon/library` },
          ],
        },
        // "시험 리포트"(exam-report) 항목은 26-07-11 IA 재편으로 운영 그룹
        // "학생 관리" 하위(내신 시험 분석·내신 리포트 관리)로 이동 — 웹툰만 남는다.
      ],
    },
    {
      title: "운영",
      directorOnly: true,
      items: [
        // 26-07-11 IA 재편(설계 §5): "학생 관리"가 학생 데이터 전 표면(로스터·
        // 과제·어법 훈련·내신 시험 분석·리포트)의 상위 계층이 된다. 구 단독
        // "어법 훈련소" 항목과 AI 콘텐츠의 "시험 리포트" 항목은 이 아래로 흡수.
        // ENABLE_EXAM_DEPLOYMENT(기본 true) 게이트 — SHOW_USER_RESULTS 와 무관.
        ...(FEATURE_FLAGS.ENABLE_EXAM_DEPLOYMENT
          ? [
              {
                label: "학생 관리",
                icon: Users,
                href: `${basePath}/students`,
                directorOnly: true,
                beta: true,
                children: [
                  // 26-07-21 v3 D4-1: (manage) 4뷰 children — 라벨은 셸 뷰
                  // 스위처(students-manage-shell)와 MANAGE_VIEW_LABELS 로
                  // 문자 일치(단일 소스 import — 리터럴 재표기 금지).
                  { label: MANAGE_VIEW_LABELS.roster, href: `${basePath}/students` },
                  { label: MANAGE_VIEW_LABELS.classes, href: `${basePath}/students/classes` },
                  // 구 「과제 관리」 개칭(과제 달력) — URL 불변(딥링크 3곳 무접촉).
                  { label: MANAGE_VIEW_LABELS.assignments, href: `${basePath}/students/assignments` },
                  // 구 「어법 훈련」(/grammar-lab) 개칭·이관 — grammar-lab 은
                  // redirect 잔존(C-2 확인). 드릴 플래그 게이트는 기존 유지.
                  ...(FEATURE_FLAGS.ENABLE_GRAMMAR_DRILL
                    ? [{ label: MANAGE_VIEW_LABELS.grammar, href: `${basePath}/students/grammar` }]
                    : []),
                  // 단어 훈련 — 어법과 동일 관용구(플래그 3중 일치: nav children ·
                  // 페이지 게이트 · (manage) 셸 스위처).
                  ...(FEATURE_FLAGS.ENABLE_VOCAB_DRILL
                    ? [{ label: MANAGE_VIEW_LABELS.vocab, href: `${basePath}/students/vocab` }]
                    : []),
                  // exam-report 라우트 자체는 이동하지 않음(revalidatePath 리스크)
                  // — nav 계층·라벨만 재편(구 "리포트 생성" → "내신 시험 분석").
                  { label: "내신 시험 분석", href: `${basePath}/workbench/exam-report` },
                  { label: "내신 리포트 관리", href: `${basePath}/workbench/exam-report/library` },
                ],
              },
            ]
          : []),
        { label: "크레딧 관리", icon: Coins, href: `${basePath}/credits`, directorOnly: true },
        { label: "리워드", icon: Gift, href: `${basePath}/rewards`, directorOnly: true },
        // 튜터 운영 홈·모바일 학습·배포 관리 — 페이지는 살아있으나 좌측 메뉴에서만 임시 숨김.
        // 복구: 아래 세 항목(튜터 운영 홈 / 모바일 학습 / 배포 관리) 주석 해제.
        // { label: "튜터 운영 홈", icon: Users, href: `${basePath}/tutor`, directorOnly: true, beta: true },
        // {
        //   label: "모바일 학습",
        //   icon: Smartphone,
        //   href: `${basePath}/tutor/programs`,
        //   beta: true,
        //   children: [
        //     { label: "프로그램 관리", href: `${basePath}/tutor/programs` },
        //     ...(showResults
        //       ? [{ label: "수강 현황", href: `${basePath}/tutor/monitor` }]
        //       : []),
        //   ],
        // },
        // { label: "배포 관리", icon: Send, href: `${basePath}/tutor/distributions`, directorOnly: true, beta: true },
        ...(showResults
          ? [{ label: "실시간 모니터", icon: Activity, href: `${basePath}/tutor/monitor`, directorOnly: true }]
          : []),
        { label: "스모트 소식", icon: Megaphone, href: `${basePath}/notices` },
      ],
    },
    {
      // 1:1 세미나 신청 · 피드백 게시판 · 고객 지원을 겸하는 헬프센터.
      // 빈 title → 섹션 헤더 없이 접이식 상위 항목 하나만 노출된다.
      title: "",
      directorOnly: true,
      items: [
        {
          label: "고객 센터",
          icon: LifeBuoy,
          href: `${basePath}/help/seminar`,
          directorOnly: true,
          children: [
            { label: "1:1 세미나 신청", href: `${basePath}/help/seminar` },
            { label: "단체 세미나 신청", href: `${basePath}/help/group-seminar` },
            { label: "피드백 게시판", href: `${basePath}/help/feedback` },
            { label: "문의 게시판", href: `${basePath}/help/support` },
            { label: "사용 매뉴얼", href: `${basePath}/help/manual`, beta: true },
          ],
        },
      ],
    },
    {
      title: "설정",
      directorOnly: true,
      items: [
        { label: "설정", icon: Settings, href: `${basePath}/settings`, directorOnly: true },
      ],
    },
    {
      title: "Coming Soon",
      comingSoon: true,
      items: [
        { label: "출결 관리", icon: ClipboardCheck, href: `${basePath}/attendance`, comingSoon: true, feature: "attendance" },
        // 「과제 관리」(/assignments) 스텁은 26-07-21 v3 D4-1 로 삭제 —
        // 실기능 「과제 달력」(/students/assignments)과의 이중 노출 해소.
        { label: "수납 관리", icon: CreditCard, href: `${basePath}/billing`, comingSoon: true, feature: "billing", directorOnly: true },
        { label: "재무 관리", icon: BarChart3, href: `${basePath}/finance`, comingSoon: true, feature: "finance", directorOnly: true },
        { label: "급여 관리", icon: Wallet, href: `${basePath}/salaries`, comingSoon: true, feature: "salaries", directorOnly: true },
        { label: "메시지", icon: Mail, href: `${basePath}/messages`, comingSoon: true, feature: "messages" },
        { label: "상담 관리", icon: MessageSquare, href: `${basePath}/consultations`, comingSoon: true, feature: "consultations" },
        { label: "일정 관리", icon: Calendar, href: `${basePath}/calendar`, comingSoon: true, feature: "calendar" },
        ...(showResults
          ? [
              { label: "성적 분석", icon: TrendingUp, href: `${basePath}/analytics`, comingSoon: true, feature: "analytics" },
              { label: "학부모 리포트", icon: FileBarChart, href: `${basePath}/reports`, comingSoon: true, feature: "reports" },
            ]
          : []),
      ],
    },
  ];
}
