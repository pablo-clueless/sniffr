const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPAQUE = /^[A-Za-z0-9._~-]{21,}$/;
const HEX = /^[0-9a-fA-F]{8,}$/;
const NUMERIC = /^\d+$/;

export const PARAM = ":id";

const isParam = (segment: string): boolean =>
  NUMERIC.test(segment) || UUID.test(segment) || HEX.test(segment) || OPAQUE.test(segment);

export const pathOf = (url: string): string => {
  try {
    return new URL(url, "http://sniffr.invalid").pathname;
  } catch {
    const cut = url.search(/[?#]/);
    return cut === -1 ? url : url.slice(0, cut);
  }
};

const segmentsOf = (path: string): string[] => path.split("/").filter((s) => s.length > 0);

const matchPattern = (segments: readonly string[], pattern: string): string | null => {
  const patternSegments = segmentsOf(pattern);
  if (patternSegments.length !== segments.length) return null;
  const matched = patternSegments.every((p, i) => p.startsWith(":") || p === segments[i]);
  return matched ? `/${patternSegments.join("/")}` : null;
};

export const normalizeRoute = (url: string, routes: readonly string[] = []): string => {
  const segments = segmentsOf(pathOf(url));

  for (const pattern of routes) {
    const matched = matchPattern(segments, pattern);
    if (matched) return matched;
  }

  if (segments.length === 0) return "/";
  return `/${segments.map((s) => (isParam(s) ? PARAM : s)).join("/")}`;
};

export const endpointKey = (method: string, route: string): string =>
  `${method.toUpperCase()} ${route}`;
