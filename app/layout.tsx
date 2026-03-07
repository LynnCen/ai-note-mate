import type { Metadata } from "next";
import { FirestoreNotesSync } from "@/components/FirestoreNotesSync";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "AI 笔记",
  description: "AI 笔记应用",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={cn("font-sans", geist.variable)}>
      <body className="antialiased font-sans">
        <FirestoreNotesSync />
        {children}
      </body>
    </html>
  );
}
