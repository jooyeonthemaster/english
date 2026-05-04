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
  Megaphone,
  MessageSquare,
  Mail,
  Calendar,
  TrendingUp,
  FileBarChart,
  Settings,
  UserCog,
  Layers,
  FolderOpen,
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
}

export interface NavGroup {
  title: string;
  items: NavItem[];
  directorOnly?: boolean;
}

export function getNavGroups(basePath: "/director" | "/teacher"): NavGroup[] {
  return [
    {
      title: "",
      items: [
        { label: "대시보드", icon: LayoutDashboard, href: basePath },
      ],
    },
    {
      title: "원생 관리",
      items: [
        { label: "학생 관리", icon: Users, href: `${basePath}/students` },
        { label: "반 관리", icon: BookOpen, href: `${basePath}/classes` },
      ],
    },
    {
      title: "수업 운영",
      items: [
        { label: "출결 관리", icon: ClipboardCheck, href: `${basePath}/attendance` },
        { label: "과제 관리", icon: FileText, href: `${basePath}/assignments` },
        { label: "수업 자료", icon: FolderOpen, href: `${basePath}/materials` },
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
            { label: "지문 등록", href: `${basePath}/workbench/passages/create` },
            { label: "전체 지문", href: `${basePath}/workbench/passages` },
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
            { label: "시험 생성", href: `${basePath}/exams/create` },
          ],
        },
      ],
    },
    {
      title: "경영 관리",
      directorOnly: true,
      items: [
        { label: "수납 관리", icon: CreditCard, href: `${basePath}/billing`, directorOnly: true },
        { label: "재무 관리", icon: BarChart3, href: `${basePath}/finance`, directorOnly: true },
        { label: "급여 관리", icon: Wallet, href: `${basePath}/salaries`, directorOnly: true },
      ],
    },
    {
      title: "소통",
      items: [
        { label: "공지사항", icon: Megaphone, href: `${basePath}/notices` },
        { label: "메시지", icon: Mail, href: `${basePath}/messages` },
        { label: "상담 관리", icon: MessageSquare, href: `${basePath}/consultations` },
        { label: "일정 관리", icon: Calendar, href: `${basePath}/calendar` },
      ],
    },
    {
      title: "분석",
      items: [
        { label: "성적 분석", icon: TrendingUp, href: `${basePath}/analytics` },
        { label: "학부모 리포트", icon: FileBarChart, href: `${basePath}/reports` },
      ],
    },
    {
      title: "설정",
      directorOnly: true,
      items: [
        { label: "학원 설정", icon: Settings, href: `${basePath}/settings`, directorOnly: true },
        { label: "직원 관리", icon: UserCog, href: `${basePath}/staff`, directorOnly: true },
      ],
    },
  ];
}
