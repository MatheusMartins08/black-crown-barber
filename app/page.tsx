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
import { localBusinessDetails, siteConfig } from "./data/site";
import { getPublicOpeningPeriods, getPublicProfessionals, getPublicServices, getPublicSiteImages } from "./lib/catalog";

export default async function Home() {
  const [professionals, siteImages, services, periods] = await Promise.all([
    getPublicProfessionals(),
    getPublicSiteImages(),
    getPublicServices(),
    getPublicOpeningPeriods(),
  ]);
  const galleryImages = siteImages.filter((image) => image.slot !== "about");
  const aboutImage = siteImages.find((image) => image.slot === "about") ?? null;
  const businessSchema = localBusinessDetails
    ? {
        "@context": "https://schema.org",
        "@type": "BarberShop",
        name: siteConfig.name,
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
      <SiteHeader />
      <main>
        <Hero />
        <QuickInfo periods={periods} />
        <ServicesSection services={services} />
        <GallerySection images={galleryImages} />
        <AboutSection image={aboutImage} />
        <TeamSection professionals={professionals} />
        <TestimonialsSection />
        <BookingSection />
        <LocationSection periods={periods} />
        <FAQSection />
        <FinalCallToAction />
      </main>
      <SiteFooter periods={periods} />
    </>
  );
}
