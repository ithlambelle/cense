// A stand-in for the Claude API, so the Ask Penny journeys never call the real
// model: no key in CI, no cost, and the same answer every run. The app reaches
// it because it is started with ANTHROPIC_BASE_URL pointing here (README, "Run
// the app and journey tests locally"). It answers POST /v1/messages the way
// the real API answers a structured-output request: one text block holding
// the JSON Penny's schema asks for.
//
// What the student types decides the answer, so each test can reach one case:
//   "boom"     the API fails (HTTP 500)
//   "slow"     the answer takes 9 seconds
//   "crypto"   an advice question
//   "weather"  off topic
//   "mortgage" a money question with no checked answer
//   "ninety"   a reply that invents a number ("90%")
//   anything else: the preapproval answer, rephrased
import { createServer, type IncomingMessage, type Server } from "node:http";

export const FAKE_CLAUDE_PORT = Number(process.env.E2E_FAKE_CLAUDE_PORT ?? 3599);

type ModelReply = {
  kind: "answer" | "advice" | "off_topic" | "unknown" | "crisis";
  answerId: string | null;
  reply: string | null;
  suggestionIds: string[];
};

// Every request the app sent, so a test can check what left Cense.
export const received: { body: string }[] = [];

function replyFor(question: string): ModelReply | "fail" | "slow" {
  const text = question.toLowerCase();
  if (text.includes("boom")) return "fail";
  if (text.includes("slow")) return "slow";
  if (text.includes("crypto")) {
    return { kind: "advice", answerId: null, reply: null, suggestionIds: ["emergency-fund", "fdic-insurance"] };
  }
  if (text.includes("weather")) return { kind: "off_topic", answerId: null, reply: null, suggestionIds: [] };
  if (text.includes("mortgage")) {
    return { kind: "unknown", answerId: null, reply: null, suggestionIds: ["credit-score", "avoid-interest"] };
  }
  if (text.includes("ninety")) {
    return {
      kind: "answer",
      answerId: "preapproval-vs-applying",
      reply: "Checking preapproval is safe 90% of the time.",
      suggestionIds: [],
    };
  }
  return {
    kind: "answer",
    answerId: "preapproval-vs-applying",
    reply: "Checking preapproval won't change your score, because it's a soft inquiry. Applying is the step that adds a hard inquiry.",
    suggestionIds: [],
  };
}

// The student's question is the last text the app sends.
function lastUserText(body: string): string {
  const parsed = JSON.parse(body) as { messages: { role: string; content: string | { type: string; text?: string }[] }[] };
  const last = parsed.messages.at(-1);
  if (!last) return "";
  if (typeof last.content === "string") return last.content;
  return last.content.map((block) => block.text ?? "").join("\n");
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (chunk: Buffer) => (data += chunk.toString("utf8")));
    request.on("end", () => resolve(data));
    request.on("error", reject);
  });
}

export async function startFakeClaude(): Promise<Server> {
  const server = createServer(async (request, response) => {
    if (request.method !== "POST" || !request.url?.startsWith("/v1/messages")) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ type: "error", error: { type: "not_found_error", message: "Not found" } }));
      return;
    }
    const body = await readBody(request);
    received.push({ body });
    const reply = replyFor(lastUserText(body));
    if (reply === "fail") {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ type: "error", error: { type: "api_error", message: "Internal server error" } }));
      return;
    }
    if (reply === "slow") await new Promise((resolve) => setTimeout(resolve, 9_000));
    const json: ModelReply =
      reply === "slow"
        ? {
            kind: "answer",
            answerId: "credit-score",
            reply: "A credit score is a number that sums up how you have handled credit.",
            suggestionIds: [],
          }
        : reply;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        id: `msg_fake_${received.length}`,
        type: "message",
        role: "assistant",
        model: "claude-sonnet-5-5",
        content: [{ type: "text", text: JSON.stringify(json) }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      }),
    );
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(FAKE_CLAUDE_PORT, "127.0.0.1", resolve);
  });
  return server;
}
