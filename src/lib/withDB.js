import dbConnect from "./db";
import { NextResponse } from "next/server";

// A failed connection and a bug inside the handler are different problems;
// reporting both as "Database connection failed" sent people chasing the
// wrong one. The handler's message is safe to surface to a logged-in user.
export function withDB(handler) {
  return async (req, ctx) => {
    try {
      await dbConnect();
    } catch (error) {
      console.error("Database connection error:", error);
      return NextResponse.json({ success: false, message: "Database connection failed" }, { status: 500 });
    }
    try {
      return await handler(req, ctx);
    } catch (error) {
      console.error("Route handler error:", error);
      return NextResponse.json(
        { success: false, message: error?.message || "Internal server error" },
        { status: 500 },
      );
    }
  };
}
