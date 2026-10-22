import type { Metadata } from "next";
import { isProfessionalChoice, isServiceId } from "../data/booking";
import { describeOpenDays } from "../data/hours";
import ShopUnavailable, { suspendedShopText } from "../components/shop-unavailable";
import { getSiteConfig } from "../data/site";
import { getPublicOpeningPeriods, getPublicPlans, getPublicProfessionals, getPublicServices } from "../lib/catalog";
import { getCurrentShop, requireCurrentShop } from "../lib/shop";
import { BookingCatalogProvider } from "./components/booking-catalog";
import BookingFlow from "./components/booking-flow";
import BookingHeader from "./components/booking-header";
import "./agendamento.css";

export async function generateMetadata(): Promise<Metadata> {
  const name = (await getCurrentShop())?.name ?? "Barbearia";
  return {
    title: "Agendar horário",
    description: `Escolha o serviço, o profissional e o melhor horário para o seu atendimento na ${name}.`,
    robots: {
      index: false,
      follow: false,
    },
  };
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AgendamentoPage({ searchParams }: PageProps<"/agendamento">) {
  const shop = await requireCurrentShop();
  if (shop.status !== "ativa") return <ShopUnavailable {...suspendedShopText} />;

  const site = getSiteConfig(shop);
  const [params, professionals, services, plans, periods] = await Promise.all([
    searchParams,
    getPublicProfessionals(shop.id),
    getPublicServices(shop.id),
    getPublicPlans(shop.id),
    getPublicOpeningPeriods(shop.id),
  ]);
  const serviceParam = firstValue(params.servico);
  const professionalParam = firstValue(params.profissional);

  return (
    <div className="booking-page">
      <BookingHeader brand={site.brand} />
      <main className="booking-page__main">
        <BookingCatalogProvider
          location={[site.address, site.city].filter(Boolean).join(", ")}
          plans={plans}
          professionals={professionals}
          services={services}
        >
          <BookingFlow
            initialProfessionalId={isProfessionalChoice(professionals, professionalParam) ? professionalParam : null}
            initialServiceId={isServiceId(services, serviceParam) ? serviceParam : null}
          />
        </BookingCatalogProvider>
      </main>
      <footer className="booking-footer">
        <div className="booking-footer__inner">
          <span>
            {site.name} · {site.address}, {site.city}
          </span>
          <span>{describeOpenDays(periods)}</span>
        </div>
      </footer>
    </div>
  );
}
