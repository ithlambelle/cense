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

export async function parseJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
