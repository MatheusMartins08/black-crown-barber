import type { Metadata } from "next";
import { isProfessionalChoice, isServiceId } from "../data/booking";
import { openingHours, siteConfig } from "../data/site";
import { getPublicPlans, getPublicProfessionals, getPublicServices } from "../lib/catalog";
import { BookingCatalogProvider } from "./components/booking-catalog";
import BookingFlow from "./components/booking-flow";
import BookingHeader from "./components/booking-header";
import "./agendamento.css";

export const metadata: Metadata = {
  title: "Agendar horário | Black Crown Barber",
  description: "Escolha o serviço, o profissional e o melhor horário para o seu atendimento na Black Crown Barber.",
  robots: {
    index: false,
    follow: false,
  },
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AgendamentoPage({ searchParams }: PageProps<"/agendamento">) {
  const [params, professionals, services, plans] = await Promise.all([
    searchParams,
    getPublicProfessionals(),
    getPublicServices(),
    getPublicPlans(),
  ]);
  const serviceParam = firstValue(params.servico);
  const professionalParam = firstValue(params.profissional);
  const openDays = openingHours.filter((item) => item.hours !== "Fechado");

  return (
    <div className="booking-page">
      <BookingHeader />
      <main className="booking-page__main">
        <BookingCatalogProvider plans={plans} professionals={professionals} services={services}>
          <BookingFlow
            initialProfessionalId={isProfessionalChoice(professionals, professionalParam) ? professionalParam : null}
            initialServiceId={isServiceId(services, serviceParam) ? serviceParam : null}
          />
        </BookingCatalogProvider>
      </main>
      <footer className="booking-footer">
        <div className="booking-footer__inner">
          <span>
            {siteConfig.name} · {siteConfig.address}, {siteConfig.city}
          </span>
          <span>
            {openDays[0]?.day.replace("-feira", "")} a {openDays.at(-1)?.day.toLowerCase()}
          </span>
        </div>
      </footer>
    </div>
  );
}
