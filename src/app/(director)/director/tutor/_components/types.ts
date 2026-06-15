// Shared prop types for the 튜터 운영 홈 (tutor operations hub).

export interface HubClass {
  id: string;
  name: string;
  teacherId: string | null;
  teacherName: string | null;
  capacity: number;
  fee: number;
  room: string | null;
  isActive: boolean;
  enrolledCount: number;
  schedule: { day: string; startTime: string; endTime: string }[];
}

export interface HubSchool {
  id: string;
  name: string;
  type: string;
}

export interface HubInvoice {
  id: string;
  title: string;
  finalAmount: number;
  status: string;
  dueDate: string | Date;
  payments: { amount: number }[];
}

export interface HubParentLink {
  parent: {
    id: string;
    name: string;
    phone: string;
    relation: string | null;
    emergencyContact: string | null;
  };
}

export interface HubStudent {
  id: string;
  name: string;
  studentCode: string;
  grade: number;
  status: string;
  phone: string | null;
  avatarUrl: string | null;
  schoolId: string | null;
  birthDate: Date | string | null;
  gender: string | null;
  memo: string | null;
  school: { id: string; name: string; type: string } | null;
  classEnrollments: { class: { id: string; name: string } }[];
  parentLinks: HubParentLink[];
  invoices: HubInvoice[];
  _count: { tutorStudentSessions: number };
}

export interface StudentsResult {
  students: HubStudent[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface HubStats {
  totalStudents: number;
  activeStudents: number;
  unassignedCount: number;
  unpaidCount: number;
  pausedWaitingCount: number;
  onboarding: {
    hasStudents: boolean;
    hasAssignment: boolean;
    hasLoggedIn: boolean;
    unassignedCount: number;
  };
}

export interface HubFilters {
  page: number;
  status: string;
  schoolId?: string;
  classId?: string;
  grade?: number;
  search?: string;
  billing?: string;
}

/** Virtual classId for "students in no class". */
export const UNASSIGNED_CLASS_ID = "__unassigned__";

/**
 * Max devices per student code (UI mirror of TUTOR_DEVICE_LIMIT in
 * auth-tutor-student.ts — kept here so client components never import that
 * server-only module).
 */
export const DEVICE_LIMIT = 2;

export type UpdateParams = (updates: Record<string, string | undefined>) => void;
