import {
  LayoutDashboard,
  ClipboardCheck,
  FileText,
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
  Activity,
  LifeBuoy,
  // 튜터 운영 홈·모바일 학습·배포 관리 임시 숨김으로 미사용. 복구 시 함께 주석 해제.
  // Users,
  // Smartphone,
  // Send,
  type LucideIcon,
} from "lucide-react";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import {
  ExamPaperGenerationIcon,
  MaterialExtractionIcon,
  PassageAnalysisIcon,
  QuestionGenerationIcon,
} from "@/components/icons/workflow-icons";

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
  assignments: { feature: "assignments", label: "과제 관리" },
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
        {
          // 원래 라벨 "학생 시험 리포트"는 chevron 과 폭 경쟁으로 최소 사이드바
          // 폭(180px)에서 말줄임될 수 있어 축약 라벨을 유지한다.
          // (BETA 배지는 26-07-07 사이드바 전체에서 제거 — beta 필드 인프라만 존치)
          label: "시험 리포트",
          icon: FileBarChart,
          href: `${basePath}/workbench/exam-report`,
          children: [
            { label: "리포트 생성", href: `${basePath}/workbench/exam-report` },
            { label: "리포트 관리", href: `${basePath}/workbench/exam-report/library` },
          ],
        },
      ],
    },
    {
      title: "운영",
      directorOnly: true,
      items: [
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
          ? [{ label: "학습 현황", icon: Activity, href: `${basePath}/tutor/monitor`, directorOnly: true }]
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
            { label: "사용 매뉴얼", href: `${basePath}/help/manual` },
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
        { label: "과제 관리", icon: FileText, href: `${basePath}/assignments`, comingSoon: true, feature: "assignments" },
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
