import { describe, expect, it } from "vitest";

import { evaluateFit, RULES_VERSION } from "./fit-tier";
import type { FitResult, RuleAnswers, RuleCard } from "./fit-tier";
import { card, CORE_STUDENT, PREAPPROVAL, SECTION_7_CARDS, SECTION_7_STUDENTS } from "./fit-tier.fixtures";

type CompleteResult = Extract<FitResult, { status: "complete" }>;

function complete(result: FitResult): CompleteResult {
  if (result.status !== "complete") {
    throw new Error(`expected a complete result, got missing: ${result.missing.join(", ")}`);
  }
  return result;
}

function fitOf(answers: RuleAnswers, rule: RuleCard) {
  return complete(evaluateFit(answers, [rule])).cards[0];
}

function pick(answers: RuleAnswers, cards: RuleCard[]) {
  return complete(evaluateFit(answers, cards)).recommendedCardId;
}

// The table in section 7 of "Fit Tier Rules v1.2", copied cell by cell.
// Rows are students 1 to 8, columns are the cards in SECTION_7_CARDS order.
// A cell is the tier followed by the rule IDs that fired.
const L = "likely_fit";
const SECTION_7_TABLE: string[][] = [
  [L, L, "stretch C1", "stretch C1", "stretch C1", "stretch C1", "stretch C1", "stretch C1", L, "stretch C1", L, L, L],
  Array(13).fill("not_yet G1"),
  [L, L, "stretch C1", "stretch C1", "stretch C1", "stretch C1", "stretch C1", "stretch C1", L, "stretch C1", L, L, L],
  Array(13).fill(L),
  [...Array(8).fill("not_yet G3"), L, L, L, L, L],
  ["stretch C2", "stretch C2", ...Array(6).fill("stretch C1 C2"), "stretch C2", "stretch C1 C2", "stretch C2", "stretch C2", "stretch C2"],
  ["stretch C3", "stretch C3", ...Array(6).fill("stretch C1 C3"), "stretch C3", "stretch C1 C3", L, L, L],
  [L, L, ...Array(6).fill("stretch C1"), L, "stretch C1", "not_yet G6", "not_yet G6", L],
];

// The recommended card for each student in section 7.
const SECTION_7_PICKS: (string | null)[] = [
  "discover-it-student-cash-back",
  null,
  "discover-it-student-cash-back",
  "discover-it-student-cash-back",
  "chase-freedom-rise",
  "capital-one-platinum-secured",
  "capital-one-platinum-secured",
  "discover-it-student-cash-back",
];

describe("fit tier rules: section 7 table", () => {
  it("has one row per student and one cell per card", () => {
    expect(SECTION_7_TABLE).toHaveLength(SECTION_7_STUDENTS.length);
    for (const row of SECTION_7_TABLE) expect(row).toHaveLength(SECTION_7_CARDS.length);
  });

  SECTION_7_STUDENTS.forEach((student, row) => {
    it(`matches the table for student ${student.name}`, () => {
      const result = complete(evaluateFit(student.answers, SECTION_7_CARDS));
      const cells = result.cards.map((fit) => [fit.tier, ...fit.ruleIds].join(" "));
      expect(result.cards.map((fit) => fit.cardId)).toEqual(SECTION_7_CARDS.map((rule) => rule.id));
      expect(cells).toEqual(SECTION_7_TABLE[row]);
    });

    it(`recommends the table's card for student ${student.name}`, () => {
      expect(pick(student.answers, SECTION_7_CARDS)).toBe(SECTION_7_PICKS[row]);
    });
  });

  it("gives every result the rules version", () => {
    expect(RULES_VERSION).toBe("fit-rules v1.2");
    expect(evaluateFit(CORE_STUDENT, SECTION_7_CARDS).rulesVersion).toBe("fit-rules v1.2");
  });
});

