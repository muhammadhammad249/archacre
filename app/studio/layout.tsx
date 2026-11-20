import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./studio.css";

export const metadata: Metadata = {
  title: { default: "ARCH ACRE Studio", template: "%s · ARCH ACRE Studio" },
  robots: { index: false, follow: false, noarchive: true },
  icons: { icon: "/assets/favicon.svg" },
};

export default function StudioLayout({ children }: { children: ReactNode }) {
  return <div className="studio-app">{children}</div>;
}
