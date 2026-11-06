// mcp/openverse/openverse.test.ts
// TASK-23 d: the Openverse MCP server's own tests. The network is injected, so
// nothing real is fetched. We prove the security properties the task requires:
// host allowlist, off-list redirect refusal, size cap, and timeout.

import { describe, it, expect, vi } from "vitest";
import {
  isAllowedHost,
  searchImages,
  fetchImageAsDataUri,
  ALLOWED_IMAGE_HOSTS,
  MAX_IMAGE_KB,
  DEFAULT_IMAGE_KB,
  clampMaxKB,
} from "./openverse.js";

// ---------------------------------------------------------------------------
// Small fetch stubs

/** A Response-like object good enough for the code paths under test. */
function imgResponse(bytes: Uint8Array, contentType = "image/png", headers: Record<string, string> = {}): Response {
  const h = new Headers({ "content-type": contentType, ...headers });
  return {
    ok: true,
    status: 200,
    headers: h,
    body: streamOf(bytes),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    json: async () => ({}),
  } as unknown as Response;
}

function redirectResponse(location: string): Response {
  return {
    ok: false,
    status: 302,
    headers: new Headers({ location }),
    body: null,
    arrayBuffer: async () => new ArrayBuffer(0),
    json: async () => ({}),
  } as unknown as Response;
}

/** A web ReadableStream that yields `bytes` in one chunk. */
function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

// ---------------------------------------------------------------------------
// Allowlist

describe("host allowlist", () => {
  it("allows the Openverse and Wikimedia hosts and their subdomains", () => {
    for (const h of ALLOWED_IMAGE_HOSTS) expect(isAllowedHost(h)).toBe(true);
    expect(isAllowedHost("upload.wikimedia.org")).toBe(true);
    expect(isAllowedHost("cdn.openverse.org")).toBe(true); // subdomain
  });

  it("refuses everything else", () => {
    expect(isAllowedHost("evil.example.com")).toBe(false);
    expect(isAllowedHost("openverse.org.evil.com")).toBe(false);
    expect(isAllowedHost("notwikimedia.org")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// fetch_image_as_data_uri — the security properties

describe("fetchImageAsDataUri", () => {
  it("fetches an allowed-host image and returns a data: URI", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const fetchStub = vi.fn(async () => imgResponse(bytes, "image/png"));
    const uri = await fetchImageAsDataUri(
      "https://upload.wikimedia.org/x.png",
      60,
      { fetch: fetchStub as unknown as typeof fetch },
    );
    expect(uri.startsWith("data:image/png;base64,")).toBe(true);
    expect(uri).toContain(Buffer.from(bytes).toString("base64"));
  });

  it("refuses a host that is not on the allowlist (no fetch made)", async () => {
    const fetchStub = vi.fn(async () => imgResponse(new Uint8Array([0])));
    await expect(
      fetchImageAsDataUri("https://evil.example.com/x.png", 60, { fetch: fetchStub as unknown as typeof fetch }),
    ).rejects.toThrow(/not on the Openverse\/Wikimedia allowlist/);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("refuses a non-https URL", async () => {
    await expect(
      fetchImageAsDataUri("http://upload.wikimedia.org/x.png", 60, { fetch: (async () => imgResponse(new Uint8Array([0]))) as unknown as typeof fetch }),
    ).rejects.toThrow(/only https/);
  });

  it("refuses a redirect that leaves the allowlist", async () => {
    // First hop: allowed host → 302 to an off-list host. The second hop's host
    // is re-checked and refused.
    const fetchStub = vi.fn(async (url: string) => {
      if (url.includes("upload.wikimedia.org")) return redirectResponse("https://evil.example.com/x.png");
      return imgResponse(new Uint8Array([9]));
    });
    await expect(
      fetchImageAsDataUri("https://upload.wikimedia.org/start.png", 60, { fetch: fetchStub as unknown as typeof fetch }),
    ).rejects.toThrow(/not on the Openverse\/Wikimedia allowlist/);
  });

  it("follows a redirect that STAYS on the allowlist", async () => {
    const bytes = new Uint8Array([5, 6, 7]);
    const fetchStub = vi.fn(async (url: string) => {
      if (url.endsWith("/start.png")) return redirectResponse("https://upload.wikimedia.org/final.png");
      return imgResponse(bytes, "image/jpeg");
    });
    const uri = await fetchImageAsDataUri(
      "https://commons.wikimedia.org/start.png",
      60,
      { fetch: fetchStub as unknown as typeof fetch },
    );
    expect(uri.startsWith("data:image/jpeg;base64,")).toBe(true);
  });

  it("refuses a body whose declared Content-Length is over the cap", async () => {
    const fetchStub = vi.fn(async () =>
      imgResponse(new Uint8Array([0]), "image/png", { "content-length": String(200 * 1024) }),
    );
    await expect(
      fetchImageAsDataUri("https://upload.wikimedia.org/big.png", 60, { fetch: fetchStub as unknown as typeof fetch }),
    ).rejects.toThrow(/over the 60 KB cap/);
  });

  it("enforces the size cap while streaming (no declared length)", async () => {
    const big = new Uint8Array(70 * 1024); // 70 KB, cap is 60
    const fetchStub = vi.fn(async () => imgResponse(big, "image/png"));
    await expect(
      fetchImageAsDataUri("https://upload.wikimedia.org/stream.png", 60, { fetch: fetchStub as unknown as typeof fetch }),
    ).rejects.toThrow(/exceeds the 60 KB cap/);
  });

  it("refuses a non-image content type", async () => {
    const fetchStub = vi.fn(async () => imgResponse(new Uint8Array([0]), "text/html"));
    await expect(
      fetchImageAsDataUri("https://upload.wikimedia.org/page.html", 60, { fetch: fetchStub as unknown as typeof fetch }),
    ).rejects.toThrow(/expected an image/);
  });

  it("times out when the fetch aborts", async () => {
    // A fetch that rejects with an AbortError once the signal fires.
    const fetchStub = vi.fn((_url: string, init?: { signal?: AbortSignal }) => {
      return new Promise<Response>((_resolve, reject) => {
        const sig = init?.signal;
        if (sig) sig.addEventListener("abort", () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          reject(e);
        });
      });
    });
    await expect(
      fetchImageAsDataUri("https://upload.wikimedia.org/slow.png", 60, {
        fetch: fetchStub as unknown as typeof fetch,
        timeoutMs: 20,
      }),
    ).rejects.toThrow(/timed out/);
  });
});

// ---------------------------------------------------------------------------
// search_images

describe("searchImages", () => {
  it("maps Openverse results to compact credit-ready records", async () => {
    const fetchStub = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        results: [
          {
            title: "Viking longship",
            creator: "A. Photographer",
            license: "cc0",
            foreign_landing_url: "https://openverse.org/image/abc",
            thumbnail: "https://api.openverse.org/v1/images/abc/thumb/",
            url: "https://upload.wikimedia.org/longship.jpg",
          },
        ],
      }),
    }) as unknown as Response);

    const results = await searchImages("viking longship", "cc0", 5, {
      fetch: fetchStub as unknown as typeof fetch,
    });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      title: "Viking longship",
      creator: "A. Photographer",
      license: "cc0",
      source: "https://openverse.org/image/abc",
      url: "https://upload.wikimedia.org/longship.jpg",
    });
  });

  it("rejects an empty query and a bad licence", async () => {
    const noFetch = vi.fn();
    await expect(searchImages("  ", "cc0", 5, { fetch: noFetch as unknown as typeof fetch })).rejects.toThrow(/must not be empty/);
    // @ts-expect-error — deliberately pass an invalid licence
    await expect(searchImages("x", "mit", 5, { fetch: noFetch as unknown as typeof fetch })).rejects.toThrow(/cc0.*pdm/);
    expect(noFetch).not.toHaveBeenCalled();
  });

  it("throws a plain message on a non-2xx API response", async () => {
    const fetchStub = vi.fn(async () => ({ ok: false, status: 503, headers: new Headers(), json: async () => ({}) }) as unknown as Response);
    await expect(searchImages("x", "cc0", 5, { fetch: fetchStub as unknown as typeof fetch })).rejects.toThrow(/HTTP 503/);
  });
});


