import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-icons": ["lucide-react"],
          "vendor-socket": ["socket.io-client"],
          "vendor-math": ["mathjs"],
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
    },
    proxy: {
      // Microservicio de Exams (Puerto 3001) - DEBE IR PRIMERO
      "/api/exams": {
        target: "http://localhost:3001",
        changeOrigin: true,
        secure: false,
        configure: (proxy, options) => {
          proxy.on("proxyReq", (proxyReq, req, res) => {
            console.log("📤 [PROXY EXAMS] Request:", req.method, req.url);
          });
          proxy.on("proxyRes", (proxyRes, req, res) => {
            console.log("✅ [PROXY EXAMS] Response:", proxyRes.statusCode);
            const cookies = proxyRes.headers["set-cookie"];
            if (cookies) {
              console.log("🍪 Cookies recibidas del backend EXAMS:", cookies);
            }
          });
          proxy.on("error", (err, req, res) => {
            console.error("❌ [PROXY EXAMS] Error:", err.message);
          });
        },
      },
      // Microservicio de Users (Puerto 3000)
      "/api/users": {
        target: "http://localhost:3000",
        changeOrigin: true,
        secure: false,
        configure: (proxy, options) => {
          proxy.on("proxyReq", (proxyReq, req, res) => {
            console.log("📤 [PROXY USERS] Request:", req.method, req.url);
          });
          proxy.on("proxyRes", (proxyRes, req, res) => {
            console.log("✅ [PROXY USERS] Response:", proxyRes.statusCode);
            const cookies = proxyRes.headers["set-cookie"];
            if (cookies) {
              console.log("🍪 Cookies recibidas del backend USERS:", cookies);
            }
          });
          proxy.on("error", (err, req, res) => {
            console.error("❌ [PROXY USERS] Error:", err.message);
          });
        },
      },

      // Microservicio de Users (Puerto 3000)
      "/api/exam": {
        target: "http://localhost:3002",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});