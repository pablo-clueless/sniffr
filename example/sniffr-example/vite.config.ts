import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const json = (res: import("node:http").ServerResponse, status: number, body: unknown) => {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
};

const CLEAN = {
  data: [
    { id: 1, email: "ada@example.com", role: "admin" },
    { id: 2, email: "grace@example.com", role: "member" },
  ],
};

// same endpoint, later deploy: email went nullable, a new role appeared, and an
// undeclared field showed up
const DRIFTED = {
  data: [
    { id: 1, email: "ada@example.com", role: "admin", avatarUrl: "https://cdn/1.png" },
    { id: 2, email: null, role: "owner", avatarUrl: "https://cdn/2.png" },
  ],
};

const mockApi = (): Plugin => ({
  name: "mock-api",
  configureServer(server) {
    server.middlewares.use("/api/users", (req, res) => {
      if (req.method === "POST") {
        json(res, 201, { id: 3 });
        return;
      }
      json(res, 200, req.url?.includes("drift=1") ? DRIFTED : CLEAN);
    });
  },
});

export default defineConfig({
  plugins: [react(), mockApi()],
});
