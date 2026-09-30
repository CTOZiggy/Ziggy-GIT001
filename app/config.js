const env = process.env;

export function loadConfig(overrides = {}) {
  return {
    port: Number(env.PORT ?? 3000),
    timezone: env.APP_TIMEZONE ?? "Africa/Johannesburg",
    dbPath: env.DB_PATH ?? "data/jobcards.db",
    // Shared secret Halo sends in the `x-webhook-secret` header.
    webhookSecret: env.WEBHOOK_SECRET ?? "",
    // Key technicians/admins use to open the UI (?key=... once, then a cookie).
    accessKey: env.ACCESS_KEY ?? "",
    halo: {
      url: (env.HALO_URL ?? "").replace(/\/$/, ""), // e.g. https://acme.halopsa.com
      authUrl: env.HALO_AUTH_URL ?? "", // e.g. https://acme.halopsa.com/auth
      tenant: env.HALO_TENANT ?? "",
      clientId: env.HALO_CLIENT_ID ?? "",
      clientSecret: env.HALO_CLIENT_SECRET ?? "",
      // Optional Halo custom field ids that receive each timestamp.
      fields: {
        left_office: env.HALO_FIELD_LEFT_OFFICE ?? "",
        check_in: env.HALO_FIELD_CHECK_IN ?? "",
        sign_out: env.HALO_FIELD_SIGN_OUT ?? "",
        closed_off: env.HALO_FIELD_CLOSED_OFF ?? "",
      },
      // Optional Halo status id to move the ticket to when the card is closed.
      closedStatusId: env.HALO_STATUS_ON_CLOSE ?? "",
    },
    ...overrides,
  };
}
