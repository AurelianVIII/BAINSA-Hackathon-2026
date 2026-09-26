import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FocusAid",
  description: "AI learning accessibility tool for students who miss parts of a lesson.",
};

/**
 * Next 16 ignores `viewport` inside the metadata export, so the tag added
 * in cfc477d was never reaching the page and the zoom scaling it was
 * meant to fix was still happening. Same values, supported export.
 *
 * `maximumScale` is deliberately not set: capping zoom breaks pinch-zoom
 * for low-vision users, which is not a trade this product can make.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
