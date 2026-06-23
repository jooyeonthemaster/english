export const STAFF_PROFILE_UPDATED_EVENT = "nara:staff-profile-updated";

export interface StaffProfileUpdatedDetail {
  id?: string;
  name?: string;
  email?: string;
  academyName?: string;
  displayTitle?: string;
}
