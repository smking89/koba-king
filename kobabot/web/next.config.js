/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // This app is nested inside the kobabot repo, which has its own
  // package-lock.json at the repo root - without this, Turbopack guesses
  // that outer lockfile is the workspace root and warns on every build.
  turbopack: { root: __dirname },
};

module.exports = nextConfig;
