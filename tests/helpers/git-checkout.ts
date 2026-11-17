// tests/helpers/git-checkout.ts
// TASK-44a1: may a test run `git` against this copy of the repo?
// A ZIP download or a `git archive` copy has no `.git`, so `git grep` exits
// 128 there. A ZIP unpacked inside some other repository has no `.git` of its
// own either, and `git` would read the wrong tree. Only a copy that is its own
// git checkout (a clone, shallow or full, or a worktree) says yes.

import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";

export function gitCheckoutAt(root: string): boolean {
  // `.git` is a directory in a clone and a file in a worktree; either counts.
  if (!existsSync(path.join(root, ".git"))) return false;
  try {
    const top = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return realpathSync(top) === realpathSync(root);
  } catch {
    return false;
  }
}

/**
 * TASK-44a2: `git grep -n -E pattern` in `root`: the matching lines, or "" when
 * nothing matches (git grep exits 1). Any other exit throws, so a broken
 * repository fails the test instead of passing it.
 */
export function gitGrepHits(root: string, pattern: string): string {
  try {
    return execFileSync("git", ["grep", "-n", "-E", pattern], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch (err) {
    if ((err as { status?: number }).status === 1) return "";
    throw err;
  }
}
