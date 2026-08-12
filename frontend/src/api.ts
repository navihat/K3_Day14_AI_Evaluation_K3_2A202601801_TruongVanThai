import type { Dataset, GateResult, RerankResult, ScoreResult } from "./types";

/* In dev, Vite proxies /api to the FastAPI port. In the built bundle the API
   serves the static files itself, so the same relative path works unchanged. */
const BASE = "/api";

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const payload = await res.json();
      if (payload?.detail) detail = payload.detail;
    } catch {
      /* response had no JSON body — keep the status line */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export const getDataset = () => call<Dataset>("/dataset");

export const runGate = (t: {
  faithfulness: number;
  relevance: number;
  completeness: number;
}) => call<GateResult>("/gate", t);

export const runRerank = (strategy: "question" | "expected") =>
  call<RerankResult>("/rerank", { strategy });

export const runScore = (input: {
  question: string;
  answer: string;
  context: string;
  expected: string;
  contexts?: string[] | null;
}) => call<ScoreResult>("/score", input);
