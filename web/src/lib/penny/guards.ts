import { listCards } from "@/lib/cards/catalog";

import type { PennyAnswer } from "./answers";

// Removed before a question leaves Cense (S34: personal details are stripped
// first). Emails, then any run of 8 or more digits, which covers card and
// account numbers and phone numbers however they are spaced, then the shorter
// SSN shape. Dollar amounts ("$1,500") are kept: they are what the question is
// about, not who asked it.
const EMAIL = /[^\s@]+@[^\s@]+\.[A-Za-z]{2,}/g;
const LONG_NUMBER = /\+?\(?\d(?:[\s().-]*\d){7,}/g;
const SSN = /\b\d{3}[\s-]\d{2}[\s-]\d{4}\b/g;
const REMOVED = "[removed]";

export function scrubPersonalDetails(question: string): string {
  return question.replace(EMAIL, REMOVED).replace(LONG_NUMBER, REMOVED).replace(SSN, REMOVED);
}

// Card and issuer names from the catalog. Penny never names one (S34 and D11:
// a card mentioned would need the affiliate disclosure beside it).
function catalogNames(): string[] {
  const names = new Set<string>();
  for (const card of listCards()) {
    names.add(card.brand);
    names.add(card.issuingBank);
    names.add(card.name);
  }
  return [...names].filter((name) => name.length > 2);
}

// Digits as written, without thousands commas, so "$250,000" and "250000" match.
function numbersIn(text: string): string[] {
  return (text.match(/\d[\d,.]*/g) ?? []).map((value) => value.replace(/,/g, "").replace(/\.$/, ""));
}

// Straight apostrophes and quotes in a model reply become the app's curly ones.
function typeset(text: string): string {
  return text
    .replace(/(\w)'(\w)/g, "$1’$2")
    .replace(/"([^"]*)"/g, "“$1”");
}

// With typed answers set to "rephrased" (D8, lib/penny/ask.ts): the model's
// rephrasing, if it only says what the checked answer says.
// Otherwise the checked answer exactly as written: a number that is not in
// it, a link or email, a card or issuer name, or a reply too long for a
// bubble all mean the model went beyond its facts.
export function groundedReply(reply: string | null, answer: PennyAnswer): string {
  const text = reply?.trim() ?? "";
  if (text.length === 0 || text.length > 600) return answer.answer;
  if (/https?:|www\.|@/i.test(text)) return answer.answer;
  const known = new Set(numbersIn(answer.answer));
  if (numbersIn(text).some((value) => !known.has(value))) return answer.answer;
  if (catalogNames().some((name) => text.includes(name))) return answer.answer;
  return typeset(text);
}
