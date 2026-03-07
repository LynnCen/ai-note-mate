import type { Metadata } from "next";
import { Providers } from "@/components/Providers";
import { FirestoreNotesSync } from "@/components/FirestoreNotesSync";
import "./globals.css";
import { cn } from "@/lib/utils";

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
    <html lang="zh-CN" className={cn("font-sans")} suppressHydrationWarning>
      <body className="antialiased font-sans">
        <Providers>
          <FirestoreNotesSync />
          {children}
        </Providers>
      </body>
    </html>
  );
}
