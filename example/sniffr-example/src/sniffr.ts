import { sniffr } from "@pablo_clueless/sniffr";
import { z } from "zod";

export const API = "https://jsonplaceholder.typicode.com";

const Geo = z.object({
  // The obvious guess, and wrong: jsonplaceholder sends these as strings.
  // Leaving the mistake in is the point — this is what sniffr is for.
  lat: z.number(),
  lng: z.number(),
});

const User = z.object({
  id: z.number().int(),
  name: z.string(),
  username: z.string(),
  email: z.string(),
  phone: z.string(),
  website: z.string(),
  address: z.object({
    street: z.string(),
    suite: z.string(),
    city: z.string(),
    zipcode: z.string(),
    geo: Geo,
  }),
  company: z.object({
    name: z.string(),
    catchPhrase: z.string(),
    bs: z.string(),
  }),
});

const Post = z.object({
  userId: z.number().int(),
  id: z.number().int(),
  title: z.string(),
  body: z.string(),
});

export const schemas = {
  // sniffr keys on the path, so the jsonplaceholder host does not appear here
  "GET /users": z.array(User),
  "GET /users/:id": User,
  "GET /posts": z.array(Post),
  "POST /posts": {
    request: z.object({
      userId: z.number().int(),
      title: z.string(),
      body: z.string(),
    }),
    // the API echoes the body back alongside the id; passthrough keeps that from
    // reading as additive drift
    response: z.object({ id: z.number().int() }).passthrough(),
  },
};

export const start = () =>
  sniffr({
    schemas,
    persist: true,
    // <SniffrOverlay /> mounts the panel, so sniffr() must not mount a second one
    overlay: false,
  });
