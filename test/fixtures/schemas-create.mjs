import { z } from "zod";

export const schemas = {
  "POST /api/users": {
    request: z.object({ email: z.string(), role: z.enum(["admin", "member"]) }),
    response: z.object({ id: z.number().int(), email: z.string() }),
  },
};
