import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The backend allows browser calls from http://localhost:5173 by default (CORS),
// so the dev server must keep that port. If it is busy, Vite stops instead of
// silently picking another port that the API would block.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
});
