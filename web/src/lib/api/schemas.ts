import { z } from "zod";

export const cardSchema = z.strictObject({
  id: z.string(),
  issuer: z.string(),
  name: z.string(),
  annualFeeCents: z.int().nonnegative(),
  preapprovalUrl: z.url().nullable(),
  applyUrl: z.url(),
  referralDisclosure: z.string().nullable(),
});

export const quizAnswersSchema = z.strictObject({
  age: z.int().min(18).max(120).optional(),
  annualIncomeCents: z.int().nonnegative().optional(),
  independentIncome: z.boolean().optional(),
  monthlySpendingCents: z.int().nonnegative().optional(),
  goal: z.enum(["build_credit", "learn", "other"]).optional(),
});

export const quizDraftSchema = z.strictObject({
  answers: quizAnswersSchema,
  updatedAt: z.iso.datetime({ offset: true }),
});

export const saveQuizSchema = z.strictObject({ answers: quizAnswersSchema });

export const applicationStatusSchema = z.enum(["applied", "approved", "rejected"]);

export const applicationSchema = z.strictObject({
  id: z.uuid(),
  cardId: z.string().nullable(),
  cardName: z.string(),
  status: applicationStatusSchema,
  creditLimitCents: z.int().nonnegative().nullable(),
  appliedAt: z.iso.datetime({ offset: true }).nullable(),
  statusUpdatedAt: z.iso.datetime({ offset: true }),
});

export const createApplicationSchema = z.strictObject({
  cardId: z.string().min(1).max(100).nullable(),
  cardName: z.string().trim().min(1).max(160),
  status: applicationStatusSchema,
  creditLimitCents: z.int().nonnegative().nullable(),
}).refine(
  ({ status, creditLimitCents }) => status === "approved" || creditLimitCents === null,
  { message: "Only approved cards can have a credit limit." },
);

export const updateApplicationSchema = z.strictObject({
  status: applicationStatusSchema,
  creditLimitCents: z.int().nonnegative().nullable(),
}).refine(
  ({ status, creditLimitCents }) => status === "approved" || creditLimitCents === null,
  { message: "Only approved cards can have a credit limit." },
);

export const issuerClickSchema = z.strictObject({
  cardId: z.string().min(1).max(100),
  kind: z.enum(["preapproval", "apply"]),
});

export const recommendationSchema = z.strictObject({
  id: z.uuid(),
  cardId: z.string(),
  fitTier: z.enum(["likely_fit", "stretch", "not_yet"]),
  reason: z.string(),
  createdAt: z.iso.datetime({ offset: true }),
});
