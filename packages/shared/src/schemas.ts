import { z } from "zod";

export const EnabledServiceSchema = z.enum([
  "rest",
  "auth",
  "storage",
  "functions",
  "graphql",
  "realtime",
]);
export type EnabledService = z.infer<typeof EnabledServiceSchema>;

export const GatewayConfigSchema = z.object({
  upstreamHost: z.string(),
  allowedOrigins: z.array(z.string()),
  allowCredentials: z.boolean().default(false),
  enabledServices: z
    .array(EnabledServiceSchema)
    .default(["rest", "auth", "storage", "functions", "graphql", "realtime"]),
  rateLimitPerMin: z.number().int().positive().default(600),
  strictMode: z.boolean().default(false),
  rewriteLocationHeaders: z.boolean().default(true),
});
export type GatewayConfig = z.infer<typeof GatewayConfigSchema>;

const CORS_WILDCARD_WITH_CREDENTIALS_MSG =
  "allowCredentials cannot be true when allowedOrigins includes '*' — " +
  "this violates the CORS spec and allows any origin to make credentialed requests";

// Base object schema — used as the foundation for Create, Update, and App schemas.
// Keep .refine() off the base so that .partial() and .extend() remain callable.
const CreateAppBaseSchema = z.object({
  name: z.string().min(1).max(64),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase alphanumeric with hyphens")
    .min(3)
    .max(32),
  mode: z.enum(["managed", "selfhost"]).default("managed"),
  upstreamHost: z.string().url("upstreamHost must be a valid URL"),
  allowedOrigins: z.array(z.string()).default(["*"]),
  allowCredentials: z.boolean().default(false),
  enabledServices: z
    .array(EnabledServiceSchema)
    .default(["rest", "auth", "storage", "functions", "graphql", "realtime"]),
  rateLimitPerMin: z.number().int().min(1).max(10000).default(600),
  strictMode: z.boolean().default(false),
  rewriteLocationHeaders: z.boolean().default(true),
});

export const CreateAppSchema = CreateAppBaseSchema.refine(
  (d) => !(d.allowedOrigins.includes("*") && d.allowCredentials),
  { message: CORS_WILDCARD_WITH_CREDENTIALS_MSG, path: ["allowCredentials"] }
);
export type CreateApp = z.infer<typeof CreateAppSchema>;

export const UpdateAppSchema = CreateAppBaseSchema.partial()
  .extend({
    selfhostGatewayUrl: z
      .string()
      .url("selfhostGatewayUrl must be a valid URL")
      .nullable()
      .optional(),
  })
  .refine(
    (d) => !(d.allowedOrigins?.includes("*") && d.allowCredentials),
    { message: CORS_WILDCARD_WITH_CREDENTIALS_MSG, path: ["allowCredentials"] }
  );
export type UpdateApp = z.infer<typeof UpdateAppSchema>;

export const AppSchema = CreateAppBaseSchema.extend({
  id: z.string(),
  userId: z.string(),
  status: z.enum(["active", "disabled"]).default("active"),
  proxyUrl: z.string().nullable().default(null),
  selfhostGatewayUrl: z.string().nullable().default(null),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type App = z.infer<typeof AppSchema>;

export const ConfigTokenPayloadSchema = z.object({
  appId: z.string(),
  expiresAt: z.number(),
});
export type ConfigTokenPayload = z.infer<typeof ConfigTokenPayloadSchema>;
