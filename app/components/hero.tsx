import Image from "next/image";
import Link from "next/link";
import { ArrowDownRight } from "lucide-react";
import type { SiteConfig } from "../data/site";

export default function Hero({ site }: { site: SiteConfig }) {
  return (
    <section aria-labelledby="hero-title" className="hero" id="inicio">
      <div className="hero__media">
        <Image
          alt="Barbeiro aparando a barba de um cliente com acabamento preciso"
          className="hero__image"
          fill
          loading="eager"
          sizes="(max-width: 700px) 100vw, 64vw"
          src={site.heroImage}
        />
        <div aria-hidden="true" className="hero__image-shade" />
      </div>

      <div className="hero__content">
        <p className="eyebrow">
          <span aria-hidden="true" className="eyebrow__rule" />
          Barbearia <span aria-hidden="true">/</span> Estilo <span aria-hidden="true">/</span> Precisão
        </p>
        {/* Quebras fixas nos pontos de sentido (globals.css: .hero__line). */}
        <h1 id="hero-title">
          <span className="hero__line">Seu estilo começa</span>{" "}
          <span className="hero__line">na cadeira.</span>
        </h1>
        <p className="hero__description">
          <span className="hero__line">Mais do que um corte,</span>{" "}
          <span className="hero__line">uma experiência pensada nos mínimos detalhes.</span>
        </p>

        <div className="hero__actions">
          <Link className="button" href={site.bookingUrl}>
            Agendar horário
            <ArrowDownRight aria-hidden="true" size={17} strokeWidth={1.8} />
          </Link>
          <Link className="text-link" href={site.servicesUrl}>
            Conhecer serviços
          </Link>
        </div>
      </div>

      <span aria-hidden="true" className="hero__index">
        01 <span /> 07
      </span>
      <Link className="hero__scroll" href="#servicos">
        <span>Explore a barbearia</span>
        <ArrowDownRight aria-hidden="true" size={16} />
      </Link>
    </section>
  );
}