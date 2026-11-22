import { ZodError } from "zod";

export function apiError(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): Response {
  return Response.json(
    { error: { code, message, ...(details === undefined ? {} : { details }) } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export function validationError(error: ZodError): Response {
  return apiError(400, "invalid_request", "The request is invalid.", error.flatten());
}

// Only a JSON body is read. A form on another site can post text/plain or a
// form body without asking the browser first, and sign in as the attacker
// (login CSRF); application/json forces that preflight, which no other site
// passes. Anything else reads as no body, so the route answers 400.
export async function parseJson(request: Request): Promise<unknown> {
  const type = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (type !== "application/json") return undefined;
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
