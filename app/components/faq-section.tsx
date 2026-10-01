import { frequentlyAskedQuestions } from "../data/site";
import Reveal from "./reveal";

export default function FAQSection() {
  return (
    <section aria-labelledby="faq-title" className="section faq" id="faq">
      <div className="section__inner faq__layout">
        <Reveal className="faq__intro" from="left">
          <p className="section-heading__eyebrow" data-anchor-start>Antes de agendar</p>
          <h2 id="faq-title">Perguntas frequentes</h2>
          <p>Respostas de demonstração. Confirme cada política com a barbearia antes de publicar.</p>
        </Reveal>
        <Reveal className="faq__list" from="right">
          {frequentlyAskedQuestions.map((item) => (
            <details className="faq-item" key={item.question}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
