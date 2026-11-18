import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth/next";
import "./owner-theme.css";
import "./owner-ai.css";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { roleHome } from "@/lib/roleRoutes";
import { ThemeProvider, OWNER_THEME_COOKIE } from "@/components/owner/ThemeContext";
import { ShellProvider } from "@/components/owner/ShellContext";
import OwnerShell from "@/components/owner/OwnerShell";
import MotionRoot from "@/components/owner/ai/MotionRoot";
import AiCommandBar from "@/components/owner/ai/AiCommandBar";


const OWNER_ROLES = ["owner", "super-admin"];

export default async function OwnerLayout({ children }) {
  
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (!OWNER_ROLES.includes(session.user.role)) redirect(roleHome(session.user.role));

  const storedTheme = (await cookies()).get(OWNER_THEME_COOKIE)?.value;
  const initialTheme = storedTheme === "dark" ? "dark" : "light";

  return (
    <ThemeProvider initialTheme={initialTheme}>
      <ShellProvider>
        <MotionRoot>
          <OwnerShell>{children}</OwnerShell>
          <AiCommandBar />
        </MotionRoot>
      </ShellProvider>
    </ThemeProvider>
  );
}
