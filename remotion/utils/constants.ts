// Video configuration
export const FPS = 30;
export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;
export const TOTAL_DURATION_SECONDS = 300; // 5분 정확히

// Colors - NARA brand
export const COLORS = {
  primary: '#3B82F6',
  primaryDark: '#2563EB',
  primaryLight: '#93C5FD',
  primaryBg: '#EFF6FF',
  white: '#FFFFFF',
  bg: '#F4F6F9',
  card: '#FFFFFF',
  border: 'rgba(0,0,0,0.06)',
  textPrimary: '#111827',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  emerald: '#10B981',
  emeraldBg: '#ECFDF5',
  amber: '#F59E0B',
  amberBg: '#FFFBEB',
  rose: '#F43F5E',
  roseBg: '#FFF1F2',
  purple: '#8B5CF6',
  purpleBg: '#F5F3FF',
  cyan: '#06B6D4',
  dark: '#0F172A',
  darkCard: 'rgba(255,255,255,0.05)',
  darkBorder: 'rgba(255,255,255,0.08)',
};

export const FONT_FAMILY = '"Pretendard", -apple-system, BlinkMacSystemFont, system-ui, sans-serif';

// ─── NEW: Rapid-fire scene timings ───
// Each scene is a collection of "beats" (2-3 second micro-views)
// Total: 300 seconds = 5:00
export const SCENES = {
  intro:              { start: 0,   duration: 8 },    // 3 beats
  overview:           { start: 8,   duration: 16 },   // 5 beats
  dashboard:          { start: 24,  duration: 28 },   // 9 beats
  studentMgmt:        { start: 52,  duration: 20 },   // 7 beats
  classAttendance:    { start: 72,  duration: 22 },   // 7 beats
  aiWorkbench:        { start: 94,  duration: 48 },   // 16 beats - HERO
  examFlow:           { start: 142, duration: 26 },   // 9 beats
  questionAssignment: { start: 168, duration: 18 },   // 6 beats
  business:           { start: 186, duration: 26 },   // 9 beats
  communication:      { start: 212, duration: 18 },   // 6 beats
  studentApp:         { start: 230, duration: 35 },   // 12 beats
  parentApp:          { start: 265, duration: 25 },   // 8 beats
  techOutro:          { start: 290, duration: 10 },   // 3 beats
} as const;

export function sceneFrames(scene: { start: number; duration: number }) {
  return {
    from: scene.start * FPS,
    durationInFrames: scene.duration * FPS,
  };
}

// ─── Beat helper: each beat is ~3 seconds ───
export const BEAT = 3 * FPS; // 90 frames = 3 seconds

// ─── Mock Data (expanded) ───
export const MOCK_KPIS = {
  totalStudents: 187,
  studentDelta: '+12',
  collectionRate: 94.2,
  attendanceRate: 96.8,
  monthlyRevenue: 24500000,
  monthlyRevenueFormatted: '₩24,500,000',
  newRegistrations: 8,
  activeClasses: 12,
  totalExams: 34,
  avgScore: 82.5,
};

export const MOCK_STUDENT_TREND = [
  { month: '10월', count: 162 },
  { month: '11월', count: 168 },
  { month: '12월', count: 171 },
  { month: '1월', count: 175 },
  { month: '2월', count: 180 },
  { month: '3월', count: 187 },
];

export const MOCK_REVENUE_TREND = [
  { month: '10월', revenue: 21.2, expense: 14.8 },
  { month: '11월', revenue: 22.1, expense: 15.1 },
  { month: '12월', revenue: 22.8, expense: 15.6 },
  { month: '1월', revenue: 23.5, expense: 15.2 },
  { month: '2월', revenue: 23.9, expense: 15.8 },
  { month: '3월', revenue: 24.5, expense: 16.1 },
];

export const MOCK_STUDENTS = [
  { name: '김민서', grade: '중2', school: '강동중', status: '재원', score: 92, xp: 2450, level: 12 },
  { name: '이서준', grade: '중3', school: '명일중', status: '재원', score: 88, xp: 1890, level: 10 },
  { name: '박하은', grade: '고1', school: '명일여고', status: '재원', score: 95, xp: 3200, level: 15 },
  { name: '정우진', grade: '중2', school: '강동중', status: '재원', score: 78, xp: 1200, level: 7 },
  { name: '최예린', grade: '중1', school: '강일중', status: '재원', score: 85, xp: 1650, level: 9 },
  { name: '강지호', grade: '고2', school: '배재고', status: '재원', score: 91, xp: 2800, level: 13 },
  { name: '윤수빈', grade: '중3', school: '명일중', status: '휴원', score: 82, xp: 1450, level: 8 },
  { name: '한소율', grade: '중1', school: '강동중', status: '재원', score: 89, xp: 1780, level: 10 },
];

export const MOCK_CLASSES = [
  { name: '중등 기초반', students: 12, capacity: 15, schedule: '월/수 4:00~5:30', teacher: '박선생', fee: 280000 },
  { name: '중등 심화반', students: 10, capacity: 12, schedule: '화/목 4:00~5:30', teacher: '김선생', fee: 320000 },
  { name: '고등 내신반', students: 8, capacity: 10, schedule: '월/수 6:00~7:30', teacher: '이선생', fee: 350000 },
  { name: '고등 수능반', students: 15, capacity: 18, schedule: '화/목 6:00~8:00', teacher: '박선생', fee: 380000 },
  { name: '예비중 기초', students: 10, capacity: 12, schedule: '토 10:00~12:00', teacher: '김선생', fee: 250000 },
];

