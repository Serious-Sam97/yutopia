import type { MetadataRoute } from "next";

// Installable as an app (desktop and mobile): opens straight into the lobby.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Yutopia",
    short_name: "Yutopia",
    description: "Your team's studio. Walk in.",
    start_url: "/",
    display: "standalone",
    background_color: "#17110d",
    theme_color: "#17110d",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
