"use client";

import Image from "next/image";
import { useId, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, ImageUp } from "lucide-react";
import Dialog from "../../components/dialog";
import { getPositionY } from "../../data/professionals";
import {
  describeSlotFormat,
  galleryLayouts,
  getSlotFolder,
  siteImageLimits,
  validateSiteImage,
  type SiteImage,
  type SiteImageErrors,
} from "../../data/site-images";
import { uploadSiteImage } from "../lib/image-upload";
import { saveSiteImageAction, type SiteActionResult } from "../site-actions";
import { DialogFrame, Field, FormAlert, SubmitButton, useDialogIds, type DialogIds } from "./admin-form";
import { PhotoField, usePhotoDraft } from "./admin-photo-field";

type Notice = { tone: "success" | "error"; message: string } | null;

const unexpected = "Não foi possível falar com o servidor. Verifique a conexão e tente de novo.";

// Proporção aproximada de cada formato no site (desktop), só para a prévia do painel.
const previewRatios: Record<string, number> = {
  "gallery-item--large": 1.3,
  "gallery-item--portrait": 0.7,
  "gallery-item--wide": 0.9,
};

function getPreviewRatio(image: SiteImage) {
  if (image.slot === "about") return 0.94;
  return previewRatios[galleryLayouts[image.slot]] ?? 1.4;
}

function getTitle(image: SiteImage) {
  return image.slot === "about" ? "Imagem da barbearia" : `Galeria ${String(image.sortOrder).padStart(2, "0")} · ${image.label}`;
}

/**
 * Edição do site > Imagens: as 8 fotos da galeria e a da seção "A barbearia". Cada
 * posição tem formato fixo no layout; aqui se troca a foto, a legenda e a descrição.
 * Fundos e o comparador Antes/Depois não são editáveis.
 */
export default function SiteImages({ images }: { images: SiteImage[] }) {
  const router = useRouter();
  const [notice, setNotice] = useState<Notice>(null);
  const [refreshing, startRefresh] = useTransition();
  const [editing, setEditing] = useState<SiteImage | null>(null);
  const [open, setOpen] = useState(false);
  const [openKey, setOpenKey] = useState(0);

  const about = images.find((image) => image.slot === "about") ?? null;
  const gallery = images.filter((image) => image.slot !== "about");

  function edit(image: SiteImage) {
    setEditing(image);
    setOpenKey((key) => key + 1);
    setOpen(true);
  }

  function card(image: SiteImage) {
    return (
      <li key={image.slot}>
        <button
          className="admin-image-card"
          disabled={refreshing}
          onClick={() => edit(image)}
          type="button"
        >
          <span className="admin-image-card__media">
            <Image
              alt=""
              className="admin-image-card__image"
              fill
              sizes="(max-width: 760px) 45vw, 220px"
              src={image.imageUrl}
              style={{ objectPosition: image.imagePosition }}
            />
            {image.slot !== "about" ? (
              <span className="admin-image-card__number">{String(image.sortOrder).padStart(2, "0")}</span>
            ) : null}
          </span>
          <span className="admin-image-card__body">
            <span className="admin-image-card__title">{image.slot === "about" ? "A barbearia" : image.label}</span>
            <span className="admin-image-card__meta">{describeSlotFormat(image.slot)}</span>
            <span className="admin-image-card__action">
              <ImageUp aria-hidden="true" size={14} />
              Substituir
              <span className="sr-only"> {getTitle(image)}</span>
            </span>
          </span>
        </button>
      </li>
    );
  }

  return (
    <section aria-labelledby="imagens-title" className="admin-panel admin-site">
      <div className="admin-panel__heading">
        <div>
          <h2 id="imagens-title">Imagens do site</h2>
          <p>Toque numa imagem para substituir. A atual continua no site até você salvar a nova.</p>
        </div>
      </div>

      {notice ? (
        <div
          className={`admin-alert${notice.tone === "success" ? " admin-alert--success" : ""}`}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          {notice.tone === "success" ? (
            <CircleCheck aria-hidden="true" size={16} />
          ) : (
            <CircleAlert aria-hidden="true" size={16} />
          )}
          <span>{notice.message}</span>
          <button className="admin-text-button" onClick={() => setNotice(null)} type="button">
            Fechar
          </button>
        </div>
      ) : null}

      <div aria-busy={refreshing || undefined} className="admin-image-groups">
        {about ? (
          <div className="admin-image-group">
            <h3>Seção “A barbearia”</h3>
            <ul className="admin-image-grid">{card(about)}</ul>
          </div>
        ) : null}
        <div className="admin-image-group">
          <h3>Galeria</h3>
          <ul className="admin-image-grid">{gallery.map(card)}</ul>
        </div>
      </div>

      <details className="admin-help">
        <summary>Como funciona</summary>
        <p>
          A galeria tem 8 posições com formatos fixos (destaque grande, vertical, horizontal ou quadrada). Prefira fotos
          que funcionem bem cortadas nesse formato e ajuste o enquadramento antes de salvar.
        </p>
        <p>
          A imagem de fundo do topo do site, o fundo da seção de agendamento e o comparador “Antes e depois” não mudam
          por aqui.
        </p>
      </details>

      <SiteImageDialog
        image={editing}
        onClose={() => setOpen(false)}
        onSaved={(result) => {
          setOpen(false);
          setNotice({ tone: "success", message: result.message });
          startRefresh(() => router.refresh());
        }}
        open={open}
        openKey={openKey}
      />
    </section>
  );
}

