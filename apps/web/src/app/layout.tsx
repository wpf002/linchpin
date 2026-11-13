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

/** TVmaze data is CC BY-SA, which requires a visible credit link. */
const TVMAZE_URL = "https://www.tvmaze.com";
const WIKIMEDIA_URL = "https://wikimedia.org/api/rest_v1/";
/** TMDB API terms require this exact notice wherever TMDB data appears. */
const TMDB_URL = "https://www.themoviedb.org";

/** Every page reads live scores through the header gate chip; nothing is static. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Linchpin", template: "%s · Linchpin" },
  description: "Character share of each franchise, from Wikipedia page views.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        <AppHeader />
        <main className="mx-auto w-full max-w-[1280px] px-4 pb-24 sm:px-8">{children}</main>
        <footer className="mx-auto flex w-full max-w-[1280px] flex-wrap gap-x-6 gap-y-2 border-t border-line px-4 py-8 text-sm text-faint sm:px-8">
          <span>
            Cast and Images From{" "}
            <a href={TVMAZE_URL} target="_blank" rel="noreferrer noopener" className="text-muted hover:text-ink">
              TVmaze
            </a>
          </span>
          <span>
            Uses the{" "}
            <a href={TMDB_URL} target="_blank" rel="noreferrer noopener" className="text-muted hover:text-ink">
              TMDB
            </a>{" "}
            API but is not endorsed or certified by TMDB
          </span>
          <span>
            Page Views From{" "}
            <a href={WIKIMEDIA_URL} target="_blank" rel="noreferrer noopener" className="text-muted hover:text-ink">
              Wikipedia
            </a>
          </span>
        </footer>
      </body>
    </html>
  );
}
