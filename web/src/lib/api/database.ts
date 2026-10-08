import { apiError } from "./errors";

type DatabaseError = { code?: string; message: string };

export function databaseError(operation: string, error: DatabaseError): Response {
  console.error(JSON.stringify({ event: "database_error", operation, code: error.code }));
  return apiError(503, "data_unavailable", "Your data is temporarily unavailable. Please try again.");
}
