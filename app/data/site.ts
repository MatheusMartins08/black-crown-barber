export const siteConfig = {
  name: "Black Crown Barber",
  description:
    "Cortes masculinos, barba e cuidado em uma barbearia de estilo clássico e contemporâneo.",
  city: "Belo Horizonte - MG",
  address: "Rua Exemplo, 123",
  phone: "(31) 99999-9999",
  whatsapp: "(31) 99999-9999",
  instagram: "@blackcrownbarber",
  bookingUrl: "#agendamento",
  whatsappUrl: "#contato",
  servicesUrl: "#servicos",
  heroImage: "/gallery-barba-01.jpg",
  isDemonstration: true,
};

export const navigationItems = [
  { label: "Início", href: "#inicio" },
  { label: "Serviços", href: "#servicos" },
  { label: "A barbearia", href: "#sobre" },
  { label: "Barbeiros", href: "#equipe" },
  { label: "Galeria", href: "#galeria" },
  { label: "Avaliações", href: "#avaliacoes" },
  { label: "Localização", href: "#localizacao" },
];

export const footerNavigationItems = [
  ...navigationItems,
  { label: "Perguntas frequentes", href: "#faq" },
];

export const services = [
  {
    name: "Corte masculino",
    description: "Corte personalizado, acabamento e finalização.",
    duration: "30 min",
    price: "R$ 55",
    icon: "scissors",
  },
  {
    name: "Barba",
    description: "Modelagem, toalha quente e acabamento preciso.",
    duration: "30 min",
    price: "R$ 45",
    icon: "razor",
  },
  {
    name: "Corte + barba",
    description: "Cuidado completo para cabelo e barba.",
    duration: "50 min",
    price: "R$ 90",
    icon: "combo",
    popular: true,
  },
  {
    name: "Sobrancelha",
    description: "Design e limpeza para um acabamento natural.",
    duration: "15 min",
    price: "R$ 25",
    icon: "detail",
  },
] as const;

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

export const barbers = [
  {
    name: "Júlia Andrade",
    specialty: "Fades e cortes modernos",
    description: "Demonstração de perfil. Substitua pela apresentação real do profissional.",
    image: "/barber-julia.jpg",
    imageAlt: "Retrato demonstrativo da barbeira Júlia Andrade",
  },
  {
    name: "Rafael Martins",
    specialty: "Barba e acabamento clássico",
    description: "Demonstração de perfil. Substitua pela apresentação real do profissional.",
    image: "/barber-rafael.jpg",
    imageAlt: "Retrato demonstrativo do barbeiro Rafael Martins",
  },
  {
    name: "João Almeida",
    specialty: "Cortes tradicionais e tesoura",
    description: "Demonstração de perfil. Substitua pela apresentação real do profissional.",
    image: "/barber-joao.jpg",
    imageAlt: "Retrato demonstrativo do barbeiro João Almeida",
  },
] as const;

export const testimonials = [
  {
    quote: "O corte ficou do jeito que eu pedi, com atenção ao acabamento. Ambiente muito agradável.",
    name: "Cliente demonstrativo 01",
    context: "Avaliação fictícia para demonstração",
  },
  {
    quote: "Gostei do cuidado durante o atendimento e da conversa antes de começar o corte.",
    name: "Cliente demonstrativo 02",
    context: "Avaliação fictícia para demonstração",
  },
  {
    quote: "A barba ficou alinhada sem perder o formato natural. Voltaria para conhecer outros serviços.",
    name: "Cliente demonstrativo 03",
    context: "Avaliação fictícia para demonstração",
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
      "Resposta demonstrativa: informe aqui se a barbearia trabalha apenas com hora marcada ou também recebe clientes sem agendamento.",
  },
  {
    question: "Posso escolher o barbeiro?",
    answer:
      "A disponibilidade para escolher um profissional depende da agenda usada pela barbearia. Confirme essa opção antes de publicar.",
  },
  {
    question: "Quais formas de pagamento vocês aceitam?",
    answer:
      "Insira somente as formas de pagamento confirmadas pelo cliente. Nenhuma forma está confirmada neste template.",
  },
  {
    question: "Quanto tempo dura um corte?",
    answer:
      "Os tempos da lista de serviços são demonstrativos. A duração real pode variar conforme o serviço e deve ser confirmada pela equipe.",
  },
  {
    question: "Vocês atendem sem horário marcado?",
    answer:
      "Política demonstrativa: confirme com a barbearia se há atendimento por ordem de chegada antes de informar essa possibilidade.",
  },
  {
    question: "Como posso remarcar meu horário?",
    answer:
      "Adicione aqui o canal e o prazo de remarcação definidos pela barbearia. O contato deste template ainda não está integrado.",
  },
  {
    question: "Vocês atendem crianças?",
    answer:
      "Confirme essa informação com a equipe e inclua eventuais condições de atendimento antes de publicar.",
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