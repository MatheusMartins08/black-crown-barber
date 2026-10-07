"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { CircleAlert, ImageUp, Undo2 } from "lucide-react";
import { formatBytes, imageRules, validateImageFile } from "../../data/site-media";

// Troca de foto nos formulários da Edição do site (barbeiros, galeria, foto da barbearia):
// foto atual → escolher nova → validar → prévia (com a atual ao lado) → enquadramento.
// Nada é enviado aqui: o formulário envia o arquivo só ao salvar.

export type PhotoDraft = ReturnType<typeof usePhotoDraft>;

/** Estado da troca de foto. `savedPositionY` é o enquadramento da foto atual. */
export function usePhotoDraft(savedPositionY: number) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [positionY, setPositionY] = useState(savedPositionY);

  // Libera a prévia da memória ao trocar de arquivo ou fechar.
  useEffect(() => () => (preview ? URL.revokeObjectURL(preview) : undefined), [preview]);

  function choose(next: File | undefined) {
    if (!next) return;
    const problem = validateImageFile(next);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setFile(next);
    setPreview(URL.createObjectURL(next));
    // Foto nova começa centralizada; a atual mantém o enquadramento salvo.
    setPositionY(50);
  }

  function undo() {
    setFile(null);
    setPreview(null);
    setError(null);
    setPositionY(savedPositionY);
  }

  return { file, preview, error, positionY, setPositionY, choose, undo };
}

export function PhotoField({
  draft,
  currentSrc,
  disabled,
  label = "Foto",
  aspectRatio = 1.1,
  hint,
}: {
  draft: PhotoDraft;
  /** Foto salva hoje (caminho local ou URL do bucket). */
  currentSrc: string | null;
  disabled: boolean;
  label?: string;
  /** Proporção aproximada de onde a foto aparece no site, para a prévia. */
  aspectRatio?: number;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const imageSrc = draft.preview ?? currentSrc;

  return (
    <div className="admin-field admin-dialog__field">
      <span>{label}</span>
      <div className="admin-photo">
        <div className="admin-photo__frame" style={{ "--photo-ratio": aspectRatio } as CSSProperties}>
          {imageSrc ? (
            // Prévia local (blob:) ou a foto atual; o site usa next/image com o mesmo enquadramento.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt=""
              className="admin-photo__image"
              src={imageSrc}
              style={{ objectPosition: `50% ${draft.positionY}%` }}
            />
          ) : (
            <span className="admin-photo__empty">
              <ImageUp aria-hidden="true" size={22} strokeWidth={1.6} />
              Sem foto
            </span>
          )}
          {draft.file ? <span className="admin-photo__badge">Nova · ainda não salva</span> : null}
        </div>

        {draft.file && currentSrc ? (
          <p className="admin-photo__current">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="" src={currentSrc} />
            <span>Atual: continua no site até você salvar.</span>
          </p>
        ) : null}

        <div className="admin-photo__controls">
          <label className="admin-toggle-button admin-photo__pick">
            <ImageUp aria-hidden="true" size={15} />
            {imageSrc ? "Substituir imagem" : "Escolher imagem"}
            <input
              accept={imageRules.accept}
              className="sr-only"
              disabled={disabled}
              onChange={(event) => {
                draft.choose(event.target.files?.[0]);
                if (inputRef.current) inputRef.current.value = "";
              }}
              ref={inputRef}
              type="file"
            />
          </label>
          {draft.file ? (
            <button className="admin-text-button admin-row__action" disabled={disabled} onClick={draft.undo} type="button">
              <Undo2 aria-hidden="true" size={15} />
              Cancelar troca
            </button>
          ) : null}
        </div>

        {draft.error ? (
          <p className="admin-field__error" role="alert">
            <CircleAlert aria-hidden="true" size={13} />
            {draft.error}
          </p>
        ) : (
          <p className="admin-field__hint">
            {hint ? `${hint} ` : ""}JPEG, PNG, WebP ou AVIF, até {formatBytes(imageRules.maxBytes)}.
          </p>
        )}

        {imageSrc ? (
          <label className="admin-photo__position">
            <span>Enquadramento</span>
            <input
              aria-valuetext={`${draft.positionY}% da altura`}
              disabled={disabled}
              max={100}
              min={0}
              onChange={(event) => draft.setPositionY(Number(event.target.value))}
              type="range"
              value={draft.positionY}
            />
          </label>
        ) : null}
      </div>
    </div>
  );
}
