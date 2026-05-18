// ============================================================================
// Shared types for reports server actions
// ============================================================================

export interface ReportListItem {
  id: string;
  studentName: string;
  studentId: string;
  parentName: string | null;
  type: string;
  status: string;
  createdAt: string;
  sentAt: string | null;
  viewedAt: string | null;
}

export interface ReportFilters {
  type?: string;
  status?: string;
  search?: string;
}
