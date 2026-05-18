// ---------------------------------------------------------------------------
// Shared types for students server actions
// ---------------------------------------------------------------------------

export interface StudentFilters {
  status?: string;
  schoolId?: string;
  grade?: number;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface ActionResult {
  success: boolean;
  error?: string;
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
