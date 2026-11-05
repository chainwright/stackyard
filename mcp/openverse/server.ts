// mcp/openverse/server.ts
// A minimal local stdio MCP server exposing two Openverse tools (TASK-23 d).
// Speaks JSON-RPC 2.0 over stdin/stdout (newline-delimited), implementing the
// MCP methods Kiro needs: `initialize`, `tools/list`, `tools/call`. No SDK
// dependency — the protocol surface we need is tiny and the core logic lives in
// openverse.ts (unit-tested separately).
//
// Run by Kiro via .kiro/settings/mcp.json:
//   { "command": "node", "args": ["--import","tsx/esm","mcp/openverse/server.ts"] }

import { createInterface } from "node:readline";
import {
  searchImages,
  fetchImageAsDataUri,
  type OpenverseLicense,
} from "./openverse.js";

interface RpcRequest {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

const TOOLS = [
  {
    name: "search_images",
    description:
      "Search Openverse for CC0 or public-domain-mark images. Returns title, creator, licence, source URL and a thumbnail URL per result.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to search for." },
        license: { type: "string", enum: ["cc0", "pdm"], description: "cc0 or pdm (public domain mark)." },
        pageSize: { type: "number", description: "Max results (1–20, default 5)." },
      },
      required: ["query"],
    },
  },
  {
    name: "fetch_image_as_data_uri",
    description:
      "Fetch an Openverse/Wikimedia image and return it as a data: URI, capped at maxKB. Off-allowlist hosts and off-list redirects are refused.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Image URL on an allowed host." },
        maxKB: { type: "number", description: "Size cap in KB (default 60)." },
      },
      required: ["url"],
    },
  },
] as const;

function send(id: RpcRequest["id"], result: unknown): void {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}

function sendError(id: RpcRequest["id"], code: number, message: string): void {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n");
}

/** Wrap a tool result as MCP text content. */
function textContent(value: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] };
}

async function handleToolCall(name: string, args: Record<string, unknown>): Promise<unknown> {
  if (name === "search_images") {
    const query = String(args["query"] ?? "");
    const license = (args["license"] === "pdm" ? "pdm" : "cc0") as OpenverseLicense;
    const pageSize = typeof args["pageSize"] === "number" ? args["pageSize"] : 5;
    const results = await searchImages(query, license, pageSize);
    return textContent(results);
  }
  if (name === "fetch_image_as_data_uri") {
    const url = String(args["url"] ?? "");
    const maxKB = typeof args["maxKB"] === "number" ? args["maxKB"] : 60;
    const dataUri = await fetchImageAsDataUri(url, maxKB);
    return textContent(dataUri);
  }
  throw new Error(`Unknown tool: ${name}`);
}

async function handle(req: RpcRequest): Promise<void> {
  const { id, method, params } = req;
  switch (method) {
    case "initialize":
      send(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "openverse", version: "1.0.0" },
      });
      return;
    case "notifications/initialized":
      return; // notification, no response
    case "tools/list":
      send(id, { tools: TOOLS });
      return;
    case "tools/call": {
      const name = String(params?.["name"] ?? "");
      const args = (params?.["arguments"] ?? {}) as Record<string, unknown>;
      try {
        const result = await handleToolCall(name, args);
        send(id, result);
      } catch (err) {
        // MCP convention: tool errors come back as an isError content result
        // rather than a JSON-RPC error, so the model can read the message.
        send(id, {
          content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
          isError: true,
        });
      }
      return;
    }
    default:
      if (id !== undefined && id !== null) sendError(id, -32601, `Method not found: ${method}`);
      return;
  }
}

function main(): void {
  const rl = createInterface({ input: process.stdin });
  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (trimmed.length === 0) return;
    let req: RpcRequest;
    try {
      req = JSON.parse(trimmed) as RpcRequest;
    } catch {
      return; // ignore non-JSON lines
    }
    void handle(req);
  });
}

main();