describe("fit tier rules: which cards are tiered", () => {
  it("leaves out explore cards", () => {
    const result = complete(evaluateFit(CORE_STUDENT, [card("a"), card("b", "none", { catalogRole: "explore" })]));
    expect(result.cards.map((fit) => fit.cardId)).toEqual(["a"]);
  });

  it("leaves out a card closed to new applicants (G4)", () => {
    const result = complete(evaluateFit(CORE_STUDENT, [card("closed", "none", { openToNewApplicants: false }), card("open")]));
    expect(result.cards.map((fit) => fit.cardId)).toEqual(["open"]);
  });

  it.each(["constructor", "__proto__", "toString", "", "unknown"])(
    "leaves out a card whose history level is not a real level: %s",
    (level) => {
      const odd = card("odd", level as RuleCard["historyNeeded"]);
      expect(complete(evaluateFit(CORE_STUDENT, [odd])).cards).toEqual([]);
    },
  );

  it("leaves out a card whose history level is silent, because it has no level", () => {
    expect(complete(evaluateFit(CORE_STUDENT, [card("silent", "none", { historyBasis: "silent" })])).cards).toEqual([]);
  });

  it("tiers a card whose history level is an estimate", () => {
    expect(fitOf(CORE_STUDENT, card("est", "none", { historyBasis: "estimate" })).tier).toBe("likely_fit");
  });
});

describe("fit tier rules: answers", () => {
  it.each(["under21", "incomeBand", "student", "standing", "recentDenial", "canDeposit"] as const)(
    "reports a missing %s",
    (key) => {
      const answers: RuleAnswers = { ...CORE_STUDENT };
      delete answers[key];
      expect(evaluateFit(answers, SECTION_7_CARDS)).toEqual({
        status: "incomplete", rulesVersion: RULES_VERSION, missing: [key],
      });
    },
  );

  it("always needs the deposit answer, even with no deposit card in play", () => {
    const answers: RuleAnswers = { ...CORE_STUDENT };
    delete answers.canDeposit;
    expect(evaluateFit(answers, [card("plain")])).toMatchObject({ status: "incomplete", missing: ["canDeposit"] });
  });

  it("lists every missing answer in a fixed order", () => {
    expect(evaluateFit({}, SECTION_7_CARDS)).toMatchObject({
      status: "incomplete",
      missing: ["under21", "incomeBand", "student", "standing", "recentDenial", "canDeposit"],
    });
  });

  it("does not need a goal", () => {
    expect(evaluateFit(CORE_STUDENT, SECTION_7_CARDS).status).toBe("complete");
  });

  it("counts not sure as no credit history", () => {
    const notSure = { ...CORE_STUDENT, standing: "not_sure" } as const;
    const tiers = (answers: RuleAnswers) => complete(evaluateFit(answers, SECTION_7_CARDS)).cards;
    expect(tiers(notSure)).toEqual(tiers(CORE_STUDENT));
  });
});

