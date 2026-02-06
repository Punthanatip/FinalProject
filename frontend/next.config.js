const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // Disabled for Leaflet compatibility
  turbopack: {
    root: path.resolve(__dirname),
  },
};

module.exports = nextConfig;