"use client";

import { useRouter } from "next/navigation";
import { TopBar } from "@/components/layout/top-bar";

interface TopBarBackProps {
  title: string;
  rightAction?: React.ReactNode;
  className?: string;
}

export function TopBarBack({ title, rightAction, className }: TopBarBackProps) {
  const router = useRouter();

  return (
    <TopBar
      title={title}
      showBack
      showMenu={false}
      onBack={() => router.back()}
      rightAction={rightAction}
      className={className}
    />
  );
}
