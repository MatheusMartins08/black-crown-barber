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
  Scissors,
  Shield,
  Sparkles,
  Star,
  UserRound,
} from "lucide-react";
import Reveal from "./reveal";
import {
  barbers,
  galleryItems,
  openingHours,
  services,
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
      <p className="section-heading__eyebrow">{eyebrow}</p>
      <h2 id={id}>{title}</h2>
      {description ? <p className="section-heading__description">{description}</p> : null}
    </Reveal>
  );
}

const serviceIcons = {
  scissors: Scissors,
  razor: Shield,
  combo: Sparkles,
  detail: UserRound,
};

export function QuickInfo() {
  const details = [
    { icon: MapPin, label: "Localização", value: `${siteConfig.city} · demonstrativo` },
    { icon: Clock3, label: "Funcionamento", value: "Segunda a sábado" },
    { icon: CalendarDays, label: "Atendimento", value: "Com agendamento" },
    { icon: MessageCircle, label: "Contato", value: "WhatsApp demonstrativo" },
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
      <p className="demo-ribbon">Informações demonstrativas · substitua pelos dados confirmados da barbearia</p>
    </section>
  );
}

export function ServicesSection() {
  return (
    <section aria-labelledby="services-title" className="section services" id="servicos">
      <div className="section__inner">
        <SectionHeading
          description="Serviços pensados para deixar seu visual em dia."
          eyebrow="Menu da barbearia"
          id="services-title"
          title="Escolha seu próximo visual"
        />
        <p className="section-note">Valores e durações demonstrativos.</p>

        <div className="services__grid">
          {services.map((service, index) => {
            const Icon = serviceIcons[service.icon];

            return (
              <Reveal
                as="article"
                className={`service-card${"popular" in service && service.popular ? " service-card--popular" : ""}`}
                delay={1 + (index % 3)}
                key={service.name}
              >
                <div className="service-card__topline">
                  <span className="service-card__icon">
                    <Icon aria-hidden="true" size={20} strokeWidth={1.6} />
                  </span>
                  {"popular" in service && service.popular ? (
                    <span className="service-card__badge">Mais pedido</span>
                  ) : null}
                </div>
                <h3>{service.name}</h3>
                <p className="service-card__description">{service.description}</p>
                <div className="service-card__meta">
                  <span>{service.duration}</span>
                  <strong>{service.price}</strong>
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

export function GallerySection() {
  return (
    <section aria-labelledby="gallery-title" className="section gallery" id="galeria">
      <div className="section__inner">
        <div className="gallery__heading-row">
          <SectionHeading
            description="Confira alguns estilos, acabamentos e detalhes do espaço."
            eyebrow="Portfólio demonstrativo"
            id="gallery-title"
            title="Nosso trabalho fala por nós."
          />
          <p className="gallery__aside">Imagens ilustrativas<br />substitua por trabalhos autorizados</p>
        </div>

        <div className="gallery__grid">
          {galleryItems.map((item, index) => (
            <Reveal as="figure" className={`gallery-item ${item.layout}`} delay={1 + (index % 3)} key={item.src}>
              <Image
                alt={item.alt}
                className="gallery-item__image"
                fill
                sizes="(max-width: 600px) 50vw, (max-width: 900px) 33vw, 25vw"
                src={item.src}
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

export function AboutSection() {
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
            A Black Crown é uma marca demonstrativa, criada para apresentar uma experiência de barbearia contemporânea com referências clássicas e atendimento próximo.
          </p>
          <ul className="about__values">
            {values.map((value) => (
              <li key={value}><Check aria-hidden="true" size={15} />{value}</li>
            ))}
          </ul>
        </Reveal>
        <Reveal as="figure" className="about__image-wrap" from="right">
          <Image
            alt="Interior de barbearia com cadeiras de barbeiro e quadros nas paredes"
            className="about__image"
            fill
            sizes="(max-width: 800px) 100vw, 50vw"
            src="/gallery-interior-01.jpg"
          />
          <figcaption>Ambiente ilustrativo · substitua por fotografia do estabelecimento</figcaption>
        </Reveal>
      </div>
    </section>
  );
}

export function TeamSection() {
  return (
    <section aria-labelledby="team-title" className="section team" id="equipe">
      <div className="section__inner">
        <SectionHeading
          description="Conheça quem cuida do seu estilo."
          eyebrow="Equipe demonstrativa"
          id="team-title"
          title="Técnica em cada detalhe."
        />
        <div className="team__grid">
          {barbers.map((barber, index) => (
            <Reveal as="article" className="barber-card" delay={1 + (index % 3)} key={barber.name}>
              <div className="barber-card__image-wrap">
                <Image
                  alt={barber.imageAlt}
                  className="barber-card__image"
                  fill
                  sizes="(max-width: 600px) 85vw, (max-width: 900px) 45vw, 30vw"
                  src={barber.image}
                />
                <span className="barber-card__index">0{index + 1}</span>
              </div>
              <div className="barber-card__body">
                <div>
                  <p className="barber-card__specialty">{barber.specialty}</p>
                  <h3>{barber.name}</h3>
                </div>
                <p>{barber.description}</p>
                <Link href={siteConfig.bookingUrl}>
                  Agendar com {barber.name.split(" ")[0]} <ArrowUpRight aria-hidden="true" size={15} />
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
          description="Relatos fictícios, incluídos apenas para demonstrar esta seção."
          eyebrow="Prova social demonstrativa"
          id="testimonials-title"
          title="Quem passa por aqui, volta."
        />
        <div className="testimonials__grid">
          {testimonials.map((testimonial, index) => (
            <Reveal as="article" className="testimonial-card" delay={1 + (index % 3)} key={testimonial.name}>
              <div aria-label="5 de 5 estrelas, exemplo fictício" className="testimonial-card__stars">
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
        <p className="section-heading__eyebrow">Seu próximo horário</p>
        <h2 id="booking-title">Seu próximo corte começa aqui.</h2>
        <p>
          Escolha o serviço, encontre um horário e venha conhecer a experiência demonstrativa da {siteConfig.name}.
        </p>
        <div className="booking__actions">
          <Link className="button" href={siteConfig.bookingUrl}>
            Agendar horário <ArrowDownRight aria-hidden="true" size={17} />
          </Link>
          <Link className="button button--outline" href={siteConfig.whatsappUrl}>
            Falar pelo WhatsApp <MessageCircle aria-hidden="true" size={17} />
          </Link>
        </div>
        <span className="booking__note">Links demonstrativos · configurar agenda e WhatsApp antes de publicar</span>
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
                  <h3>Endereço demonstrativo</h3>
                  <p>{siteConfig.address}<br />{siteConfig.city}</p>
                </div>
              </div>
              <div className="location__contact-block">
                <MessageCircle aria-hidden="true" size={19} />
                <div>
                  <h3>Contato demonstrativo</h3>
                  <p>Telefone: {siteConfig.phone}<br />WhatsApp: {siteConfig.whatsapp}</p>
                  <p>Instagram: {siteConfig.instagram}</p>
                </div>
              </div>
              <p className="location__demo-warning">Dados fictícios. Substitua por canais oficiais antes de publicar.</p>
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
              <p className="section-note">Horários demonstrativos.</p>
            </div>
          </div>

          <aside aria-label="Espaço reservado para mapa" className="map-placeholder">
            <div className="map-placeholder__mark"><MapPin aria-hidden="true" size={25} /></div>
            <p className="map-placeholder__title">Mapa a configurar</p>
            <p>Adicione aqui o mapa do endereço real do estabelecimento.</p>
            <span>{siteConfig.city} · local demonstrativo</span>
            <Link className="text-link" href="#localizacao">
              Configurar rota no Maps <ArrowUpRight aria-hidden="true" size={15} />
            </Link>
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
        <p>Agende seu horário e venha conhecer a experiência demonstrativa Black Crown Barber.</p>
        <Link className="button" href={siteConfig.bookingUrl}>
          Agendar horário <ArrowDownRight aria-hidden="true" size={17} />
        </Link>
      </Reveal>
    </section>
  );
}