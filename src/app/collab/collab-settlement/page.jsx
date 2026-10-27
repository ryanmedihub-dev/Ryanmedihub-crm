"use client";

import CollabSidebar from "@/components/Sidebars/CollabSidebar";
import CollabSettlementView from "@/components/collab/CollabSettlementView";

export default function CollabSettlementPage() {
  return <CollabSettlementView sidebar={<CollabSidebar />} />;
}
