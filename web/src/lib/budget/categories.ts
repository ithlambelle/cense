// Created with Claude Code (2026-11-13). The one place Plaid's transaction
// categories become Cense's spending categories, and the one place that says
// which are needs and which are wants (Your money, This month; US-12).
//
// Names: D31's list (Groceries; Dining out, written "Eating out" as the
// approved frame 709:1769 does; Rent and bills; Transportation; School
// supplies; Entertainment; Subscriptions; Shopping and personal care; Health;
// Travel; Other) plus Student loans (D36).
//
// Needs and wants: decided by Ben as D39 (2026-11-13). Needs are Rent and
// bills, Groceries, Transportation, School supplies, Health and Student
// loans; wants are Eating out, Entertainment, Subscriptions, Shopping and
// personal care, Travel and Other. Every line stays editable, so a student
// who disagrees changes the number, not the rule.
//
// Not spending: income, money moving between the student's own accounts
// (Plaid's TRANSFER_IN and TRANSFER_OUT) and credit card payments, which
// would count a purchase twice. A refund is money in under the purchase's
// own category and is subtracted from it (D35). Money in with no category
// (a deposit with no name) is income, never a refund (D37).
//
// Plaid's taxonomy: https://plaid.com/documents/transactions-personal-finance-category-taxonomy.csv

export const BUDGET_CATEGORIES = [
  { key: "rent_and_bills", label: "Rent and bills", group: "need" },
  { key: "groceries", label: "Groceries", group: "need" },
  { key: "transportation", label: "Transportation", group: "need" },
  { key: "school_supplies", label: "School supplies", group: "need" },
  { key: "health", label: "Health", group: "need" },
  { key: "student_loans", label: "Student loans", group: "need" },
  { key: "eating_out", label: "Eating out", group: "want" },
  { key: "entertainment", label: "Entertainment", group: "want" },
  // Anything that renews on its own (D31): a payment pattern, not a Plaid
  // category, so nothing maps here until the recurring detector (#109) marks
  // charges as subscriptions.
  { key: "subscriptions", label: "Subscriptions", group: "want" },
  { key: "shopping_and_personal_care", label: "Shopping and personal care", group: "want" },
  { key: "travel", label: "Travel", group: "want" },
  { key: "other", label: "Other", group: "want" },
] as const;

export type CategoryKey = (typeof BUDGET_CATEGORIES)[number]["key"];
export type CategoryGroup = "need" | "want";

export const CATEGORY_KEYS = BUDGET_CATEGORIES.map((category) => category.key) as CategoryKey[];

export function categoryInfo(key: CategoryKey): { key: CategoryKey; label: string; group: CategoryGroup } {
  return BUDGET_CATEGORIES.find((category) => category.key === key)!;
}

// Primary categories that are never spending.
const NOT_SPENDING_PRIMARY = new Set(["INCOME", "TRANSFER_IN", "TRANSFER_OUT"]);
// Detailed categories that are never spending: paying a card pays for
// purchases already counted when they were made.
const NOT_SPENDING_DETAILED = new Set(["LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"]);

// Detailed categories that do not follow their primary category's line.
const BY_DETAILED: Record<string, CategoryKey> = {
  FOOD_AND_DRINK_GROCERIES: "groceries",
  LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT: "student_loans",
  LOAN_PAYMENTS_MORTGAGE_PAYMENT: "rent_and_bills",
  LOAN_PAYMENTS_CAR_PAYMENT: "transportation",
  GENERAL_SERVICES_AUTOMOTIVE: "transportation",
  GENERAL_SERVICES_INSURANCE: "rent_and_bills",
  GENERAL_MERCHANDISE_BOOKSTORES_AND_NEWSSTANDS: "school_supplies",
  GENERAL_MERCHANDISE_OFFICE_SUPPLIES: "school_supplies",
  MEDICAL_VETERINARY_SERVICES: "other",
};

// Every other detailed category follows its primary category.
const BY_PRIMARY: Record<string, CategoryKey> = {
  FOOD_AND_DRINK: "eating_out",
  RENT_AND_UTILITIES: "rent_and_bills",
  TRANSPORTATION: "transportation",
  TRAVEL: "travel",
  MEDICAL: "health",
  ENTERTAINMENT: "entertainment",
  GENERAL_MERCHANDISE: "shopping_and_personal_care",
  PERSONAL_CARE: "shopping_and_personal_care",
  HOME_IMPROVEMENT: "shopping_and_personal_care",
  LOAN_PAYMENTS: "other",
  GENERAL_SERVICES: "other",
  BANK_FEES: "other",
  GOVERNMENT_AND_NON_PROFIT: "other",
};

// Cense's category for a transaction with Plaid's primary and detailed
// category, or null when it is not spending. Unknown or missing categories
// are Other, never dropped.
export function censeCategory(primary: string | null, detailed: string | null): CategoryKey | null {
  if (primary !== null && NOT_SPENDING_PRIMARY.has(primary)) return null;
  if (detailed !== null && NOT_SPENDING_DETAILED.has(detailed)) return null;
  if (detailed !== null && detailed in BY_DETAILED) return BY_DETAILED[detailed];
  if (primary !== null && primary in BY_PRIMARY) return BY_PRIMARY[primary];
  return "other";
}

// One row of spending_by_detailed_category(): a month's posted money out and
// money in for one Plaid category.
export type DetailedTotal = {
  category: string | null;
  categoryDetailed: string | null;
  outCents: number;
  inCents: number;
};

// A month's spending in each Cense category, in cents, refunds subtracted.
// Only categories with spending above zero are kept.
export function spendingByCategory(totals: DetailedTotal[]): Partial<Record<CategoryKey, number>> {
  const sums: Partial<Record<CategoryKey, number>> = {};
  for (const row of totals) {
    const key = censeCategory(row.category, row.categoryDetailed);
    if (key === null) continue;
    // Money in counts as a refund only under a category (D35, D37).
    const refund = row.category === null ? 0 : row.inCents;
    sums[key] = (sums[key] ?? 0) + row.outCents - refund;
  }
  for (const key of CATEGORY_KEYS) {
    if ((sums[key] ?? 0) <= 0) delete sums[key];
  }
  return sums;
}
