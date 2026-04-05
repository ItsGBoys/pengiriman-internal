import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      // Langsung ke bundle UMD (exports pkg tidak mengizinkan subpath dist/)
      "onnxruntime-web": path.join(
        __dirname,
        "node_modules/onnxruntime-web/dist/ort.min.js"
      ),
    }
    return config
  },
  experimental: {
    serverComponentsExternalPackages: ["onnxruntime-web"],
  },
}

export default nextConfig
