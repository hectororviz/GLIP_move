/** @type {import('next').NextConfig} */
const buildBase = process.env.NEXT_BASE_PATH || '';
const publicBase = process.env.NEXT_PUBLIC_BASE_PATH || '';
if (buildBase !== publicBase) {
  throw new Error(`NEXT_BASE_PATH (${buildBase}) != NEXT_PUBLIC_BASE_PATH (${publicBase}): ambas deben coincidir (vacías en dev, "/move" en prod)`);
}
const basePath = buildBase || '';

const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  ...(basePath ? { basePath } : {}),
  trailingSlash: true,
};

module.exports = nextConfig;
