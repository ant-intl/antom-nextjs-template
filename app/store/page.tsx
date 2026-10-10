import { InlineCheckout } from '@/components/InlineCheckout';
import { PRODUCTS } from '@/config/products';

export default function StorePage() {
  return <InlineCheckout product={PRODUCTS[0]} />;
}
