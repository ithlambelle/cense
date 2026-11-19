// Created with Claude Code (2026-11-17).
//
// The page's Content Security Policy (lib/security/csp.ts) allows no eval.
// Zod tests for it with Function("") the first time it builds an object
// schema, which the browser refuses and reports as a breach. Jitless, it
// never tries; every check gives the same result. Imported first in
// src/instrumentation-client.ts, before any module that builds a schema.
import { config } from "zod";

config({ jitless: true });
