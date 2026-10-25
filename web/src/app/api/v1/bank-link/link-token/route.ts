import { authenticatedStudent } from "@/lib/api/auth";
import { databaseError } from "@/lib/api/database";
import { apiError } from "@/lib/api/errors";
import { createLinkToken } from "@/lib/plaid/client";
import { plaidConfig } from "@/lib/plaid/config";
import { alreadyLinked, bankUnreachable, NO_STORE, relinkNeeded, safeToSpendOff } from "@/lib/plaid/responses";
import { linkStatus, readAccessToken } from "@/lib/plaid/store";

// A Plaid Link token for the browser (US-12). With no bank linked, Link adds
// one. With a bank that needs the student to sign in again, Link opens in
// update mode on the same Item. Otherwise there is nothing to do: one bank
// per student.
export async function POST(): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");
  const config = plaidConfig();
  if (!config) return safeToSpendOff();

  const status = await linkStatus(student);
  if (!status.ok) return databaseError("bank_link_read", status.error);
  let accessToken: string | undefined;
  if (status.value !== null) {
    if (status.value !== "reconnect_needed") return alreadyLinked();
    const stored = await readAccessToken(student, config);
    if (!stored.ok) return databaseError("bank_link_secret_read", stored.error);
    if (stored.value.kind !== "token") return relinkNeeded();
    accessToken = stored.value.accessToken;
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
