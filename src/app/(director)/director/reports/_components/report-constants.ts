import {
  Clock,
  Send,
  Eye,
} from "lucide-react";

export const TYPE_LABELS: Record<string, string> = {
  WEEKLY: "주간",
  MONTHLY: "월간",
  CUSTOM: "특별",
};

export const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: React.ElementType }
> = {
  DRAFT: { label: "초안", color: "bg-gray-100 text-gray-600", icon: Clock },
  SENT: { label: "발송됨", color: "bg-blue-100 text-blue-700", icon: Send },
  VIEWED: {
    label: "열람",
    color: "bg-emerald-100 text-emerald-700",
    icon: Eye,
  },
};
