import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";

const PROTECTED_ROUTES = ["/dashboard", "/generate", "/cards", "/review"];
// Public entry points that a logged-in visitor should be bounced off of, into
// the dashboard. `/` is matched exactly (a prefix would catch everything); auth
// routes are an explicit pair (a `/auth` prefix would trap `/auth/confirm-email`).
const LOGGED_IN_REDIRECTS = ["/", "/auth/signin", "/auth/signup"];

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
  } else {
    context.locals.user = null;
  }

  if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
  }

  if (context.locals.user && LOGGED_IN_REDIRECTS.includes(context.url.pathname)) {
    return context.redirect("/dashboard");
  }

  return next();
});
