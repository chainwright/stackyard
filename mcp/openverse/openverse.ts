// mcp/openverse/openverse.ts
// Core logic for the Openverse MCP server (TASK-23 d). Kept separate from the
// stdio wiring (server.ts) so it is unit-testable with an injected fetch.
//
// Two capabilities:
//   - searchImages(query, license): query the Openverse public API for CC0 or
//     public-domain-mark images and return a compact result list.
//   - fetchImageAsDataUri(url, maxKB): fetch an image and return a `data:` URI,
//     refusing any host not on the Openverse/Wikimedia allowlist, refusing a
//     redirect that would leave the allowlist, capping the size, and enforcing
//     a timeout.
//
// Security posture: the exported Stackyard file must be self-contained and
// offline, and we must never be tricked into fetching an arbitrary URL. So the
// fetch side is allowlisted by HOST, follows redirects MANUALLY and re-checks
// the host of every hop, caps bytes while streaming, and times out.

// ---------------------------------------------------------------------------
// Allowlist

/** Hosts we will fetch image bytes from. Exact host or any subdomain. */
export const ALLOWED_IMAGE_HOSTS: readonly string[] = [
  "openverse.org",
  "api.openverse.org",
  "upload.wikimedia.org",
  "commons.wikimedia.org",
];

/** True when `host` is an allowed host or a subdomain of one. */
export function isAllowedHost(host: string): boolean {
  const h = host.toLowerCase();
  return ALLOWED_IMAGE_HOSTS.some((allowed) => h === allowed || h.endsWith("." + allowed));
}

/** Parse a URL and return its host, or null if it isn't a valid https URL. */
function httpsHost(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  return u.hostname;
}

// ---------------------------------------------------------------------------
// Types

export type OpenverseLicense = "cc0" | "pdm";

export interface ImageResult {
  title: string;
  creator: string;
  license: string;
  /** The page the image came from (for the credit line). */
  source: string;
  /** A small thumbnail URL. */
  thumbnail: string;
  /** The full image URL (used by fetch_image_as_data_uri). */
  url: string;
}

export interface SearchDeps {
  fetch?: typeof fetch;
  /** Base URL of the Openverse API (override in tests). */
  apiBase?: string;
}

const OPENVERSE_API = "https://api.openverse.org/v1/images/";

// ---------------------------------------------------------------------------
// search_images

/**
 * Search Openverse for CC0 / public-domain-mark images. Returns up to
 * `pageSize` compact results. Network errors / non-2xx throw with a plain
 * message (never a key — there is no key).
 */
export async function searchImages(
  query: string,
  license: OpenverseLicense = "cc0",
  pageSize = 5,
  deps: SearchDeps = {},
): Promise<ImageResult[]> {
  const doFetch = deps.fetch ?? fetch;
  const base = deps.apiBase ?? OPENVERSE_API;
  if (query.trim().length === 0) {
    throw new Error("search_images: query must not be empty.");
  }
  if (license !== "cc0" && license !== "pdm") {
    throw new Error('search_images: license must be "cc0" or "pdm".');
  }

  const u = new URL(base);
  u.searchParams.set("q", query.trim());
  u.searchParams.set("license", license);
  u.searchParams.set("page_size", String(Math.max(1, Math.min(pageSize, 20))));

  const res = await doFetch(u.toString(), {
    headers: { Accept: "application/json", "User-Agent": "Stackyard/openverse-mcp" },
  });
  if (!res.ok) {
    throw new Error(`search_images: Openverse returned HTTP ${res.status}.`);
  }
  const data = (await res.json()) as { results?: unknown };
  const results = Array.isArray(data.results) ? data.results : [];

  return results.slice(0, pageSize).map((r): ImageResult => {
    const o = (r ?? {}) as Record<string, unknown>;
    const str = (v: unknown): string => (typeof v === "string" ? v : "");
    return {
      title: str(o["title"]) || "Untitled",
      creator: str(o["creator"]) || "Unknown",
      license: (str(o["license"]) || license).toLowerCase(),
      source: str(o["foreign_landing_url"]) || str(o["url"]),
      thumbnail: str(o["thumbnail"]),
      url: str(o["url"]),
    };
  });
}

