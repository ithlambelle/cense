// A question typed on Learn, handed to Ask Penny on the next screen. Kept in
// memory, never in the address (it could hold personal details) or in
// storage: a reload drops it rather than asking twice and using up a
// question.
let pending: string | null = null;

export function handOffQuestion(question: string): void {
  pending = question;
}

// Whether a question is waiting, without taking it.
export function peekHandedOffQuestion(): string | null {
  return pending;
}

// Returns the question once, then forgets it.
export function takeHandedOffQuestion(): string | null {
  const question = pending;
  pending = null;
  return question;
}
