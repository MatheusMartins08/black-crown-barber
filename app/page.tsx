import Hero from "./components/hero";
import FAQSection from "./components/faq-section";
import {
  AboutSection,
  BookingSection,
  FinalCallToAction,
  GallerySection,
  LocationSection,
  QuickInfo,
  ServicesSection,
  TeamSection,
  TestimonialsSection,
} from "./components/landing-sections";
import SiteFooter from "./components/site-footer";
import SiteHeader from "./components/site-header";
import ShopUnavailable, { suspendedShopText } from "./components/shop-unavailable";
import { getSiteConfig, localBusinessDetails } from "./data/site";
import { getPublicOpeningPeriods, getPublicProfessionals, getPublicServices, getPublicSiteImages } from "./lib/catalog";
import { requireCurrentShop } from "./lib/shop";

export default async function Home() {
  const shop = await requireCurrentShop();
  if (shop.status !== "ativa") return <ShopUnavailable {...suspendedShopText} />;

  const site = getSiteConfig(shop);
  const [professionals, siteImages, services, periods] = await Promise.all([
    getPublicProfessionals(shop.id),
    getPublicSiteImages(shop.id),
    getPublicServices(shop.id),
    getPublicOpeningPeriods(shop.id),
  ]);
  const galleryImages = siteImages.filter((image) => image.slot !== "about");
  const aboutImage = siteImages.find((image) => image.slot === "about") ?? null;
  const businessSchema = localBusinessDetails
    ? {
        "@context": "https://schema.org",
        "@type": "BarberShop",
        name: site.name,
        url: localBusinessDetails.url,
        telephone: localBusinessDetails.telephone,
        image: localBusinessDetails.image,
        address: {
          "@type": "PostalAddress",
          streetAddress: localBusinessDetails.streetAddress,
          addressLocality: localBusinessDetails.addressLocality,
          addressRegion: localBusinessDetails.addressRegion,
          postalCode: localBusinessDetails.postalCode,
          addressCountry: localBusinessDetails.addressCountry,
        },
        openingHoursSpecification: localBusinessDetails.openingHoursSpecification.map((hours) => ({
          "@type": "OpeningHoursSpecification",
          ...hours,
        })),
      }
    : null;

  return (
    <>
      {businessSchema ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(businessSchema).replace(/</g, "\\u003c"),
          }}
        />
      ) : null}
      <SiteHeader site={site} />
      <main>
        <Hero site={site} />
        <QuickInfo periods={periods} site={site} />
        <ServicesSection services={services} site={site} />
        <GallerySection images={galleryImages} />
        <AboutSection image={aboutImage} site={site} />
        <TeamSection professionals={professionals} site={site} />
        <TestimonialsSection />
        <BookingSection site={site} />
        <LocationSection periods={periods} site={site} />
        <FAQSection services={services} />
        <FinalCallToAction site={site} />
      </main>
      <SiteFooter periods={periods} site={site} />
    </>
  );
}
