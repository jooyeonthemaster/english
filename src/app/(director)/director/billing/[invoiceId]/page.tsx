import { notFound } from "next/navigation";
import { getInvoice } from "@/actions/billing";
import { InvoiceDetailClient } from "./invoice-detail-client";

export const metadata = {
  title: "청구서 상세 | 영신ai",
};

interface PageProps {
  params: Promise<{ invoiceId: string }>;
}

export default async function InvoiceDetailPage({ params }: PageProps) {
  const { invoiceId } = await params;

  try {
    const invoice = await getInvoice(invoiceId);
    return <InvoiceDetailClient invoice={invoice} />;
  } catch {
    notFound();
  }
}
