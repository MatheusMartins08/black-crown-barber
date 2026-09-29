import { frequentlyAskedQuestions } from "../data/site";

export default function FAQSection() {
  return (
    <section aria-labelledby="faq-title" className="section faq" id="faq">
      <div className="section__inner faq__layout">
        <div className="faq__intro">
          <p className="section-heading__eyebrow">Antes de agendar</p>
          <h2 id="faq-title">Perguntas frequentes</h2>
          <p>Respostas de demonstração. Confirme cada política com a barbearia antes de publicar.</p>
        </div>
        <div className="faq__list">
          {frequentlyAskedQuestions.map((item) => (
            <details className="faq-item" key={item.question}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}