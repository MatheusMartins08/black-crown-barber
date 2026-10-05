"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SubscriberSession } from "../../data/subscribers";
import { getSubscriberSession, signInSubscriber, signOutSubscriber } from "../../lib/subscribers-api";

export type SubscriberSessionState = {
  /** "loading" até a sessão salva ser conferida no adaptador. */
  status: "loading" | "ready";
  session: SubscriberSession | null;
};

/**
 * Sessão do assinante no agendamento. Ao montar, confere a sessão salva (com plano e
 * situação atualizados). `onMissing` roda quando não há sessão válida, para o fluxo
 * descartar um rascunho de assinante.
 */
export default function useSubscriberSession(onMissing?: () => void) {
  const [state, setState] = useState<SubscriberSessionState>({ status: "loading", session: null });
  const onMissingRef = useRef(onMissing);

  useEffect(() => {
    onMissingRef.current = onMissing;
  });

  useEffect(() => {
    let active = true;

    getSubscriberSession()
      .catch(() => null)
      .then((session) => {
        if (!active) return;
        setState({ status: "ready", session });
        if (!session) onMissingRef.current?.();
      });

    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(async (credentials: { phone: string; password: string }) => {
    const session = await signInSubscriber(credentials);
    setState({ status: "ready", session });
    return session;
  }, []);

  const signOut = useCallback(async () => {
    await signOutSubscriber();
    setState({ status: "ready", session: null });
  }, []);

  return { ...state, signIn, signOut };
}
