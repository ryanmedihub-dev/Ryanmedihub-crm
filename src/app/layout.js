import "./globals.css";
import { Geist, Geist_Mono } from "next/font/google";
import { ToastProvider } from "@/components/Toast.js";
import NextAuthProvider from "@/components/SessionProvider";
import ThemeSync from "@/components/ThemeSync";
import { THEME_BOOT } from "@/lib/themeBoot";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata = {
  title: "Hair Transplant Clinic",
  description: "Clinic Management System",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="min-h-screen antialiased" suppressHydrationWarning>
        <ThemeSync />
        <NextAuthProvider>
          <ToastProvider>{children} </ToastProvider>
        </NextAuthProvider>
      </body>
    </html>
  );
}
