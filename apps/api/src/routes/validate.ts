import { Hono } from "hono";
import type { Env } from "../env";
import type { SessionUser } from "../auth/session";
import { validateSupabaseUrl } from "../lib/validate-supabase";

interface Variables {
  user: SessionUser;
}

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

// POST /validate/supabase-url
router.post("/supabase-url", async (c) => {
  const body = await c.req.json().catch(() => null) as
    | { url?: string }
    | null;

  if (!body?.url || typeof body.url !== "string") {
    return c.json({ ok: false, error: "invalid_format" }, 400);
  }

  const result = await validateSupabaseUrl(body.url);
  if (result.ok) {
    return c.json(result);
  }
  return c.json(result, 400);
});

export { router as validateRouter };
