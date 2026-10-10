import test from 'node:test';
import assert from 'node:assert/strict';
import { localPreviewEnabled, PREVIEW_ORDER } from '../lib/airtable/local-preview';

test('local preview is development-only, explicit, and disabled for a connected integration', () => {
  assert.equal(localPreviewEnabled({ NODE_ENV: 'development', AIRTABLE_LOCAL_PREVIEW: 'true' }), true);
  for (const env of [
    { NODE_ENV: 'production', AIRTABLE_LOCAL_PREVIEW: 'true' },
    { NODE_ENV: 'test', AIRTABLE_LOCAL_PREVIEW: 'true' },
    { NODE_ENV: 'development' },
    { NODE_ENV: 'development', AIRTABLE_LOCAL_PREVIEW: 'false' },
    { NODE_ENV: 'development', AIRTABLE_LOCAL_PREVIEW: 'true', AIRTABLE_ENABLED: 'true' },
  ]) assert.equal(localPreviewEnabled(env), false);
});

test('sample confirmation cannot be mistaken for a real checkout fingerprint', () => {
  assert.doesNotMatch(PREVIEW_ORDER.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal('checkoutUrl' in PREVIEW_ORDER, false);
});
