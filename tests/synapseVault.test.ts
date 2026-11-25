import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { applyClientPiiFirewall, pcmToWavBlob } from '../src/services/piiFirewall.ts';

const HELIOS_LOG_1 = `Project Helios Battery Thermal Incident: Field Engineering Log #4B.
Lead Test Engineer: Marcus Vance (SSN: 000-88-2194, Email: mvance@helios-energy.internal, Cell: 555-0149).
Facility: Mesa Desert Proving Grounds, Battery Pack Bay 4.
Escrow Account Billing: JPMorgan Chase Card #4111-9012-3382-7714.
- At 14:22 UTC, Pack #4B cell thermal telemetry spiked to 88°C under 3C rapid discharge stress testing.
- Engineer Marcus Vance manually initiated emergency nitrogen quench protocol at 14:25 UTC.`;

const HELIOS_SPEC_2 = `NexaCell UltraMax-21700 Lithium-Titanate Specification Sheet v3.1.
Vendor Technical Liaison: Dr. Elena Rostova (Phone: 555-0182, Email: erostova@nexacell.tech).
Corporate Vendor Token: Secret-Key #NEXA-TOK-99218-SEC.
1. Maximum continuous operating thermal limit is strictly rated for 65°C.`;

const HELIOS_AUDIT_3 = `Quality Assurance Compliance Memo: Firmware Revision 2.4.0 Certification.
Audit Officer: Jonathan Hayes (Auditor Badge ID: #AUD-9912, Phone: 555-0199).
Internal Reference: QA-SIGNOFF-2026-Q4.
- Quality assurance certifies Battery Management IC #BMIC-891 firmware revision 2.4.0.
- Authorization granted for mass production release. Signed: Jonathan Hayes.`;

test('applyClientPiiFirewall redacts all PII across Project Helios documents', () => {
  const combined = [HELIOS_LOG_1, HELIOS_SPEC_2, HELIOS_AUDIT_3].join('\n\n');
  const { sanitized, extraRedactions } = applyClientPiiFirewall(combined);

  // Sensitive values must not appear in sanitized output
  for (const secret of [
    '000-88-2194',
    '4111-9012-3382-7714',
    'mvance@helios-energy.internal',
    'erostova@nexacell.tech',
    '555-0149',
    '555-0182',
    '555-0199',
    'Marcus Vance',
    'Elena Rostova',
    'Jonathan Hayes',
    '#AUD-9912',
    '#NEXA-TOK-99218-SEC',
  ]) {
    assert.equal(sanitized.includes(secret), false, `Expected "${secret}" to be redacted`);
  }

  // Typed replacement tokens must be present
  assert.match(sanitized, /\[REDACTED_PERSON\]/);
  assert.match(sanitized, /\[REDACTED_CONTACT\]/);
  assert.match(sanitized, /\[REDACTED_FINANCIAL\]/);
  assert.match(sanitized, /\[REDACTED_ID\]/);
  assert.ok(extraRedactions.length >= 10, `Expected >= 10 redactions, got ${extraRedactions.length}`);
});

test('applyClientPiiFirewall preserves non-PII technical metrics and hardware IDs', () => {
  const technicalText =
    'Pack #4B reached 88°C vs 65°C rated limit under 3C discharge; BMIC-891 ref QA-SIGNOFF-2026-Q4.';
  const { sanitized, extraRedactions } = applyClientPiiFirewall(technicalText);

  assert.equal(sanitized, technicalText);
  assert.equal(extraRedactions.length, 0);
});

test('pcmToWavBlob constructs valid 44-byte RIFF/WAVE header for 24kHz mono PCM', async () => {
  const pcm = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const blob = pcmToWavBlob(pcm, 24000);
  assert.equal(blob.type, 'audio/wav');
  assert.equal(blob.size, 44 + pcm.byteLength);

  const buf = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(buf.buffer);
  assert.equal(String.fromCharCode(...buf.slice(0, 4)), 'RIFF');
  assert.equal(String.fromCharCode(...buf.slice(8, 12)), 'WAVE');
  assert.equal(String.fromCharCode(...buf.slice(12, 16)), 'fmt ');
  assert.equal(String.fromCharCode(...buf.slice(36, 40)), 'data');
  assert.equal(view.getUint32(4, true), 36 + pcm.byteLength);
  assert.equal(view.getUint32(24, true), 24000);
  assert.equal(view.getUint32(40, true), pcm.byteLength);
});

test('security and compliance invariants hold across repository config and source', () => {
  const root = process.cwd();
  const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.match(gitignore, /^\.env$/m);
  assert.match(gitignore, /^\.firebase\/$/m);

  const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
  assert.match(rules, /allow read, write: if false;/);
  assert.match(rules, /allow read, write: if isOwner\(userId\);/);

  const hybridAiSrc = fs.readFileSync(path.join(root, 'src/services/hybridAI.ts'), 'utf8');
  const appCheckRefIdx = hybridAiSrc.indexOf('void appCheck;');
  const getAiIdx = hybridAiSrc.indexOf('getAI(app');
  assert.ok(appCheckRefIdx !== -1 && getAiIdx !== -1 && appCheckRefIdx < getAiIdx);
});
