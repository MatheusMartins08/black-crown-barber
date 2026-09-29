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

export default function Home() {
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
        <QuickInfo />
        <ServicesSection />
        <GallerySection />
        <AboutSection />
        <TeamSection />
        <TestimonialsSection />
        <BookingSection />
        <LocationSection />
        <FAQSection />
        <FinalCallToAction />
      </main>
      <SiteFooter />
    </>
  );
}
