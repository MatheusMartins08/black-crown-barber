-- A versão com lista de create_subscriber_reservation (…130000) recebeu execute do anon pelos
-- privilégios padrão do Supabase. Como a versão de um serviço, ela é só para assinante logado.
revoke execute on function public.create_subscriber_reservation(text[], text, date, text, text) from anon;
