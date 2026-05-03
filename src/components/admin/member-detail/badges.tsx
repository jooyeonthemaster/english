// Tier / status label & class helpers shared between the member-detail page
// and (future) academy detail pages. Centralised so a future palette tweak
// touches only one file.

export function tierBadgeClass(tier: string): string {
  switch (tier) {
    case "ENTERPRISE":
      return "bg-slate-900 text-white";
    case "PREMIUM":
      return "bg-blue-600 text-white";
    case "STANDARD":
      return "bg-blue-100 text-blue-800";
    case "STARTER":
      return "bg-slate-100 text-slate-700";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

export function academyStatusClass(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "bg-emerald-50 text-emerald-700";
    case "TRIAL":
      return "bg-blue-50 text-blue-700";
    case "SUSPENDED":
      return "bg-rose-50 text-rose-700";
    case "DEACTIVATED":
      return "bg-gray-100 text-gray-500";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

export function academyStatusLabel(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "정상";
    case "TRIAL":
      return "체험";
    case "SUSPENDED":
      return "중단";
    case "DEACTIVATED":
      return "해지";
    default:
      return status;
  }
}

export function subscriptionStatusClass(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "bg-emerald-50 text-emerald-700";
    case "TRIAL":
      return "bg-blue-50 text-blue-700";
    case "PAST_DUE":
      return "bg-rose-50 text-rose-700";
    case "CANCELLED":
      return "bg-gray-100 text-gray-500";
    case "SUSPENDED":
      return "bg-slate-100 text-slate-700";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

export function subscriptionStatusLabel(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "정상";
    case "TRIAL":
      return "체험";
    case "PAST_DUE":
      return "연체";
    case "CANCELLED":
      return "취소";
    case "SUSPENDED":
      return "중단";
    default:
      return status;
  }
}
