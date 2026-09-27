import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./owner-theme.css";
import "./owner-ai.css";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { roleHome } from "@/lib/roleRoutes";
import { ThemeProvider } from "@/components/owner/ThemeContext";
import { ShellProvider } from "@/components/owner/ShellContext";
import MotionRoot from "@/components/owner/ai/MotionRoot";
import NeuralBackdrop from "@/components/owner/ai/NeuralBackdrop";
import AiCommandBar from "@/components/owner/ai/AiCommandBar";

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

const OWNER_ROLES = ["owner", "super-admin"];

export default async function OwnerLayout({ children }) {
  
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (!OWNER_ROLES.includes(session.user.role)) redirect(roleHome(session.user.role));

  return (
    <ThemeProvider className={`${plexSans.variable} ${plexMono.variable}`}>
      <ShellProvider>
        <MotionRoot>
          <NeuralBackdrop />
          {children}
          <AiCommandBar />
        </MotionRoot>
      </ShellProvider>
    </ThemeProvider>
  );
}
