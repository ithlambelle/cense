// A stand-in for Resend and the heartbeat check, for the reminder job's
// journey test. The app is started with RESEND_BASE_URL and
// REMINDER_HEARTBEAT_URL pointing here (README, CI), so no test ever calls the
// real Resend API or a real check. It keeps every request it gets, and answers
// an email with a 500 for an address the test asked it to fail.
import { createServer, type IncomingMessage, type Server } from "node:http";

export const FAKE_EMAIL_PORT = 3598;

export type SentEmail = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
  idempotencyKey: string | undefined;
  authorization: string | undefined;
};

export type Ping = { path: string; body: string };

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

export async function startFakeEmailServer() {
  const emails: SentEmail[] = [];
  // every email request, including the ones answered with a failure
  const attempts: string[] = [];
  const pings: Ping[] = [];
  const failing = new Set<string>();

  const server: Server = createServer(async (request, response) => {
    const body = await readBody(request);
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    if (request.method === "POST" && path === "/emails") {
      const email = JSON.parse(body) as Omit<SentEmail, "idempotencyKey" | "authorization">;
      attempts.push(...email.to);
      if (email.to.some((to) => failing.has(to))) {
        response.writeHead(500, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ statusCode: 500, name: "application_error", message: "stand-in failure" }));
        return;
      }
      emails.push({
        ...email,
        idempotencyKey: request.headers["idempotency-key"] as string | undefined,
        authorization: request.headers.authorization,
      });
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ id: `fake-${emails.length}` }));
      return;
    }
    if (path.startsWith("/heartbeat")) {
      pings.push({ path, body });
      response.writeHead(200, { "Content-Type": "text/plain" });
      response.end("OK");
      return;
    }
    response.writeHead(404);
    response.end();
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(FAKE_EMAIL_PORT, "127.0.0.1", () => resolve());
  });

  return {
    emails,
    attempts,
    pings,
    // The next emails to this address are answered with a 500.
    fail(address: string) {
      failing.add(address);
    },
    emailsTo: (address: string) => emails.filter((email) => email.to.includes(address)),
    attemptsTo: (address: string) => attempts.filter((to) => to === address).length,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
