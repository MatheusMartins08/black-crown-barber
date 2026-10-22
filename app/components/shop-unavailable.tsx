/** Domínio sem barbearia, ou barbearia fora do ar. Sem nome de loja: não revela qual é. */
export default function ShopUnavailable({ title, message }: { title: string; message: string }) {
  return (
    <main className="flex min-h-screen flex-1 items-center justify-center px-6 py-16 text-center">
      <div className="max-w-md">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-3 text-base opacity-80">{message}</p>
      </div>
    </main>
  );
}

export const unknownShopText = {
  title: "Página não encontrada",
  message: "Este endereço não corresponde a nenhuma barbearia.",
};

export const suspendedShopText = {
  title: "Temporariamente indisponível",
  message: "O site desta barbearia está fora do ar no momento. Tente novamente mais tarde.",
};
