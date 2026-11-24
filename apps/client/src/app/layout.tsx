import type { Metadata, Viewport } from "next";
import {
  Anton,
  Bebas_Neue,
  Caveat,
  Cormorant_Garamond,
  IBM_Plex_Mono,
  Inter,
  Inter_Tight,
  Nunito,
  Oswald,
  Share_Tech_Mono,
  Special_Elite,
  VT323,
} from "next/font/google";
import "./globals.css";
import "./lamp.css";
import { LampRoot } from "@/components/LampRoot";

const vt323 = VT323({ weight: "400", subsets: ["latin"], variable: "--font-vt323" });
const shareTech = Share_Tech_Mono({ weight: "400", subsets: ["latin"], variable: "--font-share-tech" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
// the look (docs/plan/45-the-ui.md): titles in a book face, small labels typed
const cormorant = Cormorant_Garamond({ weight: "600", subsets: ["latin"], variable: "--font-cormorant" });
const specialElite = Special_Elite({ weight: "400", subsets: ["latin"], variable: "--font-special-elite" });
// build mode's glass look (docs/plan/124-the-build-view.md): round and friendly — fetched when build mode shows it
const nunito = Nunito({
  weight: ["600", "700", "800", "900"],
  subsets: ["latin"],
  variable: "--font-nunito",
  preload: false,
});

// the new UI's faces (docs/plan/125-the-new-ui.md, look F): GTA's tall numbers and heavy names, its plain sans,
// thin capitals and a typed mono for the quiet labels, a hand for the notes. Only the weights used.
const bebas = Bebas_Neue({ weight: "400", subsets: ["latin"], variable: "--font-bebas" });
const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton", preload: false });
const interTight = Inter_Tight({
  weight: ["500", "600", "700", "800", "900"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-inter-tight",
});
const oswald = Oswald({ weight: ["300", "400", "500"], subsets: ["latin"], variable: "--font-oswald", preload: false });
const plexMono = IBM_Plex_Mono({ weight: ["400", "500"], subsets: ["latin"], variable: "--font-plex-mono" });
const caveat = Caveat({ weight: ["500", "700"], subsets: ["latin"], variable: "--font-caveat", preload: false });

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
      className={`${vt323.variable} ${shareTech.variable} ${inter.variable} ${cormorant.variable} ${specialElite.variable} ${nunito.variable} ${bebas.variable} ${anton.variable} ${interTight.variable} ${oswald.variable} ${plexMono.variable} ${caveat.variable}`}
    >
      <body>
        <LampRoot />
        {children}
      </body>
    </html>
  );
}
