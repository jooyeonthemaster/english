import "@/app/g/gd.css";
import type { ReactNode } from "react";

/** dev 하네스 전용 레이아웃 — /g 디자인 시스템(gd.css)을 로드한다. */
export default function DevWorksheetStudyLayout({ children }: { children: ReactNode }) {
  return <div className="gd-app min-h-dvh">{children}</div>;
}
