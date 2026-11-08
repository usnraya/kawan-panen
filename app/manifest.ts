import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kawan Panen",
    short_name: "Kawan Panen",
    description: "Pasokan segar yang terkoordinasi untuk kebutuhan usaha.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7faf7",
    theme_color: "#064e3b",
    lang: "id-ID",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
