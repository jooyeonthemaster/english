import { MobileLayout } from "@/components/layout/mobile-layout";
import { QueryProvider } from "@/providers/query-provider";

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <QueryProvider>
      <MobileLayout>{children}</MobileLayout>
    </QueryProvider>
  );
}
