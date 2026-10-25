// Penny's fixed lines. The advice reply is the Flow 5 frame's (144:3235); the
// others follow it for states the frames do not draw. Every one leads to a
// next step: two questions Penny can answer, Try again, or Sign in again.
export const PENNY_COPY = {
  // Under the chat header (144:3157), with the AI disclosure S34 asks for.
  disclaimer: "Penny uses AI. Educational, not financial advice.",
  greetingTitle: "Hi! I’m Penny.",
  greeting: "Got a money question? I’m here to help.",
  advice: "I can explain how cards and credit work, but I can’t tell you what to do with your money. Here’s what might help:",
  offTopic: "I only know money basics like cards, credit, budgeting, saving and student loans. Here’s what I can answer:",
  unknown: "I don’t have a checked answer for that yet. Here’s what I can answer:",
  crisis:
    "You don’t have to handle this alone. Call or text 988, any time, to reach the Suicide & Crisis Lifeline. It’s free and confidential.",
  limit: "That’s all the typed questions I can answer today. These still work:",
  unavailable: "I can’t answer typed questions right now. These still work:",
  signedOut: "Your sign-in ended. Sign in again to keep asking.",
  thinking: "Penny is thinking",
  stillThinking: "Still thinking, almost there.",
} as const;
