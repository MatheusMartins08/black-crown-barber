"use client";

import { useCallback, useEffect, useState } from "react";

export type AsyncData<T> =
  | { status: "idle" | "loading"; retry: () => void }
  | { status: "success"; data: T; retry: () => void }
  | { status: "error"; error: unknown; retry: () => void };

type Settled<T> = {
  loader: () => Promise<T>;
  attempt: number;
  result: { ok: true; data: T } | { ok: false; error: unknown };
};

/**
 * Executa `loader` sempre que a função muda (memoize com useCallback). O estado de
 * carregamento é derivado: enquanto o último resultado não pertence ao loader atual,
 * o recurso está carregando.
 */
export default function useAsyncData<T>(loader: (() => Promise<T>) | null): AsyncData<T> {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  useEffect(() => {
    if (!loader) return;
    let active = true;

    loader().then(
      (data) => {
        if (active) setSettled({ loader, attempt, result: { ok: true, data } });
      },
      (error: unknown) => {
        if (active) setSettled({ loader, attempt, result: { ok: false, error } });
      },
    );

    return () => {
      active = false;
    };
  }, [loader, attempt]);

  if (!loader) return { status: "idle", retry };
  if (!settled || settled.loader !== loader || settled.attempt !== attempt) return { status: "loading", retry };
  return settled.result.ok
    ? { status: "success", data: settled.result.data, retry }
    : { status: "error", error: settled.result.error, retry };
}
