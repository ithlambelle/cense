import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from "@asteasolutions/zod-to-openapi";
import { stringify } from "yaml";
import { z } from "zod";

import {
  applicationSchema,
  cardSchema,
  createApplicationSchema,
  issuerClickSchema,
  quizDraftSchema,
  saveQuizSchema,
  updateApplicationSchema,
} from "../src/lib/api/schemas";

extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();
const errorSchema = z.strictObject({
  error: z.strictObject({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

const json = (schema: z.ZodType) => ({
  "application/json": { schema },
});
const body = (schema: z.ZodType) => ({ content: json(schema) });
const ok = (schema: z.ZodType) => ({ description: "Success", content: json(schema) });
const failure = (description: string) => ({ description, content: json(errorSchema) });
const protectedResponses = {
  401: failure("Sign-in required"),
  503: failure("Data unavailable"),
};

registry.registerPath({
  method: "get", path: "/health", operationId: "getHealth", summary: "Check API availability",
  responses: { 200: ok(z.strictObject({ status: z.literal("ok"), service: z.literal("cense-api") })), 500: failure("Service unavailable") },
});
registry.registerPath({
  method: "post", path: "/auth/email", operationId: "sendEmailCode", summary: "Send a six-digit email code",
  request: { body: body(z.strictObject({ email: z.email() })) },
  responses: { 200: ok(z.strictObject({ status: z.literal("code_sent") })), 400: failure("Invalid email"), 502: failure("Email service unavailable") },
});
registry.registerPath({
  method: "post", path: "/auth/email/verify", operationId: "verifyEmailCode", summary: "Verify an email code and create a session",
  request: { body: body(z.strictObject({ email: z.email(), code: z.string().regex(/^\d{6}$/) })) },
  responses: { 200: ok(z.strictObject({ status: z.literal("signed_in") })), 400: failure("Invalid request"), 401: failure("Wrong or expired code") },
});
registry.registerPath({
  method: "get", path: "/auth/google", operationId: "startGoogleSignIn", summary: "Start Google sign-in",
  request: { query: z.object({ next: z.string().optional() }) },
  responses: { 303: { description: "Redirect to Google" }, 502: failure("Google sign-in unavailable") },
});
registry.registerPath({
  method: "get", path: "/auth/callback", operationId: "finishGoogleSignIn", summary: "Finish Google sign-in",
  request: { query: z.object({ code: z.string().optional(), next: z.string().optional() }) },
  responses: { 303: { description: "Redirect to the app" }, 400: failure("Missing or invalid code") },
});
registry.registerPath({
  method: "post", path: "/auth/logout", operationId: "logOut", summary: "End the session",
  responses: { 200: ok(z.strictObject({ status: z.literal("signed_out") })), 502: failure("Sign-out failed") },
});
registry.registerPath({
  method: "get", path: "/me", operationId: "getMe", summary: "Get the signed-in student",
  security: [{ studentSession: [] }],
  responses: { 200: ok(z.strictObject({ id: z.uuid(), email: z.email().nullable() })), 401: failure("Sign-in required") },
});
registry.registerPath({
  method: "get", path: "/cards", operationId: "listCards", summary: "List curated student cards",
  responses: { 200: ok(z.strictObject({ cards: z.array(cardSchema) })), 503: failure("Catalog unavailable") },
});
registry.registerPath({
  method: "get", path: "/cards/{id}", operationId: "getCard", summary: "Get a card",
  request: { params: z.object({ id: z.string() }) },
  responses: { 200: ok(cardSchema), 404: failure("Card not found") },
});
registry.registerPath({
  method: "get", path: "/quiz", operationId: "getQuiz", summary: "Get saved quiz progress",
  security: [{ studentSession: [] }],
  responses: { 200: ok(quizDraftSchema), 404: failure("No saved quiz"), ...protectedResponses },
});
registry.registerPath({
  method: "put", path: "/quiz", operationId: "saveQuiz", summary: "Save partial quiz progress",
  security: [{ studentSession: [] }],
  request: { body: body(saveQuizSchema) },
  responses: { 200: ok(quizDraftSchema), 400: failure("Invalid quiz answers"), ...protectedResponses },
});
registry.registerPath({
  method: "get", path: "/applications", operationId: "listApplications", summary: "List application status records",
  security: [{ studentSession: [] }],
  responses: { 200: ok(z.strictObject({ applications: z.array(applicationSchema) })), ...protectedResponses },
});
registry.registerPath({
  method: "post", path: "/applications", operationId: "createApplication", summary: "Record a self-reported application or owned card",
  security: [{ studentSession: [] }],
  request: { body: body(createApplicationSchema) },
  responses: { 201: ok(applicationSchema), 400: failure("Invalid application"), 409: failure("Already exists"), ...protectedResponses },
});
registry.registerPath({
  method: "patch", path: "/applications/{id}", operationId: "updateApplication", summary: "Update application status",
  security: [{ studentSession: [] }],
  request: { params: z.object({ id: z.uuid() }), body: body(updateApplicationSchema) },
  responses: { 200: ok(applicationSchema), 400: failure("Invalid update"), 404: failure("Application not found"), ...protectedResponses },
});
registry.registerPath({
  method: "post", path: "/issuer-clicks", operationId: "recordIssuerClick", summary: "Record an issuer link click",
  security: [{ studentSession: [] }],
  request: { body: body(issuerClickSchema) },
  responses: {
    201: ok(z.strictObject({
      id: z.uuid(), cardId: z.string(), kind: z.enum(["preapproval", "apply"]),
      url: z.url(), clickedAt: z.iso.datetime({ offset: true }),
    })),
    400: failure("Invalid request"), 404: failure("Card not found"),
    409: failure("No preapproval link"), ...protectedResponses,
  },
});

const generator = new OpenApiGeneratorV31(registry.definitions);
const document = generator.generateDocument({
  openapi: "3.1.0",
  info: { title: "CENSE API", version: "0.1.0", description: "Shared REST contract for the CENSE web and iOS clients.", license: { name: "Proprietary", identifier: "LicenseRef-CENSE-Proprietary" } },
  servers: [{ url: "/api/v1" }],
  security: [],
});
document.components = {
  ...document.components,
  securitySchemes: {
    studentSession: { type: "apiKey", in: "header", name: "Cookie", description: "Supabase Auth session cookie" },
  },
};

writeFileSync(resolve(import.meta.dirname, "../../api/openapi.yaml"), stringify(document));
