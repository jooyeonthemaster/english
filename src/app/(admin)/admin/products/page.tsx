import { requireAdminAuth } from "@/lib/auth-admin";
import { getAdminCreditProductsWithPromotions } from "@/lib/credit-top-up-products";
import { ProductsAdminClient } from "@/components/admin/products-admin-client";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  await requireAdminAuth();

  const products = await getAdminCreditProductsWithPromotions();

  return <ProductsAdminClient initialProducts={products} />;
}
