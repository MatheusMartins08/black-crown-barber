"use client";

import { useEffect, useRef, type ElementType, type ReactNode } from "react";

type RevealProps = {
  as?: ElementType;
  children: ReactNode;
  className?: string;
  delay?: number;
  from?: "up" | "left" | "right";
  [key: string]: unknown;
};

export default function Reveal({
  as: Tag = "div",
  children,
  className = "",
  delay = 0,
  from = "up",
  ...rest
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const reveal = () => {
      node.classList.remove("reveal--pending");
      node.classList.add("is-visible");
    };

    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !("IntersectionObserver" in window)
    ) {
      reveal();
      return;
    }

    node.classList.add("reveal--pending");

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            reveal();
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const directionClass = from === "up" ? "" : `reveal--${from}`;
  const delayClass = delay ? `reveal--delay-${delay}` : "";

  return (
    <Tag
      className={["reveal", directionClass, delayClass, className].filter(Boolean).join(" ")}
      ref={ref}
      {...rest}
    >
      {children}
    </Tag>
  );
}
