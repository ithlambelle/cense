// A student who may be in danger gets the 988 line at once (S34). The check
// runs in the browser before anything is sent, so the line shows with no
// connection, with Penny unavailable, at the daily limit or signed out, and
// again on the server before any limit or model call. The model is told to
// flag a crisis too, for wording this misses. A money question that trips
// it ("these fees are killing me") gets the 988 line as well: the safe way
// to be wrong. Kept apart from guards.ts, which loads the card catalog, so
// the browser gets only this.
const PHRASES = [
  /suicid\w*/,
  /kill(?:ing|s)?\s+(?:myself|my\s*self|me)/,
  // "kill myself", but not kilometres ("20 kms").
  /(?<![\d.]\s?)kms/,
  /unaliv\w*/,
  /end(?:ing)?\s+(?:my\s+life|it\s+all)/,
  /tak(?:e|ing)\s+my\s+(?:own\s+)?life/,
  /(?:want(?:ed|s)?\s+to|wanna)\s+die/,
  /(?:better\s+off|wish\s+i\s+(?:was|were)|want(?:ed)?\s+to\s+be)\s+dead/,
  /(?:don[’']?t|do\s+not)\s+want\s+to\s+(?:live|be\s+alive|exist|be\s+here)/,
  /(?:no\s+reason|nothing)\s+to\s+live/,
  // "I can't go on like this (with my debt)", "can't go on anymore", and a
  // bare "I can't go on." at the end, but not "can't go on vacation".
  /(?:can[’']?t|cannot)\s+go\s+on(?:\s+like\s+this|\s+any\s*more|(?=\s*(?:[.!?,]|$)))/,
  /self[\s-]?harm\w*/,
  /(?:hurt|hurting|harm|harming|cut|cutting)\s+(?:myself|my\s*self)/,
  /cut(?:ting)?\s+my\s+wrists?/,
  /overdos\w*/,
  /(?:want|going)\s+to\s+(?:hurt|kill)\s+(?:someone|somebody|people|others)/,
];

const CRISIS = new RegExp(`\\b(?:${PHRASES.map((phrase) => phrase.source).join("|")})\\b`, "i");

export function isCrisis(question: string): boolean {
  return CRISIS.test(question.normalize("NFKC"));
}