describe("fit tier rules: gates", () => {
  it("G1 fails every card for a student under 21 with no income or savings", () => {
    const result = complete(evaluateFit({ ...CORE_STUDENT, incomeBand: "none" }, SECTION_7_CARDS));
    expect(new Set(result.cards.map((fit) => fit.ruleIds[0]))).toEqual(new Set(["G1"]));
    expect(result.recommendedCardId).toBeNull();
    expect(result.noCardReason?.ruleId).toBe("G1");
  });

  it("G2 fails every card for someone 21 or over with no income or savings", () => {
    const result = complete(evaluateFit({ ...CORE_STUDENT, under21: false, incomeBand: "none" }, [card("a")]));
    expect(result.cards[0].ruleIds).toEqual(["G2"]);
    expect(result.noCardReason).toEqual({
      ruleId: "G2",
      reason: "Issuers have to check that you can make payments, so they need to see some income or savings.",
    });
  });

  it("sets no income reason when cards fail for other reasons", () => {
    const result = complete(evaluateFit({ ...CORE_STUDENT, student: false }, [card("s", "none", { studentsOnly: true })]));
    expect(result.recommendedCardId).toBeNull();
    expect(result.noCardReason).toBeNull();
  });

  it("G3 keeps a students-only card from someone who is not a student", () => {
    const fit = fitOf({ ...CORE_STUDENT, student: false }, card("s", "none", { studentsOnly: true }));
    expect(fit.ruleIds).toEqual(["G3"]);
    expect(fit.reasons).toEqual(["This card is only for students."]);
  });

  it("G5 fires at two or more levels above the student, not at one", () => {
    expect(fitOf(CORE_STUDENT, card("e", "established")).ruleIds).toEqual(["G5"]);
    expect(fitOf(CORE_STUDENT, card("s", "strong")).ruleIds).toEqual(["G5"]);
    expect(fitOf(CORE_STUDENT, card("l", "limited")).ruleIds).toEqual(["C1"]);
  });

  it("checks the gates in order", () => {
    const hard = card("hard", "strong", { studentsOnly: true, depositMinCents: 4900, depositMaxCents: 20000, secured: true });
    expect(fitOf({ ...CORE_STUDENT, incomeBand: "none", student: false, canDeposit: false }, hard).ruleIds).toEqual(["G1"]);
    expect(fitOf({ ...CORE_STUDENT, student: false, canDeposit: false }, hard).ruleIds).toEqual(["G3"]);
    expect(fitOf({ ...CORE_STUDENT, canDeposit: false }, hard).ruleIds).toEqual(["G5"]);
  });

  it.each([
    [4900, 20000, "This card needs a refundable deposit of $49 to $200 to open."],
    [30000, 30000, "This card needs a refundable deposit of $300 to open."],
    [20000, null, "This card needs a refundable deposit of at least $200 to open."],
    [4950, 500000, "This card needs a refundable deposit of $49.50 to $5,000 to open."],
  ])("G6 states the card's own deposit: %i to %s", (min, max, reason) => {
    const secured = card("sec", "none", { secured: true, depositMinCents: min, depositMaxCents: max });
    const fit = fitOf({ ...CORE_STUDENT, canDeposit: false }, secured);
    expect(fit.ruleIds).toEqual(["G6"]);
    expect(fit.reasons).toEqual([reason]);
  });

  it("G6 never applies to a secured card with no minimum deposit", () => {
    const chime = card("chime", "none", { secured: true, depositMinCents: 0, runsCreditCheck: false });
    expect(fitOf({ ...CORE_STUDENT, canDeposit: false }, chime).tier).toBe("likely_fit");
  });
});

describe("fit tier rules: cautions and their reasons", () => {
  it("C1 suggests preapproval only when the card has a preapproval link", () => {
    expect(fitOf(CORE_STUDENT, card("with", "limited", { preapprovalUrl: PREAPPROVAL })).reasons).toEqual([
      "The issuer says this card is for people with a bit more credit history. It may still work, so check preapproval first.",
    ]);
    expect(fitOf(CORE_STUDENT, card("without", "limited")).reasons).toEqual([
      "The issuer says this card is for people with a bit more credit history. It may still work.",
    ]);
  });

  it("C2 suggests waiting or a secured card", () => {
    expect(fitOf({ ...CORE_STUDENT, recentDenial: true }, card("a")).reasons).toEqual([
      "You were turned down recently. Applications close together can count against you. Waiting a few months, or starting with a secured card, gives you better odds.",
    ]);
  });

  it("C3 does not point a secured card to a secured card", () => {
    const damaged = { ...CORE_STUDENT, standing: "damaged" } as const;
    expect(fitOf(damaged, card("unsecured")).reasons).toEqual([
      "This card is not aimed at rebuilding credit. A secured card is the more reliable next step.",
    ]);
    const securedNotRebuilding = card("sec", "none", { secured: true, depositMinCents: 4900, depositMaxCents: 20000 });
    expect(fitOf(damaged, securedNotRebuilding).reasons).toEqual(["This card is not aimed at rebuilding credit."]);
  });

  it("C3 does not fire on a card for rebuilding", () => {
    expect(fitOf({ ...CORE_STUDENT, standing: "damaged" }, card("r", "none", { okForRebuilding: true })).tier).toBe("likely_fit");
  });

  it("lists cautions in C1, C2, C3 order", () => {
    const fit = fitOf({ ...CORE_STUDENT, standing: "damaged", recentDenial: true }, card("l", "limited"));
    expect(fit.ruleIds).toEqual(["C1", "C2", "C3"]);
    expect(fit.reasons).toHaveLength(3);
  });

  it("gives a likely fit its reasons, with preapproval only when there is a link", () => {
    expect(fitOf(CORE_STUDENT, card("a", "none", { preapprovalUrl: PREAPPROVAL })).reasons).toEqual([
      "You meet what the issuer says this card is for.",
      "You can check preapproval without affecting your credit.",
    ]);
    expect(fitOf(CORE_STUDENT, card("b")).reasons).toEqual(["You meet what the issuer says this card is for."]);
  });
});

