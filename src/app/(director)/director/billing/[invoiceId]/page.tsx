import { notFound } from "next/navigation";
import { getInvoice } from "@/actions/billing";
import { InvoiceDetailClient } from "./invoice-detail-client";

export const metadata = {
  title: "청구서 상세 | SMOAT",
};

interface PageProps {
  params: Promise<{ invoiceId: string }>;
}

export default async function InvoiceDetailPage({ params }: PageProps) {
  const { invoiceId } = await params;

  let invoice;
  try {
    invoice = await getInvoice(invoiceId);
  } catch {
    notFound();
  }

  return <InvoiceDetailClient invoice={invoice} />;
}
