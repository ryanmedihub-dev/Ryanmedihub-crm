import dbConnect from "./db";
import { NextResponse } from "next/server";

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
