// server/exporter.ts
// ExportValidationError — typed error class for all validation and
// path-security failures in the export pipeline.
//
// exportStack() is implemented in a later task (TASK-13).
// This file provides the shared error type used across the pipeline.

import { validate } from "../src/shared/validator.js";
import type { Stack } from "../src/shared/types.js";

// ---------------------------------------------------------------------------
// Error type

/**
 * Thrown by the export pipeline for every validation or security failure.
 * Callers can inspect `error.errors` for machine-readable error codes.
 */
export class ExportValidationError extends Error {
  readonly errors: string[];

  constructor(errors: string[]) {
    super(`Export validation failed: ${errors.join(", ")}`);
    this.name = "ExportValidationError";
    this.errors = errors;
    // Restore the prototype chain (needed when targeting pre-ES2015 runtimes).
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Export pipeline — stub (full implementation in TASK-13)

/**
 * Validates a stack and returns the exported HTML string.
 * Throws ExportValidationError if validation fails.
 * Full implementation pending TASK-13 (inline-assets, html-template).
 */
export async function exportStack(_stack: Stack): Promise<string> {
  const result = validate(_stack);
  if (!result.valid) {
    throw new ExportValidationError(result.errors);
  }
  throw new Error("exportStack: full implementation pending TASK-13");
}
