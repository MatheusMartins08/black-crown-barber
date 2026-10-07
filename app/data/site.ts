const address = "Rua Exemplo, 123";
const city = "Belo Horizonte - MG";

export const siteConfig = {
  name: "Black Crown Barber",
  description:
    "Cortes masculinos, barba e cuidado em uma barbearia de estilo clássico e contemporâneo.",
  city,
  address,
  mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${address}, ${city}`)}`,
  phone: "(31) 99999-9999",
  whatsapp: "(31) 99999-9999",
  instagram: "@blackcrownbarber",
  bookingUrl: "/agendamento",
  whatsappUrl: "#contato",
  servicesUrl: "#servicos",
  heroImage: "/gallery-barba-01.jpg",
  isDemonstration: true,
};

export const navigationItems = [
  { label: "Início", href: "#inicio" },
  { label: "Serviços", href: "#servicos" },
  { label: "Galeria", href: "#galeria" },
  { label: "A barbearia", href: "#sobre" },
  { label: "Barbeiros", href: "#equipe" },
  { label: "Avaliações", href: "#avaliacoes" },
  { label: "Localização", href: "#localizacao" },
];

export const footerNavigationItems = [
  ...navigationItems,
  { label: "Perguntas frequentes", href: "#faq" },
];

export const services = [
  {
    id: "corte",
    name: "Corte masculino",
    description: "Corte personalizado, acabamento e finalização.",
    duration: "30 min",
    price: "R$ 55",
    icon: "scissors",
  },
  {
    id: "barba",
    name: "Barba",
    description: "Modelagem, toalha quente e acabamento preciso.",
    duration: "30 min",
    price: "R$ 45",
    icon: "mustache",
  },
  {
    id: "corte-barba",
    name: "Corte + barba",
    description: "Cuidado completo para cabelo e barba.",
    duration: "50 min",
    price: "R$ 90",
    icon: "razor",
    popular: true,
  },
  {
    id: "sobrancelha",
    name: "Sobrancelha",
    description: "Design e limpeza para um acabamento natural.",
    duration: "15 min",
    price: "R$ 25",
    icon: "eyebrow",
  },
] as const;

export const galleryComparison = {
  title: "Cabelo e barba",
  before: {
    src: "/gallery-combined-before.png",
    alt: "Homem sentado na cadeira de barbearia, em três quartos lateral, com cabelo moderadamente crescido e barba sem acabamento",
    label: "Antes",
  },
  after: {
    src: "/gallery-combined-after.png",
    alt: "Mesmo homem sentado na cadeira com corte degradê, topo finalizado e barba aparada com contornos definidos",
    label: "Depois",
  },
  instruction: "Arraste para comparar · ou use as setas do teclado",
  controlLabel: "Comparar antes e depois do corte de cabelo e acabamento da barba",
} as const;

export const galleryFeature = {
  headline: "Seu melhor visual. Sua melhor versão.",
  description: "Um corte preciso. Uma barba alinhada. Uma nova presença.",
} as const;

export const galleryItems = [
  {
    src: "/gallery-corte-01.jpg",
    alt: "Barbeiro refinando um corte masculino com tesoura e pente",
    label: "Acabamento",
    layout: "gallery-item--large",
  },
  {
    src: "/gallery-barba-01.jpg",
    alt: "Barbeiro aparando o cabelo e a barba de um cliente com navalha",
    label: "Barba",
    layout: "gallery-item--portrait",
  },
  {
    src: "/gallery-corte-02.jpg",
    alt: "Barbeiro trabalhando o corte de um cliente na cadeira com tesoura",
    label: "Corte",
    layout: "",
  },
  {
    src: "/gallery-interior-01.jpg",
    alt: "Barbearia com cadeiras de barbeiro e quadros nas paredes",
    label: "Ambiente",
    layout: "gallery-item--wide",
  },
  {
    src: "/gallery-corte-03.jpg",
    alt: "Barbeiro finalizando o penteado de um cliente com secador",
    label: "Estilo",
    layout: "",
  },
  {
    src: "/gallery-corte-04.jpg",
    alt: "Barbeiro aparando o cabelo de um cliente com máquina",
    label: "Precisão",
    layout: "",
  },
  {
    src: "/gallery-interior-02.jpg",
    alt: "Interior de barbearia com clientes sendo atendidos nas cadeiras",
    label: "Barbearia",
    layout: "gallery-item--portrait",
  },
  {
    src: "/gallery-corte-05.jpg",
    alt: "Barbeiros atendendo clientes em uma barbearia contemporânea",
    label: "Finalização",
    layout: "",
  },
] as const;

