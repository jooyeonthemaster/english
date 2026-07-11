import { ManualSidebarFocus } from "@/components/manual/manual-sidebar-focus";

export default function ManualLayout({ children }: { children: React.ReactNode }) {
  return <ManualSidebarFocus>{children}</ManualSidebarFocus>;
}
