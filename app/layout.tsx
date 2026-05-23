import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Uzbekistan Finance Terminal",
  description: "Automated Uzbekistan market dashboard for CBU rates, gold prices, policy rates, publications, and finance news."
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
