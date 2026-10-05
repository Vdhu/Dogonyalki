import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Игра в догонялки с геолокацией",
  description: "Онлайн-игра: Вода и Убегающие с таймерным раскрытием GPS-меток.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body className="bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  );
}
