import type { Instrumentation } from "next";

// A route handler or page that threw on the server goes to error tracking
// (lib/server-errors.ts). Only the route's file path and the method are sent:
// request.path holds ids and query strings, and the headers hold the session.
// Node only, because posthog-node does not run in the Edge runtime.
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportServerError } = await import("@/lib/server-errors");
  await reportServerError(error, { route: context.routePath, route_type: context.routeType, method: request.method });
};