// Barbeiros: vêm da tabela professionals (app/lib/catalog.ts), editados no painel em
// Edição do site > Barbeiros.

export const testimonials = [
  {
    quote: "O corte ficou do jeito que eu pedi, com atenção ao acabamento. Ambiente muito agradável.",
    name: "Lucas Ferreira",
    context: "Corte masculino",
  },
  {
    quote: "Gostei do cuidado durante o atendimento e da conversa antes de começar o corte.",
    name: "Gabriel Souza",
    context: "Corte + barba",
  },
  {
    quote: "A barba ficou alinhada sem perder o formato natural. Voltaria para conhecer outros serviços.",
    name: "André Lima",
    context: "Barba",
  },
] as const;

export const openingHours = [
  { day: "Segunda-feira", hours: "09:00–20:00", dayOfWeek: "Monday" },
  { day: "Terça-feira", hours: "09:00–20:00", dayOfWeek: "Tuesday" },
  { day: "Quarta-feira", hours: "09:00–20:00", dayOfWeek: "Wednesday" },
  { day: "Quinta-feira", hours: "09:00–20:00", dayOfWeek: "Thursday" },
  { day: "Sexta-feira", hours: "09:00–21:00", dayOfWeek: "Friday" },
  { day: "Sábado", hours: "09:00–18:00", dayOfWeek: "Saturday" },
  { day: "Domingo", hours: "Fechado", dayOfWeek: "Sunday" },
] as const;

export const frequentlyAskedQuestions = [
  {
    question: "Preciso agendar antes de ir?",
    answer:
      "Recomendamos agendar para garantir o seu horário. Pelo site você escolhe o serviço, o profissional e o horário em poucos passos.",
  },
  {
    question: "Posso escolher o barbeiro?",
    answer:
      "Sim. No agendamento você escolhe com quem quer ser atendido ou seleciona qualquer profissional para ver o primeiro horário livre.",
  },
  {
    question: "Quais formas de pagamento vocês aceitam?",
    answer:
      "Aceitamos Pix, cartões de débito e crédito e dinheiro. O pagamento é feito na barbearia, ao final do atendimento.",
  },
  {
    question: "Quanto tempo dura um corte?",
    answer:
      "O corte masculino leva cerca de 30 minutos e o combo de corte e barba, cerca de 50 minutos. O tempo pode variar conforme o estilo escolhido.",
  },
  {
    question: "Vocês atendem sem horário marcado?",
    answer:
      "Atendemos por ordem de chegada quando há horários livres na agenda, mas quem agendou tem prioridade.",
  },
  {
    question: "Como posso remarcar meu horário?",
    answer:
      "Fale com a gente pelo WhatsApp informando o código da reserva. Pedimos que avise com pelo menos duas horas de antecedência.",
  },
  {
    question: "Vocês atendem crianças?",
    answer:
      "Sim, atendemos crianças a partir de 4 anos, sempre acompanhadas de um responsável durante o atendimento.",
  },
] as const;

export type LocalBusinessDetails = {
  url: string;
  telephone: string;
  image: string;
  streetAddress: string;
  addressLocality: string;
  addressRegion: string;
  postalCode: string;
  addressCountry: string;
  openingHoursSpecification: {
    dayOfWeek: string;
    opens: string;
    closes: string;
  }[];
};

export const localBusinessDetails: LocalBusinessDetails | null = null;
