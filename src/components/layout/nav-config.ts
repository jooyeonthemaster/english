import {
  LayoutDashboard,
  Users,
  BookOpen,
  ClipboardCheck,
  FileText,
  GraduationCap,
  CreditCard,
  BarChart3,
  Wallet,
  Coins,
  Megaphone,
  MessageSquare,
  Mail,
  Calendar,
  TrendingUp,
  FileBarChart,
  Settings,
  Layers,
  type LucideIcon,
} from "lucide-react";

export interface NavChild {
  label: string;
  href: string;
}

export interface NavItem {
  label: string;
  icon: LucideIcon;
  href: string;
  directorOnly?: boolean;
  children?: NavChild[];
  comingSoon?: boolean;
  feature?: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
  directorOnly?: boolean;
  comingSoon?: boolean;
}

export const COMING_SOON_FEATURE_BY_PATH: Record<string, { feature: string; label: string }> = {
  students: { feature: "students", label: "학생 관리" },
  classes: { feature: "classes", label: "반 관리" },
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
  return [
    {
      title: "",
      items: [
        { label: "대시보드", icon: LayoutDashboard, href: basePath },
      ],
    },
    {
      title: "AI 콘텐츠",
      items: [
        {
          label: "지문 관리",
          icon: FileText,
          href: `${basePath}/workbench/passages`,
          children: [
            { label: "지문 & 문제 추출", href: `${basePath}/workbench/passages/import` },
            { label: "지문 등록", href: `${basePath}/workbench/passages/create` },
            { label: "지문 은행", href: `${basePath}/workbench/passages` },
          ],
        },
        {
          label: "문제 관리",
          icon: Layers,
          href: `${basePath}/workbench/generate`,
          children: [
            { label: "문제 생성", href: `${basePath}/workbench/generate` },
            { label: "학습 문제 생성", href: `${basePath}/workbench/generate-learning` },
            { label: "문제 은행", href: `${basePath}/questions` },
            { label: "학습 문제 은행", href: `${basePath}/learning-questions` },
          ],
        },
        {
          label: "시험 관리",
          icon: GraduationCap,
          href: `${basePath}/exams`,
          children: [
            { label: "시험 목록", href: `${basePath}/exams` },
          ],
        },
      ],
    },
    {
      title: "운영",
      directorOnly: true,
      items: [
        { label: "크레딧 관리", icon: Coins, href: `${basePath}/credits`, directorOnly: true },
        { label: "공지사항", icon: Megaphone, href: `${basePath}/notices` },
      ],
    },
    {
      title: "설정",
      directorOnly: true,
      items: [
        { label: "학원 설정", icon: Settings, href: `${basePath}/settings`, directorOnly: true },
      ],
    },
    {
      title: "Coming Soon",
      comingSoon: true,
      items: [
        { label: "학생 관리", icon: Users, href: `${basePath}/students`, comingSoon: true, feature: "students" },
        { label: "반 관리", icon: BookOpen, href: `${basePath}/classes`, comingSoon: true, feature: "classes" },
        { label: "출결 관리", icon: ClipboardCheck, href: `${basePath}/attendance`, comingSoon: true, feature: "attendance" },
        { label: "과제 관리", icon: FileText, href: `${basePath}/assignments`, comingSoon: true, feature: "assignments" },
        { label: "수납 관리", icon: CreditCard, href: `${basePath}/billing`, comingSoon: true, feature: "billing", directorOnly: true },
        { label: "재무 관리", icon: BarChart3, href: `${basePath}/finance`, comingSoon: true, feature: "finance", directorOnly: true },
        { label: "급여 관리", icon: Wallet, href: `${basePath}/salaries`, comingSoon: true, feature: "salaries", directorOnly: true },
        { label: "메시지", icon: Mail, href: `${basePath}/messages`, comingSoon: true, feature: "messages" },
        { label: "상담 관리", icon: MessageSquare, href: `${basePath}/consultations`, comingSoon: true, feature: "consultations" },
        { label: "일정 관리", icon: Calendar, href: `${basePath}/calendar`, comingSoon: true, feature: "calendar" },
        { label: "성적 분석", icon: TrendingUp, href: `${basePath}/analytics`, comingSoon: true, feature: "analytics" },
        { label: "학부모 리포트", icon: FileBarChart, href: `${basePath}/reports`, comingSoon: true, feature: "reports" },
      ],
    },
  ];
}
