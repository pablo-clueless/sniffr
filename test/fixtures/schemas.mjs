import { z } from "zod";

export const schemas = {
  "GET /api/users": z.object({
    data: z.array(
      z.object({
        id: z.number().int(),
        email: z.string(),
        role: z.enum(["admin", "member"]),
        nickname: z.string().optional(),
      }),
    ),
  }),
  "GET /api/health": z.object({ ok: z.boolean() }),
};
