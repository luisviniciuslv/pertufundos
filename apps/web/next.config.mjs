/** @type {import('next').NextConfig} */
const isLowMemoryBuild = process.env.LOW_MEMORY_BUILD === "true";

const nextConfig = {
  transpilePackages: ["@pertufundos/shared"],
  productionBrowserSourceMaps: false,
  typescript: {
    ignoreBuildErrors: isLowMemoryBuild,
  },
  eslint: {
    ignoreDuringBuilds: isLowMemoryBuild,
  },
  experimental: {
    webpackMemoryOptimizations: true,
    cpus: isLowMemoryBuild ? 1 : undefined,
    workerThreads: false,
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@base-org/account": false,
      "@coinbase/cdp-sdk": false,
    };
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      "pino-pretty": false,
    };
    if (isLowMemoryBuild) {
      config.parallelism = 1;
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
