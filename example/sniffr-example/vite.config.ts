import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// No mock API — the app calls jsonplaceholder.typicode.com directly, so the
// drift it reports is drift against a real service.
export default defineConfig({
  plugins: [react()],
});
