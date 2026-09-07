import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow 127.0.0.1 and localhost as dev origins so HMR and WS connections
  // are not blocked when the browser opens the app on 127.0.0.1:3000
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "10.17.116.58",
  ],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value: "*",
          },
        ],
      },
    ]
  },
};

export default nextConfig;
