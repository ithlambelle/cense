import { authenticatedStudent } from "@/lib/api/auth";
import { databaseError } from "@/lib/api/database";
import { apiError } from "@/lib/api/errors";
import { createLinkToken } from "@/lib/plaid/client";
import { plaidConfig } from "@/lib/plaid/config";
import { linkAccess } from "@/lib/plaid/pilot";
import { alreadyLinked, bankUnreachable, itemBudgetFull, NO_STORE, pilotOnly, relinkNeeded, safeToSpendOff } from "@/lib/plaid/responses";
import { linkStatus, readAccessToken } from "@/lib/plaid/store";

// A Plaid Link token for the browser (US-12). With no bank linked, Link adds
// one. With a bank that needs the student to sign in again, Link opens in
// update mode on the same Item. Otherwise there is nothing to do: one bank
// per student. In production only pilot students get a token, and a new bank
// only while their allowance and the budget have room (lib/plaid/pilot.ts),
// so Link never opens for a bank the app would then refuse.
export async function POST(): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");
  const config = plaidConfig();
  if (!config) return safeToSpendOff();
  const access = await linkAccess(student, config);
  if (!access.ok) return databaseError("plaid_pilot_read", access.error);
  if (access.value === "none") return pilotOnly();

  const status = await linkStatus(student);
  if (!status.ok) return databaseError("bank_link_read", status.error);
  let accessToken: string | undefined;
  if (status.value !== null) {
    if (status.value === "relink_needed") return relinkNeeded();
    if (status.value !== "reconnect_needed") return alreadyLinked();
    const stored = await readAccessToken(student, config);
    if (!stored.ok) return databaseError("bank_link_secret_read", stored.error);
    if (stored.value.kind !== "token") return relinkNeeded();
    accessToken = stored.value.accessToken;
  } else if (access.value !== "open") {
    // Update mode reuses the Item, so only a new bank needs a slot.
    return itemBudgetFull();
  }

  const link = await createLinkToken(config, student.studentId, accessToken);
  if (!link.ok) return bankUnreachable();
  return Response.json(
    {
      linkToken: link.data.link_token,
      expiration: new Date(link.data.expiration).toISOString(),
      mode: accessToken ? "update" : "create",
    },
    { headers: NO_STORE },
  );
}
