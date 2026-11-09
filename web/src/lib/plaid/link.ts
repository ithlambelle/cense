// Plaid Link in the browser (US-12). Plaid requires its script to load from
// its own address, so it is added to the page on first use rather than
// bundled. Link runs in Plaid's own frame: the student's bank sign-in never
// touches Cense, and session replay cannot record it.
// https://plaid.com/docs/link/web/

export const PLAID_LINK_SCRIPT = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";

type LinkError = { error_type: string; error_code: string } | null;

type LinkHandler = { open: () => void; destroy: () => void };

type PlaidLinkFactory = {
  create: (config: {
    token: string;
    onSuccess: (publicToken: string, metadata: unknown) => void;
    onExit: (error: LinkError, metadata: unknown) => void;
  }) => LinkHandler;
};

declare global {
  interface Window {
    Plaid?: PlaidLinkFactory;
  }
}

let loading: Promise<PlaidLinkFactory> | null = null;

function loadLink(): Promise<PlaidLinkFactory> {
  if (window.Plaid) return Promise.resolve(window.Plaid);
  loading ??= new Promise<PlaidLinkFactory>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = PLAID_LINK_SCRIPT;
    script.async = true;
    script.onload = () => (window.Plaid ? resolve(window.Plaid) : reject(new Error("Plaid Link did not start")));
    script.onerror = () => {
      // A later tap tries again (offline, or a blocker stopped it).
      loading = null;
      script.remove();
      reject(new Error("Plaid Link could not load"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export type LinkOutcome =
  // Connected: the one-time public token, for POST /bank-link. In update
  // mode it is not needed (the Item and its token stay the same).
  | { kind: "connected"; publicToken: string }
  // The student closed Link without connecting.
  | { kind: "cancelled" }
  // Link ended with an error from the bank or Plaid.
  | { kind: "failed" }
  // Link's script never loaded.
  | { kind: "unavailable" };

// Opens Link with a token from POST /bank-link/link-token and resolves once
// it closes.
export async function openLink(token: string): Promise<LinkOutcome> {
  let factory: PlaidLinkFactory;
  try {
    factory = await loadLink();
  } catch {
    return { kind: "unavailable" };
  }
  return new Promise<LinkOutcome>((resolve) => {
    let handler: LinkHandler | null = null;
    const finish = (outcome: LinkOutcome) => {
      resolve(outcome);
      // After the callback returns, as Plaid asks.
      setTimeout(() => handler?.destroy(), 0);
    };
    try {
      handler = factory.create({
        token,
        onSuccess: (publicToken) => finish({ kind: "connected", publicToken }),
        onExit: (error) => finish(error ? { kind: "failed" } : { kind: "cancelled" }),
      });
      handler.open();
    } catch {
      finish({ kind: "failed" });
    }
  });
}
