import { redirect } from "next/navigation";

export default function PayablesIndexPage() {
  redirect("/admin/liabilities/payables/rent");
}
