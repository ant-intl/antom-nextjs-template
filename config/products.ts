export interface Product {
  id: string;
  name: string;
  description: string;
  /** Price as integer in the smallest currency unit (e.g., 1999 = $19.99). */
  price: number;
  currency: string;
  /** Primary image — used for the bag line-item thumbnail. */
  imageSrc: string;
  /** Optional gallery for the PDP carousel. Falls back to [imageSrc]. */
  images?: string[];
  /** Optional storefront copy — presentational only. */
  brand?: string;
  tagline?: string;
  rating?: number;
  reviewCount?: number;
  features?: string[];
}

export const PRODUCTS: Product[] = [
  {
    id: 'headphones',
    name: 'Wireless Headphones',
    brand: 'Demo Audio',
    tagline: 'Studio-grade sound, all-day comfort.',
    description:
      'Immersive over-ear sound with adaptive noise cancellation, a 40-hour battery, and plush memory-foam earcups — engineered for music, calls, and everything in between.',
    price: 54900,
    currency: 'USD',
    imageSrc: '/images/headphones-1.jpg',
    images: [
      '/images/headphones-1.jpg',
      '/images/headphones-2.jpg',
      '/images/headphones-3.jpg',
    ],
    rating: 4.9,
    reviewCount: 320,
    features: [
      'Adaptive noise cancellation',
      '40-hour battery life',
      'Hi-Res certified audio',
      'Multipoint Bluetooth 5.3',
    ],
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
