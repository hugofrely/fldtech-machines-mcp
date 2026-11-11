import type { ZodType } from "zod/v4";

const hosts = {
  production: "https://atweb.smart-pizza.fr",
  preproduction: "https://preprod-atweb.smart-pizza.fr",
} as const;

type Endpoint = "machines" | "machine" | "infos_machine" | "pizzas" | "stocks";

export function createApi(env: NodeJS.ProcessEnv) {
  const environment = env.FLDTECH_ENVIRONMENT ?? "production";
  if (environment !== "production" && environment !== "preproduction") {
    throw new Error("FLDTECH_ENVIRONMENT must be production or preproduction.");
  }

  const login = env.FLDTECH_LOGIN;
  const password = env.FLDTECH_PASSWORD;
  if (!login?.trim() || !password?.trim()) {
    throw new Error("Set FLDTECH_LOGIN and FLDTECH_PASSWORD before starting the server.");
  }

  const credentials = { login, password };
  const host = hosts[environment];

  return async function request<T>(
    endpoint: Endpoint,
    fields: Record<string, string>,
    schema: ZodType<T>,
    signal: AbortSignal,
  ): Promise<T> {
    const timeout = AbortSignal.timeout(20_000);
    const requestSignal = AbortSignal.any([signal, timeout]);
    let response: Response;
    try {
      response = await fetch(`${host}/webapi/${endpoint}`, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: new URLSearchParams({ ...fields, ...credentials }),
        redirect: "manual",
        signal: requestSignal,
      });
    } catch {
      throw new Error(requestFailure(signal, timeout, "Could not reach FLDTECH. Check network connectivity."));
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new Error(httpError(response.status, endpoint));
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new Error(requestFailure(signal, timeout, "FLDTECH returned invalid JSON."));
    }

    const result = schema.safeParse(data);
    if (!result.success) {
      throw new Error(`FLDTECH returned an unexpected response for ${endpoint}. Check the credentials and requested parameters.`);
    }
    return result.data;
  };
}

function requestFailure(signal: AbortSignal, timeout: AbortSignal, message: string): string {
  if (signal.aborted) return "FLDTECH request cancelled.";
  if (timeout.aborted) return "FLDTECH request timed out after 20 seconds. Try again.";
  return message;
}

function httpError(status: number, endpoint: Endpoint): string {
  switch (status) {
    case 400:
      return endpoint === "stocks"
        ? "FLDTECH rejected the stock request (HTTP 400). Check the machine ID and use a future date and time in the machine's time zone."
        : "FLDTECH rejected the request (HTTP 400). Check the tool arguments and FLDTECH configuration.";
    case 401:
    case 403:
      return `FLDTECH denied access (HTTP ${status}). Check the credentials, environment and machine permissions.`;
    case 404:
      return "FLDTECH returned HTTP 404. Check the machine ID and selected environment.";
    case 429:
      return "FLDTECH rate limit reached (HTTP 429). Wait before trying again.";
    default:
      return `FLDTECH returned HTTP ${status} for ${endpoint}.`;
  }
}
