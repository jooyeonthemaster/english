import {
  LayoutDashboard,
  Users,
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
  Smartphone,
  Send,
  Activity,
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

export function getNavGroups(basePath: "/director" | "/teacher"): NavGroup[] {
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
            { label: "동형 문제 생성", href: `${basePath}/workbench/questions/similar`, beta: true },
            { label: "커스텀 유형", href: `${basePath}/workbench/questions/custom`, beta: true },
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
                    beta: true,
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
      ],
    },
    {
      title: "운영",
      directorOnly: true,
      items: [
        { label: "크레딧 관리", icon: Coins, href: `${basePath}/credits`, directorOnly: true },
        { label: "리워드", icon: Gift, href: `${basePath}/rewards`, directorOnly: true },
        { label: "튜터 운영 홈", icon: Users, href: `${basePath}/tutor`, directorOnly: true, beta: true },
        {
          label: "모바일 학습",
          icon: Smartphone,
          href: `${basePath}/tutor/programs`,
          beta: true,
          children: [
            { label: "프로그램 관리", href: `${basePath}/tutor/programs` },
            ...(showResults
              ? [{ label: "수강 현황", href: `${basePath}/tutor/monitor` }]
              : []),
          ],
        },
        { label: "배포 관리", icon: Send, href: `${basePath}/tutor/distributions`, directorOnly: true, beta: true },
        ...(showResults
          ? [{ label: "학습 현황", icon: Activity, href: `${basePath}/tutor/monitor`, directorOnly: true, beta: true }]
          : []),
        { label: "공지사항", icon: Megaphone, href: `${basePath}/notices`, beta: true },
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
