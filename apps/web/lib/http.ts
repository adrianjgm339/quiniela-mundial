import { z } from "zod";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function parseJsonSafe(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text as unknown;
  }
}

export async function apiFetch<T>(
  input: RequestInfo | URL,
  init: RequestInit,
  schema: z.ZodSchema<T>
): Promise<T> {
  const res = await fetch(input, { ...init, credentials: "include" });

  const data: unknown = await parseJsonSafe(res);

  if (!res.ok) {
    // intenta sacar message de un error JSON, si existe
    const msg =
      typeof data === "object" && data !== null && "message" in data
        ? String((data as { message: unknown }).message)
        : `HTTP ${res.status}`;
    throw new HttpError(res.status, msg);
  }

  return schema.parse(data);
}

export async function apiGet<T>(url: string, schema: z.ZodSchema<T>): Promise<T> {
  return apiFetch(url, { method: "GET" }, schema);
}

export async function apiPost<T, B>(
  url: string,
  body: B,
  schema: z.ZodSchema<T>
): Promise<T> {
  return apiFetch(
    url,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
    schema
  );
}