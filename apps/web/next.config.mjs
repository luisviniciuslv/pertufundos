/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@pertufundos/shared"],
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      "pino-pretty": false,
    };
    return config;
  },
};

export default nextConfig;
