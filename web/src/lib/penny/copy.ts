// What Penny can answer: the four topics of her checked answers. Every line
// that says what Penny knows uses it word for word, so the screens cannot
// disagree (QA reading of #71, Oct 25 2026).
export const PENNY_SCOPE = "credit, budgeting, saving and student loans";

// Penny's fixed lines. The advice reply follows the Flow 5 frame's (144:3235)
// with the scope above; the others follow it for states the frames do not
// draw. Every one leads to a next step: two questions Penny can answer, Try
// again, or Sign in again.
export const PENNY_COPY = {
  // Under the chat header (144:3157), with the AI disclosure S34 asks for.
  disclaimer: "Penny uses AI. Educational, not financial advice.",
  greetingTitle: "Hi! I’m Penny.",
  greeting: `Ask me about ${PENNY_SCOPE}.`,
  // Both question fields. Too narrow for the scope (about 166px on Learn at
  // 320 wide), so it claims none; the greeting above says it.
  placeholder: "Ask Penny a question",
  // Until typed questions are on (no ANTHROPIC_API_KEY): only checked
  // answers, so no invitation to ask and no AI line.
  greetingTapOnly: "Tap a question for a checked answer.",
  disclaimerTapOnly: "Educational, not financial advice.",
  advice: `I can explain ${PENNY_SCOPE}, but I can’t tell you what to do with your money. Here’s what might help:`,
  offTopic: `I only know ${PENNY_SCOPE}. Here’s what I can answer:`,
  unknown: "I don’t have a checked answer for that yet. Here’s what I can answer:",
  crisis:
    "You don’t have to handle this alone. Call or text 988, any time, to reach the Suicide & Crisis Lifeline. It’s free and confidential.",
  limit: "That’s all the typed questions I can answer today. These still work:",
  unavailable: "I can’t answer typed questions right now. These still work:",
  signedOut: "Your sign-in ended. Sign in again to keep asking.",
  thinking: "Penny is thinking",
  stillThinking: "Still thinking, almost there.",
} as const;
