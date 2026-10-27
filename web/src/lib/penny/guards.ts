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

// Words the reply may use only if its checked answer does (PEN-05 b).
const NUMBER_WORD =
  /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|half|dozen)\b/gi;
const INVESTMENT_WORD =
  /\b(stocks?|shares|bonds?|crypto(currency|currencies)?|bitcoin|etfs?|mutual funds?|invest(s|ing|ment|ments|or|ors)?|trading|portfolio)\b/gi;
// Never, whatever the answer says: advice and promises.
const NEVER = /\b(should|guarantee\w*|approved)\b/i;

// Short, common words that carry no fact.
const FILLER = new Set(
  "that this with your from have what when they them then than will would could also just only more most some into about because which there their these those each does been being were here very such like much many make makes means mean even still".split(" "),
);

// A word's first five letters, so "inquiry" matches "inquiries".
function stems(text: string): string[] {
  return (text.toLowerCase().match(/[a-z]{4,}/g) ?? [])
    .filter((word) => !FILLER.has(word) && !new RegExp(NUMBER_WORD.source, "i").test(word))
    .map((word) => word.slice(0, 5));
}

// Every sentence must be mostly the answer's own words: more than half of
// its content words appear in the checked answer.
function traceable(reply: string, answer: string): boolean {
  const known = new Set(stems(answer));
  return reply
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => sentence.trim().length > 0)
    .every((sentence) => {
      const words = stems(sentence);
      return words.length > 0 && words.filter((word) => known.has(word)).length / words.length > 0.5;
    });
}

// Words of one kind in the reply that the answer does not have.
function newWords(pattern: RegExp, reply: string, answer: string): boolean {
  const known = new Set((answer.match(pattern) ?? []).map((word) => word.toLowerCase()));
  return (reply.match(pattern) ?? []).some((word) => !known.has(word.toLowerCase()));
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
  if (newWords(NUMBER_WORD, text, answer.answer)) return answer.answer;
  if (NEVER.test(text) && !NEVER.test(answer.answer)) return answer.answer;
  if (newWords(INVESTMENT_WORD, text, answer.answer)) return answer.answer;
  if (!traceable(text, answer.answer)) return answer.answer;
  return typeset(text);
}
