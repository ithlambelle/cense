// Created with Claude Code (2026-11-19). The first sign-in flag
// (profiles.welcomed_at) as /start reads it, and the database test of its
// migration kept in step with the migration file.
import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { Student } from "@/lib/api/auth";

// "server-only" refuses to load outside a server build; this test is the server.
vi.mock("server-only", () => ({}));

import { needsWelcome } from "./first-login";

type Answer = { data: { welcomed_at: string | null } | null; error: { code: string; message: string } | null };

function studentWith(answer: Answer): Student {
  const query = { select: () => query, eq: () => query, maybeSingle: async () => answer };
  return { studentId: "student-1", email: null, supabase: { from: () => query } } as unknown as Student;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("needsWelcome", () => {
  it("is true for a new student, whose profile has no welcome yet", async () => {
    expect(await needsWelcome(studentWith({ data: { welcomed_at: null }, error: null }))).toBe(true);
  });

  it("is false once the student tapped Let's go, and for every student who existed before", async () => {
    expect(await needsWelcome(studentWith({ data: { welcomed_at: "2026-11-19T15:00:00.000Z" }, error: null }))).toBe(false);
  });

  it("is false with no profile, so nothing is written for a row that is not there", async () => {
    expect(await needsWelcome(studentWith({ data: null, error: null }))).toBe(false);
  });

  it("is false when the read fails (the column not there yet), so sign-in is never stopped", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await needsWelcome(studentWith({ data: null, error: { code: "42703", message: "column does not exist" } }))).toBe(false);
    expect(warn).toHaveBeenCalledWith(JSON.stringify({ event: "welcome_read_failed", code: "42703" }));
  });
});

describe("the welcomed_at migration and its database test", () => {
  const read = (path: string) => readFileSync(new URL(`../../../supabase/${path}`, import.meta.url), "utf8");
  const migration = read("migrations/20261119100000_profiles_welcomed_at.sql");
  const test = read("tests/database/profiles_welcomed_at.test.sql");
  // Everything after the header comment: the statements themselves.
  const statements = migration.slice(migration.indexOf("do $$")).trim();

  it("runs the migration's own statements for the backfill test, byte for byte", () => {
    const between = test.slice(test.indexOf("-- migration: start") + "-- migration: start".length, test.indexOf("-- migration: end")).trim();
    expect(between).toBe(statements);
  });

  it("drops the same column the rollback drops", () => {
    const rollback = read("rollbacks/20261119100000_profiles_welcomed_at.down.sql");
    const drop = "alter table public.profiles drop column if exists welcomed_at;";
    expect(rollback).toContain(drop);
    expect(test).toContain(drop);
  });
});
