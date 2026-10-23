/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Browser tests build into their own folder so they can run beside `pnpm dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

module.exports = nextConfig;
