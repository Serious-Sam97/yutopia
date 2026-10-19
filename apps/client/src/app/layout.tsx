import type { Metadata, Viewport } from "next";
import { Inter, Share_Tech_Mono, VT323 } from "next/font/google";
import "./globals.css";

const vt323 = VT323({ weight: "400", subsets: ["latin"], variable: "--font-vt323" });
const shareTech = Share_Tech_Mono({ weight: "400", subsets: ["latin"], variable: "--font-share-tech" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Yutopia",
  description: "Your team's studio. Walk in.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#17110d",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${vt323.variable} ${shareTech.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