export const QUESTION_TYPES = [
  { name: '빈칸 추론', category: '객관식', color: '#3B82F6' },
  { name: '어법 판단', category: '객관식', color: '#3B82F6' },
  { name: '어휘 적절성', category: '객관식', color: '#3B82F6' },
  { name: '글의 순서', category: '객관식', color: '#3B82F6' },
  { name: '문장 삽입', category: '객관식', color: '#3B82F6' },
  { name: '주제/요지', category: '객관식', color: '#3B82F6' },
  { name: '제목 추론', category: '객관식', color: '#3B82F6' },
  { name: '지칭 추론', category: '객관식', color: '#3B82F6' },
  { name: '내용 일치', category: '객관식', color: '#3B82F6' },
  { name: '무관한 문장', category: '객관식', color: '#3B82F6' },
  { name: '조건부 영작', category: '서술형', color: '#8B5CF6' },
  { name: '문장 전환', category: '서술형', color: '#8B5CF6' },
  { name: '핵심 표현 빈칸', category: '서술형', color: '#8B5CF6' },
  { name: '요약문 완성', category: '서술형', color: '#8B5CF6' },
  { name: '배열 영작', category: '서술형', color: '#8B5CF6' },
  { name: '문법 오류 수정', category: '서술형', color: '#8B5CF6' },
  { name: '문맥 속 의미', category: '어휘', color: '#10B981' },
  { name: '동의어', category: '어휘', color: '#10B981' },
  { name: '반의어', category: '어휘', color: '#10B981' },
];

export const MOCK_INVOICES = [
  { student: '김민서', amount: 320000, status: '완납', date: '3/05' },
  { student: '이서준', amount: 280000, status: '미납', date: '3/01' },
  { student: '박하은', amount: 350000, status: '완납', date: '3/08' },
  { student: '정우진', amount: 280000, status: '연체', date: '2/25' },
  { student: '최예린', amount: 250000, status: '부분납', date: '3/02' },
];

export const MOCK_EXPENSES = [
  { category: '임대료', amount: 3500000, percent: 35 },
  { category: '인건비', amount: 4200000, percent: 42 },
  { category: '교재비', amount: 800000, percent: 8 },
  { category: '마케팅', amount: 600000, percent: 6 },
  { category: '공과금', amount: 450000, percent: 4.5 },
  { category: '시설관리', amount: 350000, percent: 3.5 },
];

export const NAV_ITEMS = [
  { icon: '📊', label: '대시보드' },
  { icon: '👥', label: '학생 관리', section: '원생 관리' },
  { icon: '📖', label: '반 관리' },
  { icon: '✅', label: '출결 관리', section: '수업 운영' },
  { icon: '📝', label: '과제 관리' },
  { icon: '✨', label: 'AI 워크벤치', section: 'AI 콘텐츠' },
  { icon: '🎓', label: '시험 관리' },
  { icon: '🗄️', label: '문제 은행' },
  { icon: '💳', label: '수납 관리', section: '경영 관리' },
  { icon: '📈', label: '재무 관리' },
  { icon: '👛', label: '급여 관리' },
  { icon: '📢', label: '공지사항', section: '소통' },
  { icon: '✉️', label: '메시지' },
  { icon: '💬', label: '상담 관리' },
  { icon: '📅', label: '일정 관리' },
];

export const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  '재원': { color: COLORS.emerald, bg: COLORS.emeraldBg },
  '휴원': { color: COLORS.amber, bg: COLORS.amberBg },
  '퇴원': { color: COLORS.rose, bg: COLORS.roseBg },
  '대기': { color: COLORS.primary, bg: COLORS.primaryBg },
  '완납': { color: COLORS.emerald, bg: COLORS.emeraldBg },
  '미납': { color: COLORS.amber, bg: COLORS.amberBg },
  '연체': { color: COLORS.rose, bg: COLORS.roseBg },
  '부분납': { color: COLORS.primary, bg: COLORS.primaryBg },
};

export const ATTENDANCE_STATUSES = [
  { label: '출석', icon: '✓', color: COLORS.emerald },
  { label: '결석', icon: '✕', color: COLORS.rose },
  { label: '지각', icon: '△', color: COLORS.amber },
  { label: '조퇴', icon: '▽', color: COLORS.amber },
  { label: '보강', icon: '◆', color: COLORS.purple },
];

export const TECH_STACK = [
  { name: 'Next.js 16', color: '#000000' },
  { name: 'React 19', color: '#61DAFB' },
  { name: 'TypeScript', color: '#3178C6' },
  { name: 'Prisma', color: '#2D3748' },
  { name: 'Supabase', color: '#3ECF8E' },
  { name: 'Gemini AI', color: '#4285F4' },
  { name: 'Tailwind CSS', color: '#06B6D4' },
  { name: 'Vercel', color: '#000000' },
];
