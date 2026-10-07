/** Itens renderizados por vez nas listas longas (clientes, assinantes). */
export const listPageSize = 30;

/** Rodapé "Mostrar mais" de uma lista cortada em `shown` itens. */
export default function ShowMore({ shown, total, onShowMore }: { shown: number; total: number; onShowMore: () => void }) {
  if (total <= shown) return null;
  const remaining = total - shown;

  return (
    <div className="admin-show-more">
      <span>
        Mostrando {shown} de {total}
      </span>
      <button className="admin-text-button" onClick={onShowMore} type="button">
        Mostrar mais {Math.min(remaining, listPageSize)}
      </button>
    </div>
  );
}
