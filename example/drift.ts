import { z } from "zod";

import type { Change } from "../src/core/diff.js";
import { fromZod } from "../src/core/from-zod.js";
import { UNKNOWN } from "../src/core/shape.js";
import { infer } from "../src/core/infer.js";
import { merge } from "../src/core/merge.js";
import { diff } from "../src/core/diff.js";

const UserList = z.object({
  data: z.array(
    z.object({
      id: z.number().int(),
      email: z.string(),
      role: z.enum(["admin", "member"]),
      nickname: z.string().optional(),
    }),
  ),
});

const clean = [
  {
    data: [
      { id: 1, email: "ada@example.com", role: "admin" },
      { id: 2, email: "grace@example.com", role: "member" },
    ],
  },
];

const drifted = [
  {
    data: [
      { id: 1, email: "ada@example.com", role: "admin", avatarUrl: "https://cdn/1.png" },
      { id: 2, email: null, role: "owner", avatarUrl: "https://cdn/2.png" },
    ],
  },
];

const model = (samples: readonly unknown[]) =>
  samples.reduce<ReturnType<typeof infer>>((acc, sample) => merge(acc, infer(sample)), UNKNOWN);

const expected = fromZod(UserList);

const report = (changes: readonly Change[]): void => {
  const pathWidth = Math.max(...changes.map((c) => c.path.length));
  const expectedWidth = Math.max(...changes.map((c) => c.expected.length));
  for (const change of changes) {
    const severity = change.severity.toUpperCase().padEnd(8);
    console.log(
      `[${severity}] ${change.path.padEnd(pathWidth + 2)}${change.expected.padEnd(expectedWidth + 1)}-> ${change.observed}`,
    );
  }
};

report(diff(expected, model(drifted)));
console.log(`clean run: ${diff(expected, model(clean)).length} changes`);
