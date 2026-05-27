"use client";

import { usePathname } from "next/navigation";
import { BusinessInfoBlock } from "@/components/legal/business-info-block";

const APP_SHELL_PREFIXES = [
  "/director",
  "/teacher",
  "/student",
  "/parent",
  "/tutor",
];

function isHandledByAppShell(pathname: string) {
  if (pathname === "/admin/login") return false;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return true;
  return APP_SHELL_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function GlobalBusinessFooter() {
  const pathname = usePathname();

  if (isHandledByAppShell(pathname)) return null;

  return <BusinessInfoBlock compact className="bg-white" />;
}
