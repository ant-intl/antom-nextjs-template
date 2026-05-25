export interface Product {
  id: string;
  name: string;
  description: string;
  /** Price as integer in the smallest currency unit (e.g., 1999 = $19.99). */
  price: number;
  currency: string;
  imageSrc: string;
}

export const PRODUCTS: Product[] = [
  {
    id: 'headphones',
    name: 'Headphones',
    description: 'Wireless over-ear headphones with immersive sound.',
    price: 54900,
    currency: 'USD',
    imageSrc: '/headphones.svg',
  },
];

export function getProduct(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

/** Format integer-cents into a human-readable string. */
export function formatPrice(price: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(price / 100);
}
