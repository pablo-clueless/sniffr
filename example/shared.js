import { z } from "zod";

export const ENDPOINT = "./api/users.json";

// the route sniffr will normalise the fetch above into
export const schemas = {
  "GET /example/api/users.json": z.object({
    data: z.array(
      z.object({
        id: z.number().int(),
        email: z.string(),
        role: z.enum(["admin", "member"]),
        nickname: z.string().optional(),
      }),
    ),
  }),
};

export const page = (title, note) => {
  document.title = title;
  const style = document.createElement("style");
  style.textContent = `
    body { margin: 0; padding: 40px; font: 14px/1.6 ui-sans-serif, system-ui, sans-serif;
           background: #f6f7f9; color: #1f2328; }
    @media (prefers-color-scheme: dark) { body { background: #12151a; color: #e6edf3; } }
    main { max-width: 640px; }
    button { font: inherit; padding: 6px 12px; border-radius: 6px; cursor: pointer; }
    code { background: rgba(127,127,127,0.18); padding: 2px 5px; border-radius: 4px; }
  `;
  document.head.append(style);
  return note;
};
