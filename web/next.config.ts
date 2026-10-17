import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // AVIF first where the browser supports it; it is smaller than WebP for the mascot images.
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
