import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "./context/LanguageContext";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ADA Clara",
  description: "ADA Chatbot for diabetes questions and support",
  icons: {
    icon: '/logo.png',
    shortcut: '/logo.png',
    apple: '/logo.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Get API base URL from environment variable (set at build time)
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || '';

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Inject API base URL as a global variable for runtime config fetching */}
        {apiBaseUrl && (
          <script
            dangerouslySetInnerHTML={{
              __html: `window.__API_BASE_URL__ = ${JSON.stringify(apiBaseUrl)};`,
            }}
          />
        )}
      </head>
      <body className={`${inter.variable} antialiased`} suppressHydrationWarning>
        <LanguageProvider>
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
