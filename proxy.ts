import { NextResponse, type NextRequest } from "next/server";

// Os redirects do next.config não diferenciam maiúsculas, então "/Painel" -> "/painel"
// entraria em loop. Aqui a comparação é exata.
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname !== "/painel" && request.nextUrl.pathname.toLowerCase() === "/painel") {
    return NextResponse.redirect(new URL("/painel", request.url));
  }
}

export const config = {
  matcher: ["/Painel", "/PAINEL"],
};
