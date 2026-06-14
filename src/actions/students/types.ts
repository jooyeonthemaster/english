// ---------------------------------------------------------------------------
// Shared types for students server actions
// ---------------------------------------------------------------------------

export interface StudentFilters {
  status?: string;
  schoolId?: string;
  /** Class id, or the virtual key "__unassigned__" for students in no class. */
  classId?: string;
  grade?: number;
  search?: string;
  /** "unpaid" → only students with an outstanding (PENDING/PARTIAL/OVERDUE) invoice. */
  billing?: string;
  page?: number;
  pageSize?: number;
}

export interface ActionResult {
  success: boolean;
  error?: string;
}

export interface StudentDeviceItem {
  id: string;
  deviceFingerprint: string;
  userAgent: string;
  ip: string;
  issuedAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
}

export interface CreateStudentData {
  name: string;
  birthDate?: string;
  gender?: string;
  phone?: string;
  schoolId?: string;
  grade: number;
  memo?: string;
  parentName?: string;
  parentPhone?: string;
  parentRelation?: string;
  emergencyContact?: string;
}