function SiteImageForm({
  image,
  dialogIds,
  onClose,
  onSaved,
}: {
  image: SiteImage;
  dialogIds: DialogIds;
  onClose: () => void;
  onSaved: (result: SiteActionResult) => void;
}) {
  const ids = useId();
  const isAbout = image.slot === "about";
  const photo = usePhotoDraft(getPositionY(image.imagePosition));
  const [label, setLabel] = useState(image.label);
  const [alt, setAlt] = useState(image.alt);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState<"upload" | "save" | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const fieldId = (field: string) => `${ids}-${field}`;
  const errors: SiteImageErrors = attempted ? validateSiteImage({ label, alt }) : {};
  const changed =
    photo.file !== null ||
    label.trim() !== image.label ||
    alt.trim() !== image.alt ||
    photo.positionY !== getPositionY(image.imagePosition);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setAttempted(true);
    setFormError(null);

    const problems = validateSiteImage({ label, alt });
    const first = (["label", "alt"] as const).find((field) => problems[field]);
    if (first) {
      document.getElementById(fieldId(first))?.focus();
      return;
    }
    if (!changed) {
      onClose();
      return;
    }

    let stage: "upload" | "save" = "upload";
    try {
      let uploaded: { path: string; url: string } | null = null;
      if (photo.file) {
        setBusy("upload");
        uploaded = await uploadSiteImage(getSlotFolder(image.slot), photo.file);
      }
      stage = "save";
      setBusy("save");
      const result = await saveSiteImageAction({
        slot: image.slot,
        label,
        alt,
        imagePositionY: photo.positionY,
        newImageUrl: uploaded?.url ?? null,
      });
      if (!result.ok) {
        // A ação já descartou a imagem enviada; a atual continua no site.
        setFormError(result.message);
        setBusy(null);
        return;
      }
      onSaved(result);
    } catch (error) {
      // Falha no envio: nada mudou. Sem resposta da gravação, a imagem enviada não é
      // apagada aqui para não quebrar o site caso ela tenha sido salva.
      setFormError(stage === "upload" && error instanceof Error ? error.message : unexpected);
      setBusy(null);
    }
  }

  return (
    <DialogFrame
      description={
        isAbout
          ? "Foto ao lado do texto “Mais do que uma barbearia.”."
          : `Posição ${String(image.sortOrder).padStart(2, "0")} da galeria · formato ${describeSlotFormat(image.slot).toLowerCase()}.`
      }
      descriptionId={dialogIds.descriptionId}
      footer={
        <>
          <button className="admin-text-button" disabled={busy !== null} onClick={onClose} type="button">
            Cancelar
          </button>
          <SubmitButton
            busy={busy !== null}
            busyLabel={busy === "upload" ? "Enviando imagem…" : "Salvando…"}
            label={photo.file ? "Salvar nova imagem" : "Salvar alterações"}
          />
        </>
      }
      onClose={onClose}
      onSubmit={submit}
      title={getTitle(image)}
      titleId={dialogIds.titleId}
    >
      <PhotoField
        aspectRatio={getPreviewRatio(image)}
        currentSrc={image.imageUrl}
        disabled={busy !== null}
        draft={photo}
        label="Imagem"
      />

      {!isAbout ? (
        <Field
          error={errors.label}
          hint="Aparece sobre a foto na galeria."
          id={fieldId("label")}
          label="Legenda"
        >
          <input
            aria-describedby={`${fieldId("label")}-message`}
            aria-invalid={errors.label ? true : undefined}
            autoComplete="off"
            id={fieldId("label")}
            maxLength={siteImageLimits.label}
            onChange={(event) => setLabel(event.target.value)}
            type="text"
            value={label}
          />
        </Field>
      ) : null}

      <Field
        error={errors.alt}
        hint="Descreva o que aparece na foto. É lido por leitores de tela e pelo Google."
        id={fieldId("alt")}
        label="Descrição da imagem"
      >
        <textarea
          aria-describedby={`${fieldId("alt")}-message`}
          aria-invalid={errors.alt ? true : undefined}
          id={fieldId("alt")}
          maxLength={siteImageLimits.alt}
          onChange={(event) => setAlt(event.target.value)}
          rows={2}
          value={alt}
        />
      </Field>

      <FormAlert message={formError} />
    </DialogFrame>
  );
}

function SiteImageDialog({
  open,
  openKey,
  image,
  onClose,
  onSaved,
}: {
  open: boolean;
  openKey: number;
  image: SiteImage | null;
  onClose: () => void;
  onSaved: (result: SiteActionResult) => void;
}) {
  const dialogIds = useDialogIds();
  return (
    <Dialog
      className="admin-dialog"
      describedBy={dialogIds.descriptionId}
      labelledBy={dialogIds.titleId}
      onClose={onClose}
      open={open}
    >
      {image ? (
        <SiteImageForm dialogIds={dialogIds} image={image} key={openKey} onClose={onClose} onSaved={onSaved} />
      ) : null}
    </Dialog>
  );
}
