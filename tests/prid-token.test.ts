import test from 'node:test';
import assert from 'node:assert/strict';
import { signPridWithSecret, verifyPridWithSecret } from '../lib/antom/prid-token';

const SECRET = 'unit-test-secret';
const PRID = '0e2b1f4d8c7a4d6f9b3e5a1c2d3e4f56';

test('signPrid + verifyPrid round-trip returns the original prid', () => {
  const token = signPridWithSecret(SECRET, PRID);
  assert.equal(verifyPridWithSecret(SECRET, token), PRID);
});

test('verifyPrid rejects tampered prid portion', () => {
  const token = signPridWithSecret(SECRET, PRID);
  const tampered = token.replace(PRID, PRID.slice(0, -1) + 'f');
  assert.equal(verifyPridWithSecret(SECRET, tampered), null);
});

test('verifyPrid rejects tampered signature portion', () => {
  const token = signPridWithSecret(SECRET, PRID);
  const tampered = token.slice(0, -1) + (token.at(-1) === 'a' ? 'b' : 'a');
  assert.equal(verifyPridWithSecret(SECRET, tampered), null);
});

test('verifyPrid rejects token signed with a different secret', () => {
  const token = signPridWithSecret(SECRET, PRID);
  assert.equal(verifyPridWithSecret('other-secret', token), null);
});

test('verifyPrid rejects token without a separator', () => {
  assert.equal(verifyPridWithSecret(SECRET, 'no-dot-here'), null);
});

test('verifyPrid rejects empty input', () => {
  assert.equal(verifyPridWithSecret(SECRET, ''), null);
});
