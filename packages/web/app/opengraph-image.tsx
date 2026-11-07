import { ImageResponse } from "next/og";
import { loadFonts, ShareCard } from "./og/og";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Santa: send stocks to the people you love";

export default async function Image() {
  return new ImageResponse(<ShareCard meta="A GIFT IN ONE LINK" lineOne="Send stocks." lineTwo="Share a little love." />, {
    ...size,
    fonts: await loadFonts(),
  });
}
