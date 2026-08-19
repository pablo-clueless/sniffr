import { describe, expect, it } from "vitest";
import { z } from "zod";

import { fromZod } from "../src/core/from-zod.js";
import type { Shape } from "../src/core/shape.js";
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

const model = (samples: readonly unknown[]): Shape =>
  samples.reduce<Shape>((acc, sample) => merge(acc, infer(sample)), UNKNOWN);

const expected = fromZod(UserList);

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

describe("the worked drift scenario (HANDOFF 3, gate b)", () => {
  it("classifies exactly the four documented changes, in order", () => {
    expect(
      diff(expected, model(drifted)).map((change) => [
        change.severity,
        change.path,
        change.expected,
        change.observed,
      ]),
    ).toEqual([
      ["breaking", "$.data[].email", "string", "string | null"],
      ["breaking", "$.data[].role", '"admin" | "member"', '"admin" | "owner"'],
      ["info", "$.data[].nickname", "string", "absent"],
      ["additive", "$.data[].avatarUrl", "absent", "string"],
    ]);
  });

  it("reports one info change on the clean run, and nothing louder", () => {
    const changes = diff(expected, model(clean));
    expect(changes).toHaveLength(1);
    expect(changes[0]!.code).toBe("field.unobserved");
    expect(changes.every((change) => change.severity === "info")).toBe(true);
  });
});

describe("the literal trap is what keeps the clean run clean (HANDOFF 6)", () => {
  it("would report the enum as breaking if infer widened literals on sight", () => {
    const widened = { data: [{ id: 1, email: "ada@example.com", role: "admin" }] };
    const roleShape = infer(widened.data[0]!.role);

    expect(roleShape.kind).toBe("literal");
    expect(diff(expected, model(clean)).some((change) => change.severity === "breaking")).toBe(
      false,
    );
  });

  it("still catches a value genuinely outside the enum", () => {
    const changes = diff(expected, model(drifted));
    const role = changes.find((change) => change.path === "$.data[].role");
    expect(role?.code).toBe("enum.value.added");
  });
});
