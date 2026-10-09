import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Locked dev origins for local defense console security
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
  ],
  transpilePackages: ["three", "@react-three/fiber", "@react-three/drei"],
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value: "http://localhost:3000",
          },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET, POST, OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization",
          },
        ],
      },
    ]
  },
  async rewrites() {
    return [
      {
        source: "/api/twin/:path*",
        destination: "http://127.0.0.1:8766/api/:path*",
      },
    ];
  },
};


export default nextConfig;
