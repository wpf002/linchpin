import type { NextConfig } from "next";

const config: NextConfig = {
  // The shared package ships TypeScript source, not a build.
  transpilePackages: ["@linchpin/shared"],
  poweredByHeader: false,
  // Shared source uses NodeNext ".js" specifiers that point at ".ts" files.
  webpack(webpackConfig) {
    webpackConfig.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return webpackConfig;
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default config;
