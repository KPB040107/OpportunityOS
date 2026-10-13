import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Optional local build mode for environments that restrict child processes.
  // Type checking and page generation still run in Next.js workers.
  experimental: {
    workerThreads: process.env.OPPORTUNITYOS_BUILD_THREADS === "1",
    useTypeScriptCli: process.env.OPPORTUNITYOS_BUILD_THREADS !== "1",
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
