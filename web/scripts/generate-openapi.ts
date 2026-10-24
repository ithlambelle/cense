import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from "@asteasolutions/zod-to-openapi";
import { stringify } from "yaml";
import { z } from "zod";

import {
  applicationDetailSchema,
  applicationSchema,
  cardSchema,
  createApplicationSchema,
  issuerClickSchema,
  quizDraftSchema,
  recommendationSchema,
  saveQuizSchema,
  updateApplicationSchema,
} from "../src/lib/api/schemas";
import { planNameSchema, planProgressSchema, planStepNameSchema, planStepSchema } from "../src/lib/api/plans";
import {
  createReapplyReminderSchema,
  reminderSchema,
  reminderSettingsSchema,
  updateReminderSettingsSchema,
} from "../src/lib/api/reminders";
import {
  passwordCredentialsSchema,
  passwordResetRequestSchema,
  passwordSignInSchema,
  passwordSignUpConfirmSchema,
  passwordUpdateSchema,
} from "../src/lib/api/password";

const registry = new OpenAPIRegistry();
const errorSchema = registry.register("ApiError", z.strictObject({
  error: z.strictObject({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
}));
const cardContract = registry.register("Card", cardSchema);
const quizDraftContract = registry.register("QuizDraft", quizDraftSchema);
const applicationContract = registry.register("Application", applicationSchema);
const applicationDetailContract = registry.register("ApplicationDetail", applicationDetailSchema);
const recommendationContract = registry.register("Recommendation", recommendationSchema);

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
  description: "When this code is what confirms the account, any password set before it is replaced with a random one and other sessions end.",
  request: { body: body(z.strictObject({ email: z.email(), code: z.string().regex(/^\d{6}$/) })) },
  responses: { 200: ok(z.strictObject({ status: z.literal("signed_in") })), 400: failure("Invalid request"), 401: failure("Wrong or expired code"), 502: failure("Account could not be secured") },
});
registry.registerPath({
  method: "post", path: "/auth/password/signup", operationId: "signUpWithPassword", summary: "Create an optional password account",
  request: { body: body(passwordCredentialsSchema) },
  responses: { 200: ok(z.strictObject({ status: z.enum(["signed_in", "check_email"]) })), 400: failure("Invalid request"), 429: failure("Rate limited"), 502: failure("Sign-up unavailable") },
});
registry.registerPath({
  method: "post", path: "/auth/password/signup/confirm", operationId: "confirmPasswordSignUp", summary: "Confirm a password sign-up with the emailed code and set its password",
  description: "Sets the chosen password and ends other sessions only when this code is what confirms the account. An account confirmed earlier keeps its password and sessions, and `passwordChanged` is false.",
  request: { body: body(passwordSignUpConfirmSchema) },
  responses: { 200: ok(z.strictObject({ status: z.literal("signed_in"), passwordChanged: z.boolean() })), 400: failure("Invalid request"), 401: failure("Wrong or expired code"), 502: failure("Password could not be set") },
});
registry.registerPath({
  method: "post", path: "/auth/password/signin", operationId: "signInWithPassword", summary: "Sign in with an existing password",
  request: { body: body(passwordSignInSchema) },
  responses: { 200: ok(z.strictObject({ status: z.literal("signed_in") })), 400: failure("Invalid request"), 401: failure("Incorrect credentials"), 403: failure("Email not confirmed"), 429: failure("Rate limited") },
});
registry.registerPath({
  method: "post", path: "/auth/password/reset", operationId: "requestPasswordReset", summary: "Send a password reset email",
  request: { body: body(passwordResetRequestSchema) },
  responses: { 200: ok(z.strictObject({ status: z.literal("check_email") })), 400: failure("Invalid request"), 502: failure("Email service unavailable") },
});
registry.registerPath({
  method: "get", path: "/auth/password/reset/verify", operationId: "verifyPasswordReset", summary: "Verify a password reset link",
  request: { query: z.object({ token_hash: z.string().optional(), code: z.string().optional() }) },
  responses: { 303: { description: "Redirect to reset form or request a new link" } },
});
registry.registerPath({
  method: "post", path: "/auth/password/reset/confirm", operationId: "confirmPasswordReset", summary: "Set a password with an authenticated reset session",
  security: [{ studentSession: [] }],
  request: { body: body(passwordUpdateSchema) },
  responses: { 200: ok(z.strictObject({ status: z.literal("password_updated") })), 400: failure("Invalid request"), 401: failure("Reset session required"), 403: failure("Recovery session required"), 502: failure("Password update failed") },
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
  responses: { 200: ok(z.strictObject({ cards: z.array(cardContract) })), 503: failure("Catalog unavailable") },
});
registry.registerPath({
  method: "get", path: "/cards/{id}", operationId: "getCard", summary: "Get a card",
  request: { params: z.object({ id: z.string() }) },
  responses: { 200: ok(cardContract), 404: failure("Card not found") },
});
registry.registerPath({
  method: "get", path: "/quiz", operationId: "getQuiz", summary: "Get saved quiz progress",
  security: [{ studentSession: [] }],
  responses: { 200: ok(quizDraftContract), 404: failure("No saved quiz"), ...protectedResponses },
});
registry.registerPath({
  method: "put", path: "/quiz", operationId: "saveQuiz", summary: "Save partial quiz progress",
  security: [{ studentSession: [] }],
  request: { body: body(saveQuizSchema) },
  responses: { 200: ok(quizDraftContract), 400: failure("Invalid quiz answers"), ...protectedResponses },
});
registry.registerPath({
  method: "get", path: "/applications", operationId: "listApplications", summary: "List application status records",
  security: [{ studentSession: [] }],
  responses: { 200: ok(z.strictObject({ applications: z.array(applicationContract) })), ...protectedResponses },
});
registry.registerPath({
  method: "post", path: "/applications", operationId: "createApplication", summary: "Record a self-reported application or owned card",
  security: [{ studentSession: [] }],
  request: { body: body(createApplicationSchema) },
  responses: { 201: ok(applicationContract), 400: failure("Invalid application"), 409: failure("Already exists"), ...protectedResponses },
});
registry.registerPath({
  method: "patch", path: "/applications/{id}", operationId: "updateApplication",
  summary: "Update a tracked card: status, credit limit, denial reason and note, autopay, closing and due days",
  description: "Any of the fields, at least one. A credit limit and the closing and due days need an approved card, a denial reason and note a rejected one. Saving the days, status or autopay re-plans the card's reminders.",
  security: [{ studentSession: [] }],
  request: { params: z.object({ id: z.uuid() }), body: body(updateApplicationSchema) },
  responses: { 200: ok(applicationDetailContract), 400: failure("Invalid update"), 404: failure("Application not found"), 409: failure("Already exists"), ...protectedResponses },
});
registry.registerPath({
  method: "get", path: "/applications/{id}", operationId: "getApplication", summary: "Read one tracked card with its denial reason, autopay and closing and due days",
  security: [{ studentSession: [] }],
  request: { params: z.object({ id: z.uuid() }) },
  responses: { 200: ok(applicationDetailContract), 400: failure("Invalid application ID"), 404: failure("Application not found"), ...protectedResponses },
});
const planStepContract = registry.register("PlanStep", planStepSchema);
const planParams = z.object({ id: z.uuid(), plan: planNameSchema });
registry.registerPath({
  method: "get", path: "/applications/{id}/plans/{plan}", operationId: "getPlanProgress",
  summary: "Read the finished steps of a first-month or denial plan",
  security: [{ studentSession: [] }],
  request: { params: planParams },
  responses: { 200: ok(registry.register("PlanProgress", planProgressSchema)), 400: failure("Invalid application ID"), 404: failure("Application or plan not found"), ...protectedResponses },
});
registry.registerPath({
  method: "put", path: "/applications/{id}/plans/{plan}/steps/{step}", operationId: "completePlanStep",
  summary: "Mark a plan step done (doing it again keeps the first time)",
  security: [{ studentSession: [] }],
  request: { params: planParams.extend({ step: planStepNameSchema }) },
  responses: {
    200: ok(planStepContract), 201: ok(planStepContract), 400: failure("Invalid application ID"),
    404: failure("Application or plan step not found"), 409: failure("Plan not available for this application status"), ...protectedResponses,
  },
});
registry.registerPath({
  method: "delete", path: "/applications/{id}/plans/{plan}/steps/{step}", operationId: "undoPlanStep",
  summary: "Undo a plan step",
  security: [{ studentSession: [] }],
  request: { params: planParams.extend({ step: planStepNameSchema }) },
  responses: { 204: { description: "Undone" }, 400: failure("Invalid application ID"), 404: failure("Application or plan step not found"), ...protectedResponses },
});
const reminderContract = registry.register("Reminder", reminderSchema);
const reminderSettingsContract = registry.register("ReminderSettings", reminderSettingsSchema);
registry.registerPath({
  method: "get", path: "/reminders", operationId: "listReminders",
  summary: "List the student's reminders, sent and upcoming",
  security: [{ studentSession: [] }],
  responses: { 200: ok(z.strictObject({ reminders: z.array(reminderContract) })), ...protectedResponses },
});
registry.registerPath({
  method: "post", path: "/reminders", operationId: "createReapplyReminder",
  summary: "Set the reapply reminder for a denied application (replaces an unsent one)",
  description: "The day must be tomorrow to a year from now on the student's calendar. The answer carries the day as remindOn.",
  security: [{ studentSession: [] }],
  request: { body: body(createReapplyReminderSchema) },
  responses: {
    201: ok(reminderContract), 400: failure("Invalid day or application not denied"),
    404: failure("Application not found"), 409: failure("Already sent"), ...protectedResponses,
  },
});
registry.registerPath({
  method: "post", path: "/reminders/{id}/acted", operationId: "markReminderActed",
  summary: "Mark a sent reminder acted on (keeps the first time)",
  security: [{ studentSession: [] }],
  request: { params: z.object({ id: z.uuid() }) },
  responses: {
    200: ok(reminderContract), 400: failure("Invalid reminder ID"), 404: failure("Reminder not found"),
    409: failure("Reminder not sent yet"), ...protectedResponses,
  },
});
registry.registerPath({
  method: "get", path: "/me/reminder-settings", operationId: "getReminderSettings",
  summary: "Read the student's reminder settings",
  security: [{ studentSession: [] }],
  responses: { 200: ok(reminderSettingsContract), 404: failure("Profile not found"), ...protectedResponses },
});
registry.registerPath({
  method: "patch", path: "/me/reminder-settings", operationId: "updateReminderSettings",
  summary: "Turn reminder kinds, or all reminder emails, on or off",
  description: "Turning a kind off removes its unsent reminders; turning it on schedules them again. emailsOn false stops every reminder email.",
  security: [{ studentSession: [] }],
  request: { body: body(updateReminderSettingsSchema) },
  responses: { 200: ok(reminderSettingsContract), 400: failure("Invalid settings"), 404: failure("Profile not found"), ...protectedResponses },
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
registry.registerPath({
  method: "get", path: "/recommendations/latest", operationId: "getLatestRecommendation",
  summary: "Read the latest server-generated recommendation",
  security: [{ studentSession: [] }],
  responses: { 200: ok(recommendationContract), 404: failure("No saved recommendation"), ...protectedResponses },
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
