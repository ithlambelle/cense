import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

// Where a card fact comes from (Fit Tier Rules v1.2, section 3).
// issuer: the issuer states it. silent: the issuer's page was checked and says
// nothing, so the value is false, 0 or null. estimate: the issuer publishes
// nothing and the value is reasoned from the outside sources listed.
// decision: the team decided it.
export const evidenceBasisSchema = z.enum(["issuer", "silent", "estimate", "decision"]);

// Catalog links are shown to students and handed to the browser, so only https.
const httpsUrl = () => z.url({ protocol: /^https$/ });

const fieldEvidenceSchema = z.strictObject({
  basis: evidenceBasisSchema,
  sourceUrls: z.array(httpsUrl()).min(1),
  verifiedAt: z.iso.date(),
}).openapi("CardFieldEvidence");

const eligibilityEvidenceSchema = z.strictObject({
  annualFeeCents: fieldEvidenceSchema,
  historyNeeded: fieldEvidenceSchema,
  minHistoryMonths: fieldEvidenceSchema,
  studentsOnly: fieldEvidenceSchema,
  secured: fieldEvidenceSchema,
  depositMinCents: fieldEvidenceSchema,
  depositMaxCents: fieldEvidenceSchema,
  okForRebuilding: fieldEvidenceSchema,
  preapprovalUrl: fieldEvidenceSchema,
  runsCreditCheck: fieldEvidenceSchema,
  openToNewApplicants: fieldEvidenceSchema,
  foreignTransactionFeePercent: fieldEvidenceSchema,
  issuingBank: fieldEvidenceSchema,
});

// Something the student signs up for beyond the card itself, stated by the
// issuer. A new kind is added to the rules page first, then here.
export const cardConditionKindSchema = z.enum([
  "requires_bank_account",
  "relationship_helps_approval",
  "rewards_need_direct_deposit",
  "deposit_by_bank_transfer",
  "limit_equals_money_moved",
  "no_utilization_reporting",
  "graduation_review",
  "one_card_per_period",
  "income_over_housing_minimum",
]);

const cardConditionSchema = z.strictObject({
  kind: cardConditionKindSchema,
  affects: z.enum(["approval", "rewards", "deposit", "credit_building"]),
  text: z.string().min(1),
  sourceUrl: httpsUrl(),
  verifiedAt: z.iso.date(),
}).openapi("CardCondition");

export const cardSchema = z.strictObject({
  id: z.string(),
  brand: z.string(),
  issuingBank: z.string(),
  name: z.string(),
  catalogRole: z.enum(["recommend", "explore"]),
  catalogRoleReason: z.string().min(1),
  annualFeeCents: z.int().nonnegative(),
  foreignTransactionFeePercent: z.number().nonnegative(),
  preapprovalUrl: httpsUrl().nullable(),
  applyUrl: httpsUrl(),
  referralDisclosure: z.string().nullable(),
  historyNeeded: z.enum(["none", "limited", "established", "strong"]),
  minHistoryMonths: z.int().nonnegative().nullable(),
  studentsOnly: z.boolean(),
  secured: z.boolean(),
  depositMinCents: z.int().nonnegative(),
  depositMaxCents: z.int().nonnegative().nullable(),
  okForRebuilding: z.boolean(),
  runsCreditCheck: z.boolean(),
  openToNewApplicants: z.boolean(),
  conditions: z.array(cardConditionSchema),
  eligibilityEvidence: eligibilityEvidenceSchema,
}).refine(
  (card) => card.eligibilityEvidence.historyNeeded.basis !== "silent",
  { message: "A history level comes from the issuer, an estimate or a decision, never silence.", path: ["eligibilityEvidence", "historyNeeded", "basis"] },
).refine(
  (card) => card.secured || (card.depositMinCents === 0 && card.depositMaxCents === null),
  { message: "An unsecured card has no deposit.", path: ["depositMinCents"] },
).refine(
  (card) => card.depositMaxCents === null || card.depositMaxCents >= card.depositMinCents,
  { message: "The largest required deposit cannot be below the smallest.", path: ["depositMaxCents"] },
);

export const quizAnswersSchema = z.strictObject({
  under21: z.boolean().optional(),
  incomeBand: z.enum(["none", "savings_only", "under_5k", "5k_to_15k", "over_15k"]).optional(),
  student: z.boolean().optional(),
  standing: z.enum(["none", "limited", "established", "damaged", "not_sure"]).optional(),
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

// What the student wants to be called. Up to 60 characters after trimming;
// an empty name clears it, as null does.
const displayNameSchema = z.string().trim().max(60);

export const meSchema = z.strictObject({
  id: z.uuid(),
  email: z.email().nullable(),
  name: z.string().nullable(),
});

export const updateMeSchema = z.strictObject({
  name: displayNameSchema.nullable(),
});

export const issuerClickSchema = z.strictObject({
  cardId: z.string().min(1).max(100),
  kind: z.enum(["preapproval", "apply"]),
});

export const recommendationSchema = z.strictObject({
  id: z.uuid(),
  // Null when no card fits. The tier is then not_yet.
  cardId: z.string().nullable(),
  fitTier: z.enum(["likely_fit", "stretch", "not_yet"]),
  reason: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});
