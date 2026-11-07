import { NextResponse } from "next/server";
import crypto from "crypto";
import connectDB from "@/lib/db";
import Transactions from "@/models/Transactions";
import Vendor from "@/models/Vendor";
import { sendWhatsAppText, notifyOtherAdmins, getAdminNumbers } from "@/lib/whatsapp";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WA_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

function verifySignature(rawBody, signatureHeader) {
  const appSecret = process.env.WA_APP_SECRET;
  if (!appSecret || !signatureHeader) return false;

  const expected =
    "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");

  const receivedBuf = Buffer.from(signatureHeader);
  const expectedBuf = Buffer.from(expected);
  if (receivedBuf.length !== expectedBuf.length) return false;

  return crypto.timingSafeEqual(receivedBuf, expectedBuf);
}

const normalizePhone = (phone) => (phone || "").replace(/\D/g, "").slice(-10);

async function handleApprovalButton(fromPhone, buttonId) {
  const admins = getAdminNumbers();
  const matchedAdmin = admins.find((n) => normalizePhone(n) === normalizePhone(fromPhone));
  if (!matchedAdmin) return;

  const match = /^EXPAPPR:([a-fA-F0-9]{24}):(APPROVE|REJECT)$/.exec(buttonId || "");
  if (!match) return;

  const [, transactionId, actionRaw] = match;
  const newStatus = actionRaw === "APPROVE" ? "APPROVED" : "REJECTED";

  const transaction = await Transactions.findOneAndUpdate(
    { _id: transactionId, transactionCategory: "EXPENSE", approvalStatus: "PENDING" },
    {
      $set: {
        approvalStatus: newStatus,
        approvalActionBy: { phone: matchedAdmin, date: new Date() },
      },
    },
    { returnDocument: 'after' },
  );

  if (!transaction) {
    await sendWhatsAppText(fromPhone, "This expense has already been actioned.");
    return;
  }

  if (newStatus === "APPROVED" && transaction.expenseGiver?.type === "VENDOR" && transaction.expenseGiver?.vendorId) {
    try {
      const vendorDoc = await Vendor.findById(transaction.expenseGiver.vendorId);
      if (vendorDoc) {
        const previousValue = vendorDoc.Transactions?.toString() || "null";
        vendorDoc.Transactions = transaction._id;
        vendorDoc.editors.push({
          name: "WhatsApp Approval",
          email: "",
          branch: transaction.branch,
          date: new Date(),
          updatedFields: [
            { name: "Transactions", previousValue, newValue: transaction._id.toString() },
          ],
        });
        await vendorDoc.save();
      }
    } catch (error) {
      console.error("Error linking vendor after expense approval:", error);
    }
  }

  const payee = transaction.expenseGiver?.name || "N/A";
  const amountText = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(
    transaction.amount || 0,
  );
  const confirmText =
    newStatus === "APPROVED"
      ? `✅ Approved: ${amountText} expense (${transaction.expense || "N/A"}) for ${payee}.`
      : `❌ Rejected: ${amountText} expense (${transaction.expense || "N/A"}) for ${payee}.`;

  await sendWhatsAppText(fromPhone, confirmText);
  await notifyOtherAdmins(transaction, matchedAdmin, newStatus);
}

export async function POST(req) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ received: true });
  }

  try {
    const message = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (message?.type === "interactive" && message.interactive?.type === "button_reply") {
      await connectDB();
      await handleApprovalButton(message.from, message.interactive.button_reply.id);
    }
  } catch (error) {
    console.error("WhatsApp webhook processing error:", error);
  }

  return NextResponse.json({ received: true });
}
