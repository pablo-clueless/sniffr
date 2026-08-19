import type { Capture } from "./store.js";

export const MAX_BODY_BYTES = 512 * 1024;

export type CaptureHandler = (capture: Capture) => void;

export type InterceptOptions = {
  readonly onCapture: CaptureHandler;
  readonly maxBodyBytes?: number;
};

const isJson = (contentType: string | null): boolean =>
  contentType !== null && /\bapplication\/(\w+\+)?json\b/i.test(contentType);

const tooLarge = (length: string | null, limit: number): boolean => {
  if (length === null) return false;
  const parsed = Number(length);
  return Number.isFinite(parsed) && parsed > limit;
};

const parse = (text: string, limit: number): unknown => {
  if (text.length > limit) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
};

const methodOf = (input: RequestInfo | URL, init?: RequestInit): string => {
  if (init?.method) return init.method;
  if (typeof Request !== "undefined" && input instanceof Request) return input.method;
  return "GET";
};

const urlOf = (input: RequestInfo | URL): string => {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (typeof Request !== "undefined" && input instanceof Request) return input.url;
  return String(input);
};

const interceptFetch = (options: InterceptOptions): (() => void) => {
  const limit = options.maxBodyBytes ?? MAX_BODY_BYTES;
  const original = globalThis.fetch;
  if (typeof original !== "function") return () => {};

  let active = true;

  const observe = async (response: Response, method: string, url: string): Promise<void> => {
    if (!isJson(response.headers.get("content-type"))) return;
    if (tooLarge(response.headers.get("content-length"), limit)) return;
    const body = parse(await response.clone().text(), limit);
    if (body === undefined) return;
    options.onCapture({ method, url, status: response.status, body, at: Date.now() });
  };

  globalThis.fetch = function patchedFetch(
    this: unknown,
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const pending = original.call(this as never, input, init);
    if (!active) return pending;
    return pending.then((response) => {
      try {
        void observe(response, methodOf(input, init), urlOf(input)).catch(() => {});
      } catch {
        /* observation must never break the host request */
      }
      return response;
    });
  };

  return () => {
    active = false;
    if (globalThis.fetch !== original) globalThis.fetch = original;
  };
};

type XhrRequest = { readonly method: string; readonly url: string };

const interceptXhr = (options: InterceptOptions): (() => void) => {
  const limit = options.maxBodyBytes ?? MAX_BODY_BYTES;
  if (typeof XMLHttpRequest === "undefined") return () => {};

  const requests = new WeakMap<XMLHttpRequest, XhrRequest>();
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  let active = true;

  XMLHttpRequest.prototype.open = function patchedOpen(
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ): void {
    try {
      requests.set(this, { method, url: String(url) });
    } catch {
      /* ignore */
    }
    originalOpen.call(this, method, url, async ?? true, username, password);
  };

  XMLHttpRequest.prototype.send = function patchedSend(
    this: XMLHttpRequest,
    ...args: Parameters<typeof originalSend>
  ): void {
    try {
      this.addEventListener("load", () => {
        if (!active) return;
        try {
          const request = requests.get(this);
          if (!request) return;
          if (this.responseType !== "" && this.responseType !== "text") return;
          if (!isJson(this.getResponseHeader("content-type"))) return;
          if (tooLarge(this.getResponseHeader("content-length"), limit)) return;
          const body = parse(this.responseText, limit);
          if (body === undefined) return;
          options.onCapture({
            method: request.method,
            url: request.url,
            status: this.status,
            body,
            at: Date.now(),
          });
        } catch {
          /* observation must never break the host request */
        }
      });
    } catch {
      /* ignore */
    }
    originalSend.apply(this, args);
  };

  return () => {
    active = false;
    XMLHttpRequest.prototype.open = originalOpen;
    XMLHttpRequest.prototype.send = originalSend;
  };
};

export const intercept = (options: InterceptOptions): (() => void) => {
  const teardowns = [interceptFetch(options), interceptXhr(options)];
  return () => {
    for (const teardown of teardowns) teardown();
  };
};
