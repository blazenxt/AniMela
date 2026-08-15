/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // `@consumet/extensions` (anime scraper) pulls in `got-scraping` + CJS
  // extractors that webpack can't bundle — load it from node_modules at
  // runtime instead (server-side API routes only).
  serverExternalPackages: ["@consumet/extensions"],
};

export default nextConfig;
