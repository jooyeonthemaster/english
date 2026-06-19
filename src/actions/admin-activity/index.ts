// Barrel file: 관리자 활동 타임라인 서버 액션.
// 타입/라벨은 클라이언트와 공유하므로 @/lib/admin-activity-types에 있다.

export {
  getMemberActivity,
  type MemberActivityFilters,
  type MemberActivityResult,
} from "./get-member-activity";

export {
  getGlobalActivity,
  type GlobalActivityFilters,
  type GlobalActivityResult,
} from "./get-global-activity";

export {
  getAcademyActivity,
  type AcademyActivityFilters,
  type AcademyActivityResult,
} from "./get-academy-activity";

export {
  getActivityResourceDetail,
  type ResourceDetail,
  type ExtractionPageDetail,
  type QuestionBrief,
} from "./get-resource-detail";
