import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Plinko Lab — Provably Fair",
  description: "A provably-fair Plinko game with commit-reveal RNG, deterministic engine, and verifiable outcomes.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
