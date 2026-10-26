import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Inter, Share_Tech_Mono, Special_Elite, VT323 } from "next/font/google";
import "./globals.css";

const vt323 = VT323({ weight: "400", subsets: ["latin"], variable: "--font-vt323" });
const shareTech = Share_Tech_Mono({ weight: "400", subsets: ["latin"], variable: "--font-share-tech" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
// the look (docs/plan/45-the-ui.md): titles in a book face, small labels typed
const cormorant = Cormorant_Garamond({ weight: "600", subsets: ["latin"], variable: "--font-cormorant" });
const specialElite = Special_Elite({ weight: "400", subsets: ["latin"], variable: "--font-special-elite" });

export const metadata: Metadata = {
  title: "Yutopia",
  description: "Your team's studio. Walk in.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#111216",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${vt323.variable} ${shareTech.variable} ${inter.variable} ${cormorant.variable} ${specialElite.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
