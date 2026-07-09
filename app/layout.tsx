import type { Metadata } from "next";
import { Noto_Sans } from "next/font/google";
import "./globals.css";
import { DesignTokens } from "@takaki/go-design-system";
import { ClientProviders } from "./client-providers";

const notoSans = Noto_Sans({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-noto",
  display: "swap",
});

export const metadata: Metadata = {
  title: "KenyakuGo",
  description: "Keep your base spending low, spend freely when it counts.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${notoSans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var s=localStorage.getItem('kg-theme');var d=s||(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.classList.add(d);})();`,
          }}
        />
        <DesignTokens primaryColor="#1A7A4A" primaryColorHover="#145C38" />
      </head>
      <body className="min-h-full">
        {children}
        <ClientProviders />
      </body>
    </html>
  );
}
