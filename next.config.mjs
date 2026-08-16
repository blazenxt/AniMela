/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // `@consumet/extensions` (anime scraper) pulls in `got-scraping` + CJS
  // extractors that webpack can't bundle — load it from node_modules at
  // runtime instead (server-side API routes only).
  serverExternalPackages: ["@consumet/extensions"],
  // Hide the Hindi Movies section from the web (dead sources — revisit later).
  // The /hindi pages + /api/v1/hindi endpoints stay in the repo, just not
  // reachable via the site.
  async redirects() {
    return [
      {
        source: "/hindi/:path*",
        destination: "/",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
