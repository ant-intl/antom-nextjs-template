import { InlineCheckout } from '@/components/InlineCheckout';
import { PRODUCTS } from '@/config/products';
import { clientEnv } from '@/config/env';

export default function HomePage() {
  return (
    <InlineCheckout
      product={PRODUCTS[0]}
      environment={clientEnv.antomEnv}
    />
  );
}
