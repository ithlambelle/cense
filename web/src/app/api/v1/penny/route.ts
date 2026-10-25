import Anthropic from "@anthropic-ai/sdk";

import { authenticatedStudent } from "@/lib/api/auth";
import { databaseError } from "@/lib/api/database";
import { apiError, parseJson, validationError } from "@/lib/api/errors";
import { askPennySchema } from "@/lib/api/penny";
import { askPenny, declined, pennyConfigured } from "@/lib/penny/ask";
import { isCrisis, scrubPersonalDetails } from "@/lib/penny/guards";

// A model call can take a while, with one retry: room for the slowest answer.
export const maxDuration = 60;

const NO_STORE = { headers: { "Cache-Control": "no-store" } };

// What the logs may say about a failed model call: its kind and status, never
// the question or the reply.
function failure(error: unknown) {
  if (error instanceof Anthropic.APIConnectionTimeoutError) return { kind: "timeout" };
  if (error instanceof Anthropic.APIConnectionError) return { kind: "connection" };
  if (error instanceof Anthropic.APIError) return { kind: "api", status: error.status };
  return { kind: "unexpected" };
}

// One typed question to Penny (S34). Nothing about it is stored: the daily
// count keeps who and when, and the logs keep only failures' kinds.
export async function POST(request: Request): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");

  const parsed = askPennySchema.safeParse(await parseJson(request));
  if (!parsed.success) return validationError(parsed.error);

  // A student in danger is answered at once, with no limit and no model call.
  if (isCrisis(parsed.data.question)) return Response.json(declined("crisis"), NO_STORE);

  // Checked before counting, so a missing key never uses up a question.
  if (!pennyConfigured()) {
    return apiError(503, "penny_unavailable", "Penny can’t answer typed questions right now.");
  }

  const { data: claim, error } = await student.supabase.rpc("claim_penny_ask");
  if (error) return databaseError("penny_ask_claim", error);
  if (claim !== "ok") {
    return apiError(429, "penny_limit", "That’s all the typed questions Penny can answer today.", { limit: claim });
  }

  try {
    return Response.json(await askPenny(scrubPersonalDetails(parsed.data.question)), NO_STORE);
  } catch (caught) {
    console.error(JSON.stringify({ event: "penny_failed", ...failure(caught) }));
    return apiError(503, "penny_unavailable", "Penny can’t answer typed questions right now.");
  }
}
