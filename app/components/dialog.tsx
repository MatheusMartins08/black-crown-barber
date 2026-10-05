"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  /** Classe visual da rota (booking-dialog, admin-dialog). */
  className: string;
  labelledBy: string;
  describedBy?: string;
  /** Recebe o foco ao abrir. Padrão: o primeiro campo ou botão do conteúdo. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
};

const closeDuration = 160;

/**
 * Modal sobre o <dialog> nativo: foco preso no conteúdo, Esc e clique no fundo fecham,
 * e o foco volta para quem abriu. O visual fica no CSS de cada rota; o conteúdo deve
 * ficar dentro de um único filho, para que só o fundo seja o próprio <dialog>.
 */
export default function Dialog({
  open,
  onClose,
  className,
  labelledBy,
  describedBy,
  initialFocusRef,
  children,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const pointerStartedOnBackdrop = useRef(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      dialog.classList.remove("is-closing");
      if (dialog.open) return;
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      const target =
        initialFocusRef?.current ??
        dialog.querySelector<HTMLElement>("input:not([type='hidden']), select, textarea, [data-autofocus]");
      target?.focus();
      return;
    }

    if (!dialog.open) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    dialog.classList.add("is-closing");
    const timer = window.setTimeout(
      () => {
        dialog.classList.remove("is-closing");
        dialog.close();
        returnFocusRef.current?.focus({ preventScroll: true });
      },
      reducedMotion ? 0 : closeDuration,
    );
    return () => window.clearTimeout(timer);
  }, [open, initialFocusRef]);

  return (
    <dialog
      aria-describedby={describedBy}
      aria-labelledby={labelledBy}
      className={className}
      onCancel={(event) => {
        // Esc: fecha pelo estado, para a animação de saída rodar.
        event.preventDefault();
        onCloseRef.current();
      }}
      onClose={() => {
        // Fechado pelo navegador sem passar pelo estado (ex.: Esc repetido).
        if (open) onCloseRef.current();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && pointerStartedOnBackdrop.current) onCloseRef.current();
      }}
      onPointerDown={(event) => {
        pointerStartedOnBackdrop.current = event.target === event.currentTarget;
      }}
      ref={dialogRef}
    >
      {children}
    </dialog>
  );
}
