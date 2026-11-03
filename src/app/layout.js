import "./globals.css";
import { ToastProvider } from "@/components/Toast.js";
import NextAuthProvider from "@/components/SessionProvider";

export const metadata = {
  title: "Hair Transplant Clinic",
  description: "Clinic Management System",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen" suppressHydrationWarning>
        <NextAuthProvider>
          <ToastProvider>{children} </ToastProvider>
        </NextAuthProvider>
      </body>
    </html>
  );
}
