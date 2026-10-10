import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

const issuerEvidenceSchema = z.strictObject({
  sourceUrl: z.url(),
  verifiedAt: z.iso.date(),
});

const eligibilityEvidenceSchema = z.strictObject({
  historyNeeded: issuerEvidenceSchema,
  studentsOnly: issuerEvidenceSchema,
  secured: issuerEvidenceSchema,
  depositMinCents: issuerEvidenceSchema,
  depositMaxCents: issuerEvidenceSchema,
  okForRebuilding: issuerEvidenceSchema,
  preapprovalUrl: issuerEvidenceSchema,
  runsCreditCheck: issuerEvidenceSchema,
  openToNewApplicants: issuerEvidenceSchema,
  taxIdNote: issuerEvidenceSchema,
});

export const cardSchema = z.strictObject({
  id: z.string(),
  issuer: z.string(),
  name: z.string(),
  annualFeeCents: z.int().nonnegative(),
  preapprovalUrl: z.url().nullable(),
  applyUrl: z.url(),
  referralDisclosure: z.string().nullable(),
  historyNeeded: z.enum(["none", "limited", "established", "strong"]),
  studentsOnly: z.boolean(),
  secured: z.boolean(),
  depositMinCents: z.int().nonnegative(),
  depositMaxCents: z.int().nonnegative().nullable(),
  okForRebuilding: z.boolean(),
  runsCreditCheck: z.boolean(),
  openToNewApplicants: z.boolean(),
  taxIdNote: z.string().nullable(),
  eligibilityEvidence: eligibilityEvidenceSchema,
});

export const quizAnswersSchema = z.strictObject({
  under21: z.boolean().optional(),
  incomeBand: z.enum(["none", "savings_only", "under_5k", "5k_to_15k", "over_15k"]).optional(),
  student: z.boolean().optional(),
  standing: z.enum(["none", "limited", "established", "damaged"]).optional(),
  recentDenial: z.boolean().optional(),
  canDeposit: z.boolean().optional(),
  monthlySpendingCents: z.int().nonnegative().optional(),
  goal: z.enum(["build_credit", "learn", "other"]).optional(),
});

export const quizDraftSchema = z.strictObject({
  answers: quizAnswersSchema,
  updatedAt: z.iso.datetime({ offset: true }),
});

export const saveQuizSchema = z.strictObject({ answers: quizAnswersSchema });

export const applicationStatusSchema = z.enum(["applied", "approved", "rejected"]);
export const applicationIdSchema = z.uuid();

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
  reason: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});
