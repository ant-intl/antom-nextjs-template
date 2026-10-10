import { InlineCheckout } from '@/components/InlineCheckout';
import { PRODUCTS } from '@/config/products';

export default function HomePage() {
  return <InlineCheckout product={PRODUCTS[0]} />;
}
