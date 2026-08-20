import { z } from "zod";

export const schemas = {
  "GET /api/health": z.object({ ok: z.boolean() }),
};
