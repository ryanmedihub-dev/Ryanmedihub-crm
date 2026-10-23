"use client";
import StockDashboard from "@/components/StockDashboard";
import SuperAdminSidebar from "@/components/Sidebars/SuperAdminSidebar";

const CONFIG = {
  SidebarComponent: SuperAdminSidebar,
  title:         "Inventory overview",
  subtitle:      "Read-only view across every branch",
  showAddStock:  false,
  showPurchase:  false,
  editBasePath:  null,
  viewBasePath:  "/stocks/view",
};

export default function SuperAdminStocksPage() {
  return <StockDashboard config={CONFIG} />;
}