describe("fit tier rules: notes", () => {
  it("N1 marks a card that checks credit and has no preapproval tool", () => {
    expect(fitOf(CORE_STUDENT, card("a")).notes).toEqual([
      { id: "N1", text: "This issuer has no preapproval check, so applying is the only way to find out." },
    ]);
    expect(fitOf(CORE_STUDENT, card("b", "none", { preapprovalUrl: PREAPPROVAL })).notes).toEqual([]);
  });

  it("N2 marks a card with no credit check to apply, and never with N1", () => {
    expect(fitOf(CORE_STUDENT, card("c", "none", { runsCreditCheck: false })).notes).toEqual([
      { id: "N2", text: "This card has no credit check to apply." },
    ]);
  });

  it("puts notes on not yet cards too, without changing the tier", () => {
    const fit = fitOf({ ...CORE_STUDENT, student: false }, card("s", "none", { studentsOnly: true }));
    expect(fit.tier).toBe("not_yet");
    expect(fit.notes.map((note) => note.id)).toEqual(["N1"]);
  });
});

describe("fit tier rules: picking the recommended card (section 6)", () => {
  it("1. likely fit before stretch; not yet is never picked", () => {
    expect(pick(CORE_STUDENT, [card("a-stretch", "limited"), card("b-likely")])).toBe("b-likely");
    expect(pick(CORE_STUDENT, [card("a-notyet", "strong"), card("b-stretch", "limited")])).toBe("b-stretch");
    expect(pick(CORE_STUDENT, [card("only", "strong")])).toBeNull();
  });

  it("2. fewer cautions first", () => {
    const answers = { ...CORE_STUDENT, recentDenial: true };
    const cards = [card("a-two", "limited", { studentsOnly: true }), card("b-one")];
    expect(pick(answers, cards)).toBe("b-one");
  });

  it("3. after a recent denial, a secured or rebuilding card first", () => {
    const answers = { ...CORE_STUDENT, recentDenial: true };
    expect(pick(answers, [card("a-plain", "none", { studentsOnly: true }), card("b-rebuild", "none", { okForRebuilding: true })])).toBe("b-rebuild");
    expect(pick(answers, [card("a-plain"), card("b-secured", "none", { secured: true })])).toBe("b-secured");
    // Without a recent denial, unsecured wins at step 9 instead.
    expect(pick(CORE_STUDENT, [card("a-secured", "none", { secured: true }), card("b-plain")])).toBe("b-plain");
  });

  it("4. a history level the issuer publishes before an estimate or a decision", () => {
    expect(pick(CORE_STUDENT, [card("a-est", "none", { historyBasis: "estimate", studentsOnly: true }), card("b-pub")])).toBe("b-pub");
    expect(pick(CORE_STUDENT, [card("a-dec", "none", { historyBasis: "decision", studentsOnly: true }), card("b-pub")])).toBe("b-pub");
  });

  it("5. a students-only card first, for a student", () => {
    expect(pick(CORE_STUDENT, [card("a-general"), card("b-student", "none", { studentsOnly: true })])).toBe("b-student");
  });

  it("6. a card that asks for less credit history first", () => {
    const limitedStudent = { ...CORE_STUDENT, standing: "limited" } as const;
    expect(pick(limitedStudent, [card("a-limited", "limited"), card("b-none")])).toBe("b-none");
  });

  it("7. for the build_credit goal, a card with a stated upgrade path first", () => {
    const cards = [card("a-plain"), card("b-upgrade", "none", { conditions: ["graduation_review"] })];
    expect(pick({ ...CORE_STUDENT, goal: "build_credit" }, cards)).toBe("b-upgrade");
    expect(pick({ ...CORE_STUDENT, goal: "learn" }, cards)).toBe("a-plain");
    expect(pick(CORE_STUDENT, cards)).toBe("a-plain");
  });

  it("8. no annual fee first", () => {
    expect(pick(CORE_STUDENT, [card("a-fee", "none", { annualFeeCents: 3900 }), card("b-free", "none", { secured: true })])).toBe("b-free");
  });

  it("9. unsecured first, then card ID as the last resort", () => {
    expect(pick(CORE_STUDENT, [card("a-secured", "none", { secured: true }), card("b-unsecured")])).toBe("b-unsecured");
    expect(pick(CORE_STUDENT, [card("b"), card("a")])).toBe("a");
  });

  describe("the steps run in the order the rules give", () => {
    const secured = { secured: true, depositMinCents: 4900, depositMaxCents: 20000 };
    const denied = { ...CORE_STUDENT, recentDenial: true };
    const limitedStudent = { ...CORE_STUDENT, standing: "limited" } as const;

    it("fewer cautions (2) before the recent-denial step (3)", () => {
      expect(pick(denied, [card("a-secured-limited", "limited", { ...secured, okForRebuilding: true }), card("b-plain")])).toBe("b-plain");
    });

    it("the recent-denial step (3) before published history (4)", () => {
      expect(pick(denied, [card("a-plain"), card("b-secured-est", "none", { ...secured, historyBasis: "estimate" })])).toBe("b-secured-est");
    });

    it("students-only (5) before less history needed (6)", () => {
      expect(pick(limitedStudent, [card("a-general-none"), card("b-student-limited", "limited", { studentsOnly: true })])).toBe("b-student-limited");
    });

    it("less history needed (6) before the goal (7)", () => {
      const cards = [card("a-none"), card("b-limited-upgrade", "limited", { conditions: ["graduation_review"] })];
      expect(pick({ ...limitedStudent, goal: "build_credit" }, cards)).toBe("a-none");
    });

    it("the goal (7) before no annual fee (8)", () => {
      const cards = [card("a-upgrade-fee", "none", { annualFeeCents: 3900, conditions: ["graduation_review"] }), card("b-free")];
      expect(pick({ ...CORE_STUDENT, goal: "build_credit" }, cards)).toBe("a-upgrade-fee");
    });

    it("an estimate (4) ranks below a published level even for a student card (5)", () => {
      expect(pick(CORE_STUDENT, [card("a-est", "none", { historyBasis: "estimate", studentsOnly: true }), card("b-pub")])).toBe("b-pub");
    });
  });

  it("picks the same card whatever order the cards come in", () => {
    const reversed = [...SECTION_7_CARDS].reverse();
    for (const student of SECTION_7_STUDENTS) {
      expect(pick(student.answers, reversed)).toBe(pick(student.answers, SECTION_7_CARDS));
    }
  });

  it("does not change the cards or answers it is given", () => {
    const cards = structuredClone(SECTION_7_CARDS);
    const answers = { ...CORE_STUDENT, goal: "build_credit" } as const;
    const answersCopy = structuredClone(answers);
    evaluateFit(answers, cards);
    expect(cards).toEqual(SECTION_7_CARDS);
    expect(answers).toEqual(answersCopy);
  });
});

describe("fit tier rules: input that skipped the schema check", () => {
  // The types forbid these values. They are forced here on purpose, to show
  // that a bad value is reported as missing and never becomes a likely fit.
  it.each([
    ["standing", { standing: "unknown" }],
    ["standing", { standing: null }],
    ["incomeBand", { incomeBand: null }],
    ["incomeBand", { incomeBand: "lots" }],
    ["under21", { under21: null }],
    ["under21", { under21: "yes" }],
    ["student", { student: null }],
    ["recentDenial", { recentDenial: "no" }],
    ["canDeposit", { canDeposit: null }],
    ["standing", { standing: "constructor" }],
  ])("treats a bad %s as missing", (key, bad) => {
    const answers = { ...CORE_STUDENT, ...bad } as unknown as RuleAnswers;
    expect(evaluateFit(answers, SECTION_7_CARDS)).toMatchObject({ status: "incomplete", missing: [key] });
  });

  it("ignores a goal that is not a real choice", () => {
    const cards = [card("a-plain"), card("b-upgrade", "none", { conditions: ["graduation_review"] })];
    expect(pick({ ...CORE_STUDENT, goal: "toString" } as unknown as RuleAnswers, cards)).toBe("a-plain");
  });
});
