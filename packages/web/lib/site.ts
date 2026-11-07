// Share previews need an absolute address. Vercel names the production domain itself, so the cards
// stay right even when SANTA_PUBLIC_ORIGIN is missing from the environment the metadata is built in.
export function siteOrigin(): string {
  if (process.env.SANTA_PUBLIC_ORIGIN) return process.env.SANTA_PUBLIC_ORIGIN;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}