// ---------------------------------------------------------------------------
// TASK-26h — a sane maximum for the size cap, and a read timeout on the body

describe("TASK-26h: maxKB is clamped and the body read has a deadline", () => {
  it("clampMaxKB keeps the cap in 1..512 and defaults a non-number", () => {
    expect(MAX_IMAGE_KB).toBe(512);
    expect(clampMaxKB(1e9)).toBe(512);
    expect(clampMaxKB(0)).toBe(1);
    expect(clampMaxKB(-5)).toBe(1);
    expect(clampMaxKB(40)).toBe(40);
    expect(clampMaxKB(Number.NaN)).toBe(DEFAULT_IMAGE_KB);
    expect(clampMaxKB(Number.POSITIVE_INFINITY)).toBe(DEFAULT_IMAGE_KB);
  });

  it("an agent asking for maxKB 1e9 still gets the 512 KB cap enforced", async () => {
    const big = new Uint8Array(600 * 1024); // 600 KB > the 512 KB ceiling
    const fetchStub = vi.fn(async () => imgResponse(big, "image/png"));
    await expect(
      fetchImageAsDataUri("https://upload.wikimedia.org/big.png", 1e9, { fetch: fetchStub as unknown as typeof fetch }),
    ).rejects.toThrow(/512 KB/);
  });

  it("a body that sends headers and then never finishes times out", async () => {
    // Headers arrive at once; the body yields one byte and then stalls forever.
    let cancelled = false;
    const stalled = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1]));
        // never close, never enqueue again
      },
      cancel() {
        cancelled = true;
      },
    });
    const res = {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "image/png" }),
      body: stalled,
      arrayBuffer: async () => new ArrayBuffer(0),
      json: async () => ({}),
    } as unknown as Response;
    const fetchStub = vi.fn(async () => res);
    await expect(
      fetchImageAsDataUri("https://upload.wikimedia.org/slow.png", 60, {
        fetch: fetchStub as unknown as typeof fetch,
        timeoutMs: 60,
      }),
    ).rejects.toThrow(/timed out/);
    // The stalled connection is released, not left parked.
    await new Promise((r) => setTimeout(r, 20));
    expect(cancelled).toBe(true);
  });
});
