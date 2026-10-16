import type { RuleAnswers, RuleCard } from "./fit-tier";

// TEST DATA ONLY. This is not the card catalog and must not be imported outside
// tests. Each card copies the values the rules read from the 13 recommend cards
// in section 7 of "Fit Tier Rules v1.2" (catalog verified 2026-10-15). The
// preapproval link is a placeholder: the rules only check whether one exists.
type CardFacts = Partial<Omit<RuleCard, "id" | "historyNeeded" | "conditions" | "eligibilityEvidence">> & {
  historyBasis?: RuleCard["eligibilityEvidence"]["historyNeeded"]["basis"];
  conditions?: RuleCard["conditions"][number]["kind"][];
};

export const PREAPPROVAL = "https://example.com/preapproval";

export function card(id: string, historyNeeded: RuleCard["historyNeeded"] = "none", facts: CardFacts = {}): RuleCard {
  const { historyBasis = "issuer", conditions = [], ...rest } = facts;
  return {
    id,
    catalogRole: "recommend",
    annualFeeCents: 0, // every card in the catalog has no annual fee
    preapprovalUrl: null,
    historyNeeded,
    studentsOnly: false,
    secured: false,
    depositMinCents: 0,
    depositMaxCents: null,
    okForRebuilding: false,
    runsCreditCheck: true,
    openToNewApplicants: true,
    ...rest,
    conditions: conditions.map((kind) => ({ kind })),
    eligibilityEvidence: { historyNeeded: { basis: historyBasis } },
  };
}

const SECURED_49_TO_200 = { secured: true, depositMinCents: 4900, depositMaxCents: 20000, okForRebuilding: true };

// Column order of the table in section 7.
export const SECTION_7_CARDS: RuleCard[] = [
  card("discover-it-student-cash-back", "none", { studentsOnly: true, preapprovalUrl: PREAPPROVAL, conditions: ["one_card_per_period", "income_over_housing_minimum"] }),
  card("discover-it-student-chrome", "none", { studentsOnly: true, preapprovalUrl: PREAPPROVAL, conditions: ["one_card_per_period", "income_over_housing_minimum"] }),
  card("capital-one-savor-students", "limited", { studentsOnly: true, preapprovalUrl: PREAPPROVAL, conditions: ["income_over_housing_minimum"] }),
  card("capital-one-quicksilver-students", "limited", { studentsOnly: true, preapprovalUrl: PREAPPROVAL, conditions: ["income_over_housing_minimum"] }),
  // Bank of America publishes no credit level. "limited" is a team decision.
  card("bofa-customized-cash-students", "limited", { studentsOnly: true, preapprovalUrl: PREAPPROVAL, historyBasis: "decision", conditions: ["one_card_per_period"] }),
  card("bofa-unlimited-cash-students", "limited", { studentsOnly: true, preapprovalUrl: PREAPPROVAL, historyBasis: "decision", conditions: ["one_card_per_period"] }),
  card("bofa-travel-rewards-students", "limited", { studentsOnly: true, preapprovalUrl: PREAPPROVAL, historyBasis: "decision", conditions: ["one_card_per_period"] }),
  card("bofa-bankamericard-students", "limited", { studentsOnly: true, preapprovalUrl: PREAPPROVAL, historyBasis: "decision", conditions: ["one_card_per_period"] }),
  card("chase-freedom-rise", "none", { preapprovalUrl: PREAPPROVAL, conditions: ["relationship_helps_approval", "graduation_review"] }),
  card("capital-one-platinum", "limited", { preapprovalUrl: PREAPPROVAL, conditions: ["one_card_per_period", "income_over_housing_minimum"] }),
  card("capital-one-platinum-secured", "none", { ...SECURED_49_TO_200, preapprovalUrl: PREAPPROVAL, conditions: ["one_card_per_period", "deposit_by_bank_transfer", "income_over_housing_minimum"] }),
  card("discover-it-secured-cash-back", "none", { ...SECURED_49_TO_200, preapprovalUrl: PREAPPROVAL, conditions: ["one_card_per_period", "deposit_by_bank_transfer", "graduation_review", "income_over_housing_minimum"] }),
  // Secured with no minimum deposit, so gate G6 never applies to it.
  card("chime-card", "none", { secured: true, okForRebuilding: true, runsCreditCheck: false, conditions: ["requires_bank_account", "rewards_need_direct_deposit", "limit_equals_money_moved", "no_utilization_reporting"] }),
];

// Case 1, the core user: age 19, part-time pay, student, no history.
export const CORE_STUDENT = {
  under21: true,
  incomeBand: "under_5k",
  student: true,
  standing: "none",
  recentDenial: false,
  canDeposit: true,
} as const satisfies RuleAnswers;

// Row order of the table in section 7.
export const SECTION_7_STUDENTS: { name: string; answers: RuleAnswers }[] = [
  { name: "1. Age 19, part-time pay, student, no history", answers: CORE_STUDENT },
  { name: "2. Age 19, no income, no savings, student", answers: { ...CORE_STUDENT, incomeBand: "none" } },
  {
    name: "3. Age 19, no income but savings in own name, student, no history",
    answers: { ...CORE_STUDENT, incomeBand: "savings_only" },
  },
  {
    name: "4. Age 20, allowance into own account, student, authorized user",
    answers: { ...CORE_STUDENT, standing: "limited" },
  },
  {
    name: "5. Age 22, household income, not a student, 1 year paid on time",
    // The page gives no band for this student. Any band other than "none" gives the same tiers.
    answers: { ...CORE_STUDENT, under21: false, incomeBand: "over_15k", student: false, standing: "established" },
  },
  { name: "6. Case 1, turned down last month", answers: { ...CORE_STUDENT, recentDenial: true } },
  { name: "7. Age 20, part-time pay, student, missed payments", answers: { ...CORE_STUDENT, standing: "damaged" } },
  { name: "8. Case 1, cannot put down a deposit", answers: { ...CORE_STUDENT, canDeposit: false } },
];
