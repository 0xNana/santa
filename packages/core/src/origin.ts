/** A public site origin: HTTPS, or localhost for development. Never accepts paths or credentials. */
export function canonicalOrigin(origin: string): string {
  let url: URL;
  try { url = new URL(origin); } catch { throw new Error("The public origin is not a valid URL."); }
  const allowed = url.protocol === "https:" || (url.protocol === "http:" && url.hostname === "localhost");
  if (!allowed || url.href !== `${url.origin}/`) throw new Error("The public origin must be an HTTPS origin (or http://localhost) with no path, query or fragment.");
  return url.origin;
}
