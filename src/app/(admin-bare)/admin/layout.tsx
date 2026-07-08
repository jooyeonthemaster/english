import type { Metadata } from "next";

export const metadata: Metadata = {
  icons: {
    icon: [{ url: "/admin-favicon.png", type: "image/png", sizes: "500x500" }],
    shortcut: "/admin-favicon.png",
  },
};

export default function AdminBareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
