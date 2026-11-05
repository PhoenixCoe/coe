// STATIC_EXPORT=1 (set by `npm run build:static`) turns the site into plain HTML files for GitHub Pages.
const isStatic = process.env.STATIC_EXPORT === '1';

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  poweredByHeader: false,
  ...(isStatic ? { output: 'export', trailingSlash: true, images: { unoptimized: true } } : {}),
};
