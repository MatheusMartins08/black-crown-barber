"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useId, useState, type CSSProperties, type PointerEvent } from "react";

type ComparisonImage = { src: string; alt: string; label: string };

type ImageComparisonProps = {
  title: string;
  before: ComparisonImage;
  after: ComparisonImage;
  instruction: string;
  caption: string;
  controlLabel: string;
};

export default function ImageComparison({
  title,
  before,
  after,
  instruction,
  caption,
  controlLabel,
}: ImageComparisonProps) {
  const [position, setPosition] = useState(50);
  const instructionId = useId();

  function updatePosition(event: PointerEvent<HTMLInputElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width) return;
    setPosition(Math.round(Math.max(0, Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100))));
  }

  function startDragging(event: PointerEvent<HTMLInputElement>) {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    updatePosition(event);
  }

  function stopDragging(event: PointerEvent<HTMLInputElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <figure className="image-comparison">
      <h3 className="image-comparison__title">{title}</h3>
      <div
        className="image-comparison__stage"
        style={{ "--comparison-position": `${position}%` } as CSSProperties}
      >
        <Image alt={after.alt} className="image-comparison__image" draggable={false} fill loading="lazy" sizes="(max-width: 700px) calc(100vw - 40px), (max-width: 850px) min(780px, 90svh, calc(100vw - 48px)), min(780px, 90svh, calc((100vw - 96px) / 2), 636px)" src={after.src} />
        <div className="image-comparison__before">
          <Image alt={before.alt} className="image-comparison__image" draggable={false} fill loading="lazy" sizes="(max-width: 700px) calc(100vw - 40px), (max-width: 850px) min(780px, 90svh, calc(100vw - 48px)), min(780px, 90svh, calc((100vw - 96px) / 2), 636px)" src={before.src} />
        </div>
        <span aria-hidden="true" className="image-comparison__label image-comparison__label--before">{before.label}</span>
        <span aria-hidden="true" className="image-comparison__label image-comparison__label--after">{after.label}</span>
        <div aria-hidden="true" className="image-comparison__divider">
          <span className="image-comparison__handle">
            <ChevronLeft size={18} /><ChevronRight size={18} />
          </span>
        </div>
        <input
          aria-describedby={instructionId}
          aria-label={controlLabel}
          aria-valuetext={`${before.label}: ${position}%; ${after.label}: ${100 - position}%`}
          className="image-comparison__control"
          max={100}
          min={0}
          onChange={(event) => setPosition(Number(event.currentTarget.value))}
          onPointerCancel={stopDragging}
          onPointerDown={startDragging}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) updatePosition(event);
          }}
          onPointerUp={stopDragging}
          step={1}
          type="range"
          value={position}
        />
      </div>
      <figcaption className="image-comparison__caption">
        <span id={instructionId}>{instruction}</span>
        <span>{caption}</span>
      </figcaption>
    </figure>
  );
}
