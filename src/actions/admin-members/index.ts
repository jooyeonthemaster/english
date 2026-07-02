// Barrel file: admin-members server actions are organized into subdirectory
// modules. Public exports are preserved so consumers can keep importing from
// "@/actions/admin-members".

export type {
  ProviderFilter,
  ActiveFilter,
  MemberSortKey,
  SortOrder,
  MemberListFilters,
  ActionResult,
} from "./_shared";

export { getMembers, type MemberListItem } from "./get-members";

export {
  getMemberDetail,
  type MemberDetail,
  type MemberDetailResult,
} from "./get-member-detail";

export {
  getMemberTransactions,
  type TransactionFilters,
  type TransactionListResult,
} from "./get-member-transactions";

export {
  getMemberPurchases,
  type MemberPurchaseItem,
} from "./get-member-purchases";

export { adjustMemberCredits } from "./adjust-member-credits";

export {
  adjustMembersCredits,
  type BulkAdjustItemResult,
} from "./adjust-members-credits";

export {
  setMemberCreditExpiry,
  setMembersCreditExpiry,
  wipeMemberCredits,
  wipeMembersCredits,
  type BulkCreditItemResult,
} from "./set-member-credit-expiry";

export { toggleMemberActive } from "./toggle-member-active";

export { updateMemberMemo } from "./update-member-memo";

export { moveMemberAcademy } from "./move-member-academy";

export { toggleMemberSmsOptOut } from "./toggle-sms-opt-out";

export {
  exportMembers,
  type ExportMembersResult,
} from "./export-members";
