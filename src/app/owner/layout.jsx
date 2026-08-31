import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./owner-theme.css";
import { ThemeProvider } from "@/components/owner/ThemeContext";
import { ShellProvider } from "@/components/owner/ShellContext";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export default function OwnerLayout({ children }) {
  return (
    <ThemeProvider className={`${plexSans.variable} ${plexMono.variable}`}>
      <ShellProvider>{children}</ShellProvider>
    </ThemeProvider>
  );
}
