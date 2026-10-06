// Erros das RPCs (SQLSTATE em `code`, chave em `message`, texto em pt-BR em `hint`).
// Ver a tabela de códigos em supabase/README.md.
export type RpcError = { code?: string; message?: string; hint?: string | null };

export function getRpcMessage(error: RpcError | null | undefined, fallback: string) {
  return error?.hint || fallback;
}