// ---------------------------------------------------------------------------
// fetch_image_as_data_uri

export interface FetchImageDeps {
  fetch?: typeof fetch;
  /** Timeout in ms (default 10s). */
  timeoutMs?: number;
}

/** A redirect status that carries a Location to follow. */
function redirectLocation(res: Response): string | null {
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get("location");
    return loc ?? null;
  }
  return null;
}

/**
 * Fetch an image from an ALLOWED host and return it as a `data:` URI, capped at
 * `maxKB` kilobytes. Redirects are followed MANUALLY (up to 5 hops) and every
 * hop's host is re-checked against the allowlist — a redirect off the allowlist
 * is refused. A timeout aborts the request.
 *
 * @throws Error (plain message) on a disallowed host, an off-list redirect, an
 *   over-cap body, a non-2xx response, a non-image content type, or a timeout.
 */
export async function fetchImageAsDataUri(
  url: string,
  maxKB = 60,
  deps: FetchImageDeps = {},
): Promise<string> {
  const doFetch = deps.fetch ?? fetch;
  const timeoutMs = deps.timeoutMs ?? 10_000;
  const maxBytes = Math.max(1, Math.floor(maxKB * 1024));

  let current = url;
  for (let hop = 0; hop <= 5; hop++) {
    const host = httpsHost(current);
    if (host === null) {
      throw new Error("fetch_image_as_data_uri: only https URLs are allowed.");
    }
    if (!isAllowedHost(host)) {
      throw new Error(`fetch_image_as_data_uri: host "${host}" is not on the Openverse/Wikimedia allowlist.`);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await doFetch(current, {
        redirect: "manual", // we re-check every hop's host ourselves
        signal: controller.signal,
        headers: { "User-Agent": "Stackyard/openverse-mcp" },
      });
    } catch (err) {
      clearTimeout(timer);
      if ((err as { name?: string }).name === "AbortError") {
        throw new Error("fetch_image_as_data_uri: the image took too long to fetch (timed out).");
      }
      throw new Error("fetch_image_as_data_uri: could not fetch the image.");
    }
    clearTimeout(timer);

    const location = redirectLocation(res);
    if (location !== null) {
      // Resolve the redirect target and loop so its host is re-checked.
      current = new URL(location, current).toString();
      continue;
    }

    if (!res.ok) {
      throw new Error(`fetch_image_as_data_uri: image host returned HTTP ${res.status}.`);
    }

    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.startsWith("image/")) {
      throw new Error(`fetch_image_as_data_uri: expected an image, got "${contentType || "unknown"}".`);
    }

    // A declared Content-Length over the cap is refused before reading.
    const declared = Number(res.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new Error(`fetch_image_as_data_uri: image is ${Math.round(declared / 1024)} KB, over the ${maxKB} KB cap.`);
    }

    const bytes = await readCapped(res, maxBytes, maxKB);
    const mime = contentType.split(";")[0]!.trim();
    const b64 = Buffer.from(bytes).toString("base64");
    return `data:${mime};base64,${b64}`;
  }

  throw new Error("fetch_image_as_data_uri: too many redirects.");
}

/**
 * Read a response body, aborting as soon as the running byte count passes the
 * cap. Works with a web ReadableStream (preferred) or arrayBuffer fallback.
 */
async function readCapped(res: Response, maxBytes: number, maxKB: number): Promise<Uint8Array> {
  const body = res.body;
  if (body && typeof body.getReader === "function") {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel().catch(() => {});
          throw new Error(`fetch_image_as_data_uri: image exceeds the ${maxKB} KB cap.`);
        }
        chunks.push(value);
      }
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.byteLength;
    }
    return out;
  }
  // Fallback: no stream — read fully, then enforce the cap.
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > maxBytes) {
    throw new Error(`fetch_image_as_data_uri: image exceeds the ${maxKB} KB cap.`);
  }
  return buf;
}
