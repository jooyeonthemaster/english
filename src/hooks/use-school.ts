"use client";
import { usePathname } from "next/navigation";
import { SCHOOLS } from "@/lib/constants";

export function useSchool() {
  const pathname = usePathname();
  // URL pattern: /[schoolSlug]/...
  const segments = pathname.split("/").filter(Boolean);
  const schoolSlug = segments[0] || "";
  const school = SCHOOLS.find((s) => s.slug === schoolSlug) || null;
  return { schoolSlug, school };
}
