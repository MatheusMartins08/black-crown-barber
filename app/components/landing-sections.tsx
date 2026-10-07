import Image from "next/image";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  Clock3,
  MapPin,
  MessageCircle,
  Star,
} from "lucide-react";
import Reveal from "./reveal";
import ImageComparison from "./image-comparison";
import { DefaultServiceIcon, serviceIcons } from "./service-icons";
import { formatCurrency } from "../data/booking";
import { formatDuration, type Service } from "../data/services";
import { getFirstName, type Professional } from "../data/professionals";
import { galleryLayouts, type SiteImage } from "../data/site-images";
import {
  galleryComparison,
  galleryFeature,
  openingHours,
  siteConfig,
  testimonials,
} from "../data/site";

function SectionHeading({
  eyebrow,
  title,
  description,
  id,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  id: string;
}) {
  return (
    <Reveal as="div" className="section-heading">
      <p className="section-heading__eyebrow" data-anchor-start>{eyebrow}</p>
      <h2 id={id}>{title}</h2>
      {description ? <p className="section-heading__description">{description}</p> : null}
    </Reveal>
  );
}

export function QuickInfo() {
  const details = [
    { icon: MapPin, label: "Localização", value: siteConfig.city },
    { icon: Clock3, label: "Funcionamento", value: "Segunda a sábado" },
    { icon: CalendarDays, label: "Atendimento", value: "Com agendamento" },
    { icon: MessageCircle, label: "Contato", value: siteConfig.whatsapp },
  ];

  return (
    <section aria-label="Informações rápidas" className="quick-info">
      <div className="quick-info__grid">
        {details.map(({ icon: Icon, label, value }, index) => (
          <Reveal className="quick-info__item" delay={1 + (index % 3)} key={label}>
            <Icon aria-hidden="true" className="quick-info__icon" size={18} strokeWidth={1.6} />
            <div>
              <p>{label}</p>
              <span>{value}</span>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/** `services`: os serviços ativos do Supabase, na ordem de exibição. */
export function ServicesSection({ services }: { services: Service[] }) {
  return (
    <section aria-labelledby="services-title" className="section services" id="servicos">
      <div className="section__inner">
        <SectionHeading
          description="Serviços pensados para deixar seu visual em dia."
          eyebrow="Menu da barbearia"
          id="services-title"
          title="Escolha seu próximo visual"
        />
        <div className="services__grid">
          {services.map((service, index) => {
            const Icon = serviceIcons[service.icon] ?? DefaultServiceIcon;

            return (
              <Reveal
                as="article"
                className={`service-card${service.isPopular ? " service-card--popular" : ""}`}
                delay={1 + (index % 3)}
                key={service.id}
              >
                <div className="service-card__topline">
                  <span className="service-card__icon">
                    <Icon aria-hidden="true" size={20} strokeWidth={1.6} />
                  </span>
                  {service.isPopular ? (
                    <span className="service-card__badge">Mais pedido</span>
                  ) : null}
                </div>
                <h3>{service.name}</h3>
                <p className="service-card__description">{service.description}</p>
                <div className="service-card__meta">
                  <span>{formatDuration(service.durationMinutes)}</span>
                  <strong>{formatCurrency(service.price)}</strong>
                </div>
              </Reveal>
            );
          })}
        </div>

        <div className="section-action">
          <Link className="button" href={siteConfig.bookingUrl}>
            Agendar horário <ArrowDownRight aria-hidden="true" size={17} />
          </Link>
        </div>
      </div>
    </section>
  );
}

/** `images`: as posições gallery-1 … gallery-8 de site_images, na ordem do site. */
export function GallerySection({ images }: { images: SiteImage[] }) {
  return (
    <section aria-labelledby="gallery-title" className="section gallery" id="galeria">
      <div className="section__inner">
        <div className="gallery__heading-row">
          <SectionHeading
            description="Confira alguns estilos, acabamentos e detalhes do espaço."
            eyebrow="Portfólio"
            id="gallery-title"
            title="Nosso trabalho fala por nós."
          />
        </div>

        <div className="gallery__feature">
          <ImageComparison {...galleryComparison} />
          <div className="gallery__feature-copy">
            <h3>{galleryFeature.headline}</h3>
            <p>{galleryFeature.description}</p>
          </div>
        </div>

        <div className="gallery__grid">
          {images.map((item, index) => (
            <Reveal
              as="figure"
              className={`gallery-item ${galleryLayouts[item.slot] ?? ""}`}
              delay={1 + (index % 3)}
              key={item.slot}
            >
              <Image
                alt={item.alt}
                className="gallery-item__image"
                fill
                sizes="(max-width: 600px) 50vw, (max-width: 900px) 33vw, 25vw"
                src={item.imageUrl}
                style={{ objectPosition: item.imagePosition }}
              />
              <figcaption>
                <span>{item.label}</span>
                <span className="gallery-item__number">0{index + 1}</span>
              </figcaption>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/** `image`: a posição "about" de site_images (null se não houver: a seção fica sem foto). */
export function AboutSection({ image }: { image: SiteImage | null }) {
  const values = ["Técnica", "Cuidado", "Estilo"];

  return (
    <section aria-labelledby="about-title" className="section about" id="sobre">
      <div className="section__inner about__layout">
        <Reveal className="about__copy" from="left">
          <SectionHeading
            eyebrow="A barbearia"
            id="about-title"
            title="Mais do que uma barbearia."
          />
          <p className="about__text">
            Um bom corte começa com uma boa conversa. Aqui, cada atendimento parte do que combina com você: o caimento, o acabamento e o tempo dedicado a cada detalhe.
          </p>
          <p className="about__text">
            A Black Crown une a experiência de uma barbearia contemporânea às referências clássicas do ofício, com atendimento próximo e tempo para cada cliente.
          </p>
          <ul className="about__values">
            {values.map((value) => (
              <li key={value}><Check aria-hidden="true" size={15} />{value}</li>
            ))}
          </ul>
        </Reveal>
        <Reveal as="figure" className="about__image-wrap" from="right">
          {image ? (
            <Image
              alt={image.alt}
              className="about__image"
              fill
              sizes="(max-width: 800px) 100vw, 50vw"
              src={image.imageUrl}
              style={{ objectPosition: image.imagePosition }}
            />
          ) : null}
        </Reveal>
      </div>
    </section>
  );
}

export function TeamSection({ professionals }: { professionals: Professional[] }) {
  return (
    <section aria-labelledby="team-title" className="section team" id="equipe">
      <div className="section__inner">
        <SectionHeading
          description="Conheça quem cuida do seu estilo."
          eyebrow="Nossa equipe"
          id="team-title"
          title="Técnica em cada detalhe."
        />
        <div className="team__grid">
          {professionals.map((barber, index) => (
            <Reveal as="article" className="barber-card" delay={1 + (index % 3)} key={barber.id}>
              <div className="barber-card__image-wrap">
                {barber.imageUrl ? (
                  <Image
                    alt={barber.imageAlt}
                    className="barber-card__image"
                    fill
                    sizes="(max-width: 600px) 85vw, (max-width: 900px) 45vw, 30vw"
                    src={barber.imageUrl}
                    style={{ objectPosition: barber.imagePosition }}
                  />
                ) : null}
                <span className="barber-card__index">0{index + 1}</span>
              </div>
              <div className="barber-card__body">
                <div>
                  <p className="barber-card__specialty">{barber.specialty}</p>
                  <h3>{barber.name}</h3>
                </div>
                <p>{barber.description}</p>
                <Link href={`${siteConfig.bookingUrl}?profissional=${barber.slug}`}>
                  Agendar com {getFirstName(barber.name)} <ArrowUpRight aria-hidden="true" size={15} />
                </Link>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function TestimonialsSection() {
  return (
    <section aria-labelledby="testimonials-title" className="section testimonials" id="avaliacoes">
      <div className="section__inner">
        <SectionHeading
          description="O que nossos clientes dizem sobre a experiência."
          eyebrow="Avaliações"
          id="testimonials-title"
          title="Quem passa por aqui, volta."
        />
        <div className="testimonials__grid">
          {testimonials.map((testimonial, index) => (
            <Reveal as="article" className="testimonial-card" delay={1 + (index % 3)} key={testimonial.name}>
              <div aria-label="5 de 5 estrelas" className="testimonial-card__stars">
                {Array.from({ length: 5 }, (_, index) => (
                  <Star aria-hidden="true" fill="currentColor" key={index} size={15} strokeWidth={1.5} />
                ))}
              </div>
              <blockquote>“{testimonial.quote}”</blockquote>
              <div className="testimonial-card__attribution">
                <strong>{testimonial.name}</strong>
                <span>{testimonial.context}</span>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function BookingSection() {
  return (
    <section aria-labelledby="booking-title" className="booking" id="agendamento">
      <div aria-hidden="true" className="booking__media">
        <Image
          alt=""
          className="booking__image"
          fill
          sizes="100vw"
          src="/gallery-interior-02.jpg"
        />
      </div>
      <Reveal className="booking__content" from="left">
        <p className="section-heading__eyebrow" data-anchor-start>Seu próximo horário</p>
        <h2 id="booking-title">Seu próximo corte começa aqui.</h2>
        <p>
          Escolha o serviço, encontre um horário e venha conhecer a experiência da {siteConfig.name}.
        </p>
        <div className="booking__actions">
          <Link className="button" href={siteConfig.bookingUrl}>
            Agendar horário <ArrowDownRight aria-hidden="true" size={17} />
          </Link>
          <Link className="button button--outline" href={siteConfig.whatsappUrl}>
            Falar pelo WhatsApp <MessageCircle aria-hidden="true" size={17} />
          </Link>
        </div>
      </Reveal>
    </section>
  );
}

export function LocationSection() {
  return (
    <section aria-labelledby="location-title" className="section location" id="localizacao">
      <div className="section__inner">
        <SectionHeading
          description="Endereço, contato e horários em um só lugar."
          eyebrow="Visite a barbearia"
          id="location-title"
          title="Estamos esperando por você."
        />
        <Reveal className="location__layout">
          <div className="location__details">
            <div className="location__contact" id="contato">
              <div className="location__contact-block">
                <MapPin aria-hidden="true" size={19} />
                <div>
                  <h3>Endereço</h3>
                  <p>{siteConfig.address}<br />{siteConfig.city}</p>
                </div>
              </div>
              <div className="location__contact-block">
                <MessageCircle aria-hidden="true" size={19} />
                <div>
                  <h3>Contato</h3>
                  <p>Telefone: {siteConfig.phone}<br />WhatsApp: {siteConfig.whatsapp}</p>
                  <p>Instagram: {siteConfig.instagram}</p>
                </div>
              </div>
            </div>

            <div className="hours">
              <div className="hours__heading">
                <Clock3 aria-hidden="true" size={18} />
                <h3>Horário de funcionamento</h3>
              </div>
              <dl>
                {openingHours.map((item) => (
                  <div className="hours__row" key={item.day}>
                    <dt>{item.day}</dt>
                    <dd>{item.hours}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          <aside aria-label="Como chegar" className="map-placeholder">
            <div className="map-placeholder__mark"><MapPin aria-hidden="true" size={25} /></div>
            <p className="map-placeholder__title">Como chegar</p>
            <p>Atendimento com hora marcada. Abra a rota direto no seu aplicativo de mapas.</p>
            <span>{siteConfig.address} · {siteConfig.city}</span>
            <a className="text-link" href={siteConfig.mapsUrl} rel="noopener noreferrer" target="_blank">
              Ver rota no Google Maps <ArrowUpRight aria-hidden="true" size={15} />
            </a>
          </aside>
        </Reveal>
      </div>
    </section>
  );
}

export function FinalCallToAction() {
  return (
    <section aria-labelledby="final-cta-title" className="final-cta">
      <Reveal className="final-cta__inner">
        <p className="section-heading__eyebrow">Black Crown Barber</p>
        <h2 id="final-cta-title">Pronto para renovar o visual?</h2>
        <p>Agende seu horário e venha conhecer a experiência Black Crown Barber.</p>
        <Link className="button" href={siteConfig.bookingUrl}>
          Agendar horário <ArrowDownRight aria-hidden="true" size={17} />
        </Link>
      </Reveal>
    </section>
  );
}
