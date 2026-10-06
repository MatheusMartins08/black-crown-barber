# Black Crown Barber

A responsive, single-page barbershop website template built with Next.js. It is designed as a polished starting point for showcasing a shop's services, team, work, and customer information.

> **Demonstration template:** The business name, address, phone number, prices, staff profiles, testimonials, opening hours, and FAQ answers currently in the site are examples. Replace and verify them with the real business details before publishing.

## Website sections

- Hero and key business information
- Services and pricing
- Photo gallery
- About the barbershop and team profiles
- Customer testimonials
- Booking and contact calls to action
- Location, opening hours, frequently asked questions, and footer
- Step-by-step booking flow at `/agendamento` (service, professional, date and time, contact details, review)

## Tech stack

- [Next.js](https://nextjs.org/) App Router
- [React](https://react.dev/) and [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/) 4
- [Lucide React](https://lucide.dev/) icons

## Getting started

You will need Node.js and npm installed. From the project directory, install the dependencies and start the development server:

```bash
npm ci
cp .env.example .env.local   # then fill in the Supabase values
npm run dev
```

The site reads and writes data in Supabase (schema and setup in [`supabase/README.md`](supabase/README.md)). `.env.local` needs:

| Variable | Where it is used |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser and server |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser and server (public key; access is enforced by RLS) |
| `SUPABASE_SECRET_KEY` | Server only. Creates subscriber logins and resets their passwords. Never prefix it with `NEXT_PUBLIC_` |

The admin panel lives at `/painel` and requires a staff login (`/painel/entrar`).

Open [http://localhost:3000](http://localhost:3000) to view the site. The development server refreshes the page as you edit the source files.

## Available commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the local development server. |
| `npm run lint` | Run ESLint. |
| `npm run build` | Create a production build. |
| `npm run start` | Serve the production build; run `npm run build` first. |

## Project structure

```text
app/
	agendamento/      Booking page: flow components, styles, and the scheduling adapter (lib/)
	components/       Page sections and shared UI components
	data/site.ts      Business details and content used across the site
	data/booking.ts   Booking rules: service durations and prices, booking window, validation
	globals.css       Global styles, theme, and responsive presentation
	layout.tsx        Root layout, fonts, and page metadata
	page.tsx          Landing page structure and section order
public/             Photos and other static assets
```

## Customizing the template

1. **Update business content** in `app/data/site.ts`. This file contains the shop details, navigation, services, gallery items, barber profiles, testimonials, opening hours, and FAQ content.
2. **Replace the photography** in `public/`, then update the corresponding image paths and alternative text in `app/data/site.ts`.
3. **Adjust the page structure** in `app/page.tsx` and the relevant components in `app/components/`.
4. **Update the visual style** in `app/globals.css` to match the business brand.
5. **Review page metadata** in `app/layout.tsx`, including the title, description, social sharing details, and indexing settings.

## Before publishing

- Replace all demonstration business details, prices, hours, staff descriptions, testimonials, and FAQ answers with confirmed information.
- Use photos the business has permission to publish and provide accurate alt text.
- Set real WhatsApp, social media, and map destinations. The WhatsApp URL is a placeholder in-page anchor; no messaging or map service is integrated.
- Enable the post-booking actions (WhatsApp, calendar, reschedule, cancel) in `app/agendamento/lib/booking-integrations.ts`. Availability and reservations already come from Supabase (`app/agendamento/lib/booking-api.ts`).
- Review metadata and search indexing settings in `app/layout.tsx`. The current metadata sets `noindex` and `nofollow`, so search engines are asked not to index or follow links on the site.
- If using the optional LocalBusiness structured data, add and verify the business details in `app/data/site.ts`; it is currently disabled (`null`).
- Run `npm run lint` and `npm run build` before deployment.

## Deployment

This is a standard Next.js application and can be deployed to a platform that supports Next.js, such as [Vercel](https://vercel.com/). On Vercel, add the three Supabase variables above in **Settings → Environment Variables** (mark `SUPABASE_SECRET_KEY` as Sensitive) and redeploy. Follow the deployment instructions for your chosen provider, and verify the production URL, metadata, contact links, and indexing settings after deployment.
