import { ImageResponse } from 'next/og';
import { STORE } from '@/config/store';

// Branded social-card / template-gallery preview, generated at the edge.
export const runtime = 'edge';
export const alt = `${STORE.name} — secure global checkout powered by Antom`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: '#ffffff',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              display: 'flex',
              height: 16,
              width: 16,
              borderRadius: 16,
              background: '#0071e3',
            }}
          />
          <div style={{ display: 'flex', fontSize: 30, color: '#6e6e73', letterSpacing: -0.5 }}>
            {STORE.name}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div
            style={{
              display: 'flex',
              fontSize: 84,
              fontWeight: 700,
              color: '#1d1d1f',
              lineHeight: 1.05,
              letterSpacing: -2,
            }}
          >
            Global payments,
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 84,
              fontWeight: 700,
              color: '#1d1d1f',
              lineHeight: 1.05,
              letterSpacing: -2,
            }}
          >
            one-time checkout.
          </div>
          <div style={{ display: 'flex', fontSize: 34, color: '#6e6e73', marginTop: 8 }}>
            {STORE.tagline}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            fontSize: 28,
            color: '#1d1d1f',
          }}
        >
          <div style={{ display: 'flex' }}>Antom CKP Embedded</div>
          <div style={{ display: 'flex', color: '#86868b' }}>·</div>
          <div style={{ display: 'flex' }}>Next.js 14</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
