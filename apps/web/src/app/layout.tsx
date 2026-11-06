import type { Metadata } from "next";
import { Archivo, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import { AppHeader } from "@/components/app-header";
import "./globals.css";

const display = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument-serif",
});
const sans = Archivo({ subsets: ["latin"], variable: "--font-archivo" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono" });

/** Every page reads live scores through the header gate chip; nothing is static. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Linchpin", template: "%s · Linchpin" },
  description: "Which characters hold a franchise's audience, and what happens when one leaves.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        <AppHeader />
        <main className="mx-auto w-full max-w-[1280px] px-4 pb-24 sm:px-8">{children}</main>
      </body>
    </html>
  );
}
