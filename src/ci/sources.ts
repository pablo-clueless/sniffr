import { readFile, readdir, stat } from "node:fs/promises";
import { extname, join } from "node:path";

import { isHar, samplesFromFixture, samplesFromHar } from "./har.js";
import type { Sample } from "./har.js";

const READABLE = new Set([".har", ".json"]);

const filesUnder = async (path: string): Promise<string[]> => {
  const info = await stat(path);
  if (!info.isDirectory()) return [path];

  const entries = await readdir(path, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const child = join(path, entry.name);
      if (entry.isDirectory()) return filesUnder(child);
      return READABLE.has(extname(entry.name).toLowerCase()) ? [child] : [];
    }),
  );
  return nested.flat();
};

export type LoadResult = {
  readonly samples: readonly Sample[];
  readonly read: readonly string[];
  readonly skipped: readonly { file: string; reason: string }[];
};

export const loadSamples = async (paths: readonly string[]): Promise<LoadResult> => {
  const samples: Sample[] = [];
  const read: string[] = [];
  const skipped: { file: string; reason: string }[] = [];

  const files = (await Promise.all(paths.map(filesUnder))).flat();
  const contents = await Promise.all(
    files.map(async (file) => ({ file, text: await readFile(file, "utf8") })),
  );

  for (const { file, text } of contents) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      skipped.push({ file, reason: "not valid JSON" });
      continue;
    }

    const found = isHar(parsed) ? samplesFromHar(parsed) : samplesFromFixture(parsed);
    if (found.length === 0) {
      skipped.push({ file, reason: isHar(parsed) ? "no JSON responses" : "no url field" });
      continue;
    }

    samples.push(...found);
    read.push(file);
  }

  return { samples, read, skipped };
};
