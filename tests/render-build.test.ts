// Guards the 5 Nov deploy bug: the exporter reads dist/living/living.iife.js at
// runtime, but render.yaml's buildCommand didn't build it, so every living
// export on the live service failed with ENOENT. Every bundle the server reads
// from dist/ must be either committed or built by the Render build command.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("render.yaml build command", () => {
  const yaml = readFileSync("render.yaml", "utf8");
  const build = /buildCommand:\s*(.+)/.exec(yaml)?.[1] ?? "";
  it("builds the living bundle the exporter inlines", () => {
    expect(build).toContain("npm run build:living");
  });
  it("builds the player bundle and the Maker", () => {
    expect(build).toContain("npm run build:player");
    expect(build).toContain("npm run build:maker");
  });
});
