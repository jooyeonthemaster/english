"use client";

import { ComingSoonOverlay } from "./coming-soon-overlay";
import { COMING_SOON_FEATURE_BY_PATH } from "./nav-config";

interface MaybeComingSoonProps {
  pathname: string;
  basePath: "/director" | "/teacher";
  children: React.ReactNode;
}

export function MaybeComingSoon({ pathname, basePath, children }: MaybeComingSoonProps) {
  if (!pathname.startsWith(basePath)) return <>{children}</>;
  const tail = pathname.slice(basePath.length).replace(/^\//, "");
  if (!tail) return <>{children}</>;
  const segment = tail.split("/")[0];
  const match = COMING_SOON_FEATURE_BY_PATH[segment];
  if (!match) return <>{children}</>;

  return (
    <ComingSoonOverlay feature={match.feature} label={match.label}>
      {children}
    </ComingSoonOverlay>
  );
}
