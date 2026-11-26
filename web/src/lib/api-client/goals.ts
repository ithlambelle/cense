// Created with Claude Code (2026-11-26). The browser's side of a student's
// goal (PUT and DELETE /me/goal) and Accept plan (POST /me/goal/accept).
import type { paths } from "../../../../api/openapi";
import { apiRequest } from "./client";
import { runOutcome } from "./safe-to-spend";

export type SaveGoalBody = NonNullable<paths["/me/goal"]["put"]["requestBody"]>["content"]["application/json"];

export function saveGoal(body: SaveGoalBody) {
  return runOutcome(apiRequest("put", "/me/goal", { body }));
}

export function deleteGoal() {
  return runOutcome(apiRequest("delete", "/me/goal"));
}

// Accept plan: the saved goal's monthly amount becomes the set-aside.
export function acceptGoalPlan() {
  return runOutcome(apiRequest("post", "/me/goal/accept"));
}
