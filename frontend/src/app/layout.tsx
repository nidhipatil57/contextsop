import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geist = localFont({ src: "../../node_modules/next/dist/client/components/react-dev-overlay/font/geist-latin.woff2", variable: "--font-geist", display: "swap", preload: true });
const geistMono = localFont({ src: "../../node_modules/next/dist/client/components/react-dev-overlay/font/geist-mono-latin.woff2", variable: "--font-geist-mono", display: "swap", preload: true });

export const metadata: Metadata = {
  title: "ContextSOP | From incident noise to reliable action",
  description: "Transform operational transcripts into safe, interactive runbooks.",
  metadataBase: new URL("https://contextsop.com"),
  openGraph: { title: "ContextSOP | From incident noise to reliable action", description: "Living, validated runbooks for high-pressure incident response.", images: ["/opengraph-image"] },
  twitter: { card: "summary_large_image", title: "ContextSOP", description: "Living, validated runbooks for incident response.", images: ["/opengraph-image"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${geist.variable} ${geistMono.variable}`}>{children}</body></html>;
}
