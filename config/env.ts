/**
 * Client-safe environment variables.
 * Only NEXT_PUBLIC_* variables can be referenced here.
 */

const rawEnv = process.env.NEXT_PUBLIC_ANTOM_ENV;
const antomEnv: 'sandbox' | 'prod' = rawEnv === 'prod' ? 'prod' : 'sandbox';

export const clientEnv = {
  antomEnv,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
};
