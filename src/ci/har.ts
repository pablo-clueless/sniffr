export type Sample = {
  readonly method: string;
  readonly url: string;
  readonly status: number;
  readonly body: unknown;
};

const isJsonMime = (mime: unknown): boolean =>
  typeof mime === "string" && /\bapplication\/(\w+\+)?json\b/i.test(mime);

const decode = (text: string, encoding: unknown): string =>
  encoding === "base64" ? Buffer.from(text, "base64").toString("utf8") : text;

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
};

export const isHar = (value: unknown): boolean => {
  if (!value || typeof value !== "object") return false;
  const log = (value as { log?: { entries?: unknown } }).log;
  return Array.isArray(log?.entries);
};

export const samplesFromHar = (value: unknown): Sample[] => {
  if (!isHar(value)) return [];
  const entries = (value as { log: { entries: unknown[] } }).log.entries;
  const samples: Sample[] = [];

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const { request, response } = entry as {
      request?: { method?: unknown; url?: unknown };
      response?: {
        status?: unknown;
        content?: { mimeType?: unknown; text?: unknown; encoding?: unknown };
      };
    };
    const content = response?.content;
    if (!isJsonMime(content?.mimeType)) continue;
    if (typeof content?.text !== "string") continue;

    const body = parseJson(decode(content.text, content.encoding));
    if (body === undefined) continue;

    samples.push({
      method: typeof request?.method === "string" ? request.method : "GET",
      url: typeof request?.url === "string" ? request.url : "/",
      status: typeof response?.status === "number" ? response.status : 200,
      body,
    });
  }

  return samples;
};

export const samplesFromFixture = (value: unknown): Sample[] => {
  if (Array.isArray(value)) return value.flatMap((item) => samplesFromFixture(item));
  if (!value || typeof value !== "object") return [];

  const fixture = value as { url?: unknown; method?: unknown; status?: unknown; body?: unknown };
  if (typeof fixture.url !== "string") return [];

  return [
    {
      method: typeof fixture.method === "string" ? fixture.method : "GET",
      url: fixture.url,
      status: typeof fixture.status === "number" ? fixture.status : 200,
      body: fixture.body,
    },
  ];
};
