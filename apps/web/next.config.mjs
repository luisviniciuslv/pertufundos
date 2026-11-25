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
    webpackBuildWorker: false,
    parallelServerCompiles: false,
    parallelServerBuildTraces: false,
    cpus: isLowMemoryBuild ? 1 : undefined,
    workerThreads: false,
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@base-org/account": false,
      "@coinbase/cdp-sdk": false,
      "@coinbase/wallet-sdk": false,
      "@gemini-wallet/core": false,
      "@metamask/sdk": false,
      "@react-native-async-storage/async-storage": false,
      "@safe-global/safe-apps-sdk": false,
      porto: false,
      "porto/internal": false,
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
