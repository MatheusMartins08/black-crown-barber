import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Os redirects do next.config não diferenciam maiúsculas, então "/Painel" -> "/painel"
// entraria em loop. Aqui a comparação é exata.
//
// Também renova a sessão do Supabase (cookies) e manda quem não está logado para
// /painel/entrar. É só uma checagem otimista: quem é da equipe é conferido na página
// (staff_members) e, de verdade, pela RLS do banco.
//
// Painel e agendamento não entram em buscadores: toda resposta daqui (inclusive redirect) sai
// com X-Robots-Tag, além do robots.txt e da meta tag. Só a landing pode ser indexada.
const noRobots = "noindex, nofollow, noarchive, nosnippet, noimageindex";

function withoutRobots(response: NextResponse) {
  response.headers.set("X-Robots-Tag", noRobots);
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.toLowerCase().startsWith("/painel") && !pathname.startsWith("/painel")) {
    return withoutRobots(NextResponse.redirect(new URL(`/painel${pathname.slice("/painel".length)}`, request.url)));
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return withoutRobots(NextResponse.next());

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [header, value] of Object.entries(headers ?? {})) response.headers.set(header, value);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const isLoginPage = pathname === "/painel/entrar";

  if (pathname.startsWith("/painel") && !isLoginPage && !data?.claims) {
    return withoutRobots(NextResponse.redirect(new URL("/painel/entrar", request.url)));
  }

  return withoutRobots(response);
}

export const config = {
  matcher: ["/painel/:path*", "/Painel/:path*", "/PAINEL/:path*", "/agendamento"],
};
