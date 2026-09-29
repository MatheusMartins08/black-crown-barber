import Image from "next/image";
import Link from "next/link";
import { ArrowDownRight } from "lucide-react";
import { siteConfig } from "../data/site";

export default function Hero() {
  return (
    <section aria-labelledby="hero-title" className="hero" id="inicio">
      <div className="hero__media">
        <Image
          alt="Retrato demonstrativo de cliente com barba aparada"
          className="hero__image"
          fill
          loading="eager"
          sizes="(max-width: 700px) 100vw, 64vw"
          src={siteConfig.heroImage}
        />
        <div aria-hidden="true" className="hero__image-shade" />
      </div>

      <div className="hero__content">
        <p className="eyebrow">
          <span aria-hidden="true" className="eyebrow__rule" />
          Barbearia <span aria-hidden="true">/</span> Estilo <span aria-hidden="true">/</span> Precisão
        </p>
        <h1 id="hero-title">Seu estilo começa na cadeira.</h1>
        <p className="hero__description">
          Mais do que um corte, uma experiência pensada nos mínimos detalhes.
        </p>

        <div className="hero__actions">
          <Link className="button" href={siteConfig.bookingUrl}>
            Agendar horário
            <ArrowDownRight aria-hidden="true" size={17} strokeWidth={1.8} />
          </Link>
          <Link className="text-link" href={siteConfig.servicesUrl}>
            Conhecer serviços
          </Link>
        </div>

        <p className="hero__demo-note">
          Demonstração · links de atendimento a configurar
        </p>
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