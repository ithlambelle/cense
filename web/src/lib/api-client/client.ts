// Types come from the generated API contract. Never retype a field by hand.
import type { paths } from "../../../../api/openapi";

type Method = "get" | "put" | "post" | "patch";
type JsonBody<T> = T extends { content: { "application/json": infer Body } } ? Body : never;

// Only the methods the contract defines for a path, so a call such as
// apiRequest("post", "/quiz") does not compile.
type MethodOf<Path extends keyof paths> = {
  [M in Method]: paths[Path][M] extends undefined ? never : M;
}[Method];

type Operation<Path extends keyof paths, M extends Method> = NonNullable<paths[Path][M]>;

type SuccessBody<Path extends keyof paths, M extends Method> =
  Operation<Path, M> extends { responses: infer Responses }
    ? JsonBody<Responses[Extract<keyof Responses, 200 | 201>]>
    : never;

// The body of a successful answer, for example ApiData<"/quiz", "get">.
export type ApiData<Path extends keyof paths, M extends Method> = SuccessBody<Path, M>;

type RequestBody<Path extends keyof paths, M extends Method> =
  Operation<Path, M> extends { requestBody?: infer Body } ? JsonBody<NonNullable<Body>> : never;

export type ApiFailure =
  // The API answered with its error shape: { error: { code, message } }.
  | { ok: false; kind: "api"; status: number; code: string; message: string }
  // The request never got an answer (offline, timed out, blocked).
  | { ok: false; kind: "network" }
  // An answer arrived that was not the API's shape, such as a crashed server.
  | { ok: false; kind: "unexpected"; status: number };

export type ApiResult<Data> = { ok: true; data: Data } | ApiFailure;

type BaseOptions = {
  // Values for {placeholders} in the path, such as { id }.
  pathParams?: Record<string, string>;
  // Replaced in tests.
  fetchFn?: typeof fetch;
};

// A body is required exactly when the contract declares one, and refused otherwise.
type RequestArgs<Path extends keyof paths, M extends Method> = [RequestBody<Path, M>] extends [never]
  ? [options?: BaseOptions & { body?: never }]
  : [options: BaseOptions & { body: RequestBody<Path, M> }];

// Long enough for a slow phone connection, short enough that a stalled
// request cannot leave a button spinning for ever.
export const REQUEST_TIMEOUT_MS = 15_000;

// Runs a request that is cut off after REQUEST_TIMEOUT_MS. Every browser
// request goes through this (pending.ts too). Built by hand because older
// phones lack AbortSignal.timeout.
export async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

function resolvePath(path: string, pathParams: Record<string, string>): string {
  return path.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = pathParams[name];
    // A missing value is a mistake in the calling code, so it fails loudly.
    if (!value) throw new Error(`Missing path value "${name}" for ${path}`);
    return encodeURIComponent(value);
  });
}

// The API's error shape, { error: { code, message } }, or null for anything else.
export function readApiError(payload: unknown): { code: string; message: string } | null {
  if (typeof payload !== "object" || payload === null || !("error" in payload)) return null;
  const error = payload.error;
  if (typeof error !== "object" || error === null) return null;
  if (!("code" in error) || !("message" in error)) return null;
  if (typeof error.code !== "string" || typeof error.message !== "string") return null;
  return { code: error.code, message: error.message };
}

// The one way the browser talks to the server. Same origin only, the session
// cookie is sent, nothing is cached, and every outcome comes back as a value.
export async function apiRequest<Path extends keyof paths, M extends MethodOf<Path>>(
  method: M,
  path: Path,
  ...[options]: RequestArgs<Path, M>
): Promise<ApiResult<SuccessBody<Path, M>>> {
  const { body, pathParams = {}, fetchFn = fetch } = options ?? {};

  const url = `/api/v1${resolvePath(path, pathParams)}`;
  return withTimeout((signal) => send(fetchFn, url, method, body, signal));
}

async function send<Data>(
  fetchFn: typeof fetch,
  url: string,
  method: Method,
  body: unknown,
  signal: AbortSignal,
): Promise<ApiResult<Data>> {
  let response: Response;
  try {
    response = await fetchFn(url, {
      signal,
      method: method.toUpperCase(),
      credentials: "same-origin",
      cache: "no-store",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { ok: false, kind: "network" };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    // Cut off while reading the answer is a connection problem, not a bad answer.
    if (signal.aborted) return { ok: false, kind: "network" };
    return { ok: false, kind: "unexpected", status: response.status };
  }

  if (response.ok) {
    // Trusted because it is this app's own API, described by the contract.
    return { ok: true, data: payload as Data };
  }
  const apiError = readApiError(payload);
  if (!apiError) return { ok: false, kind: "unexpected", status: response.status };
  return { ok: false, kind: "api", status: response.status, ...apiError };
}

export function isUnauthorized(failure: ApiFailure): boolean {
  return failure.kind === "api" && failure.status === 401 && failure.code === "unauthorized";
}

export const OFFLINE_MESSAGE = "We couldn’t reach Cense. Check your connection, then try again.";
// The one line for a failure with nothing more specific to say.
export const FALLBACK_MESSAGE = "Something went wrong on our side. Please try again.";

// What to show a student. The API's own message for errors it names, and a
// plain line otherwise. Never a raw error or a response body.
export function failureMessage(failure: ApiFailure): string {
  if (failure.kind === "api") return failure.message;
  if (failure.kind === "network") return OFFLINE_MESSAGE;
  return FALLBACK_MESSAGE;
}
