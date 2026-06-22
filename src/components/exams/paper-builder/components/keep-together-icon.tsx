import type { SVGProps } from "react";

export function KeepTogetherIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M3.5 4.5h12v12h-12z" />
      <path d="M7.5 8h13v11.5h-13z" />
      <path d="m9.5 10 5.5 5.5" />
      <path d="m15 10-5.5 5.5" />
    </svg>
  );
}
