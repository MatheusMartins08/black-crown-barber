/** Barbearia suspensa: o painel abre para consulta e o banco recusa qualquer alteração. */
export default function ReadOnlyNotice() {
  return (
    <p className="mx-auto w-full max-w-6xl px-4 py-3 text-sm" role="status">
      A barbearia está suspensa: o painel está só para consulta. Fale com o suporte da plataforma para regularizar.
    </p>
  );
}
