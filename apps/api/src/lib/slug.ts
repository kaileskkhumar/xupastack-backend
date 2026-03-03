/** Slug format rules — kept in sync with CreateAppSchema in @xupastack/shared */
export const SLUG_REGEX = /^[a-z0-9-]+$/;
export const SLUG_MIN = 3;
export const SLUG_MAX = 32;

export type SlugFormatError = "too_short" | "too_long" | "invalid_chars";

export function validateSlugFormat(
  slug: string
): { ok: true } | { ok: false; reason: SlugFormatError } {
  if (slug.length < SLUG_MIN) return { ok: false, reason: "too_short" };
  if (slug.length > SLUG_MAX) return { ok: false, reason: "too_long" };
  if (!SLUG_REGEX.test(slug)) return { ok: false, reason: "invalid_chars" };
  return { ok: true };
}
