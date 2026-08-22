import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Geist } from "next/font/google";
import { PwaRegister } from "./pwa-register";
import "./globals.css";

const bodyFont = Geist({ variable: "--font-body", subsets: ["latin"] });
const displayFont = Cormorant_Garamond({ variable: "--font-display", subsets: ["latin"], weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  title: "Pocket Chronicle",
  description: "A lightweight Foundry companion for character sheets, journals, chat, dice, and shopping.",
  manifest: "/manifest.webmanifest",
  applicationName: "Pocket Chronicle",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Pocket Chronicle",
  },
  icons: {
    icon: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#eaf7ff",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${bodyFont.variable} ${displayFont.variable}`}>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
