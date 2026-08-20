import { sniffr } from "@pablo_clueless/sniffr";
import { z } from "zod";

const User = z.object({
  id: z.number().int(),
  email: z.string(),
  role: z.enum(["admin", "member"]),
  nickname: z.string().optional(),
});

const CreateUser = z.object({
  email: z.string(),
  role: z.enum(["admin", "member"]),
});

export const schemas = {
  "GET /api/users": z.object({ data: z.array(User) }),
  "POST /api/users": {
    request: CreateUser,
    response: z.object({ id: z.number().int() }),
  },
};

export const start = () =>
  sniffr({
    schemas,
    persist: true,
    // <SniffrOverlay /> mounts the panel, so sniffr() must not mount a second one
    overlay: false,
  });
