// Bench-only stand-in for next-auth: every route sees an owner session.
export const authOptions = {};
export async function getServerSession() {
  return { user: { role: "owner", name: "bench", email: "bench@local" } };
}
