/**
 * Bug Condition Exploration Test
 * ================================
 * spec: admin-frontend-separation
 * task: 1 — Write bug condition exploration test
 *
 * PURPOSE: Confirm all sub-conditions of the bug exist on UNFIXED code.
 * This script is EXPECTED TO PASS on unfixed code — "passing" means every
 * assertion confirms a bug sub-condition is present (missing files absent,
 * admin artefacts present, admin routes present).
 *
 * DO NOT attempt to fix the code when this script reports all conditions
 * confirmed. That is the correct outcome at this stage.
 *
 * Re-run in task 3.10 after the fix; at that point every assertion below
 * will confirm the opposite (pages exist, artefacts gone, routes removed).
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Resolve workspace root relative to this file's location
// (cloth_admin/bug-condition-test.js → one level up is workspace root)
// ---------------------------------------------------------------------------
const WORKSPACE = path.resolve(__dirname, '..');

function rel(...parts) {
  return path.join(WORKSPACE, ...parts);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
const counterexamples = [];

function assert(label, condition, evidence) {
  if (condition) {
    console.log(`  ✅  CONFIRMED  ${label}`);
    if (evidence) console.log(`        evidence: ${evidence}`);
    passed++;
  } else {
    console.log(`  ❌  NOT CONFIRMED  ${label}`);
    if (evidence) console.log(`        evidence: ${evidence}`);
    failed++;
    counterexamples.push({ label, evidence });
  }
}

// ---------------------------------------------------------------------------
// Sub-condition A — Missing page files (4 cases)
// Each assertion CONFIRMS the bug when the file does NOT exist.
// ---------------------------------------------------------------------------
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Sub-condition A — Missing page files (cloth_admin/src/pages/)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const missingPages = [
  'Inventory',
  'Notifications',
  'Settings',
  'Profile',
];

for (const page of missingPages) {
  const filePath = rel('cloth_admin', 'src', 'pages', `${page}.jsx`);
  const exists   = fs.existsSync(filePath);
  // Bug confirmed when file does NOT exist (lazy import will throw at runtime)
  assert(
    `cloth_admin/src/pages/${page}.jsx does NOT exist → lazy-import crash confirmed`,
    !exists,
    exists ? `UNEXPECTED: file found at ${filePath}` : `file absent: ${filePath}`
  );
}

// ---------------------------------------------------------------------------
// Sub-condition B — Admin artefacts present in cloth_frontend (5 paths)
// Each assertion CONFIRMS the bug when the path DOES exist.
// ---------------------------------------------------------------------------
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Sub-condition B — Admin artefacts present in cloth_frontend/');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const adminArtefacts = [
  'cloth_frontend/frontend/admin',            // directory
  'cloth_frontend/frontend/admin-login.html',
  'cloth_frontend/frontend/js/admin-common.js',
  'cloth_frontend/frontend/js/admin-guard.js',
  'cloth_frontend/frontend/css/admin-dashboard.css',
];

for (const artefact of adminArtefacts) {
  const filePath = rel(artefact);
  const exists   = fs.existsSync(filePath);
  // Bug confirmed when artefact DOES exist (dual admin surface)
  assert(
    `${artefact} EXISTS → dual admin surface confirmed`,
    exists,
    exists ? `found: ${filePath}` : `UNEXPECTED: not found at ${filePath}`
  );
}

// ---------------------------------------------------------------------------
// Sub-condition C — Admin routing entries in cloth_frontend/frontend/vercel.json
// ---------------------------------------------------------------------------
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Sub-condition C — Admin routing entries in cloth_frontend/frontend/vercel.json');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const vercelJsonPath = rel('cloth_frontend', 'frontend', 'vercel.json');

if (!fs.existsSync(vercelJsonPath)) {
  console.error(`  ERROR: vercel.json not found at ${vercelJsonPath}`);
  process.exit(1);
}

let vercelConfig;
try {
  vercelConfig = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'));
} catch (err) {
  console.error(`  ERROR: Failed to parse vercel.json — ${err.message}`);
  process.exit(1);
}

const redirects = Array.isArray(vercelConfig.redirects) ? vercelConfig.redirects : [];
const rewrites  = Array.isArray(vercelConfig.rewrites)  ? vercelConfig.rewrites  : [];

// C1 — redirect source "/admin"
const hasAdminRedirect = redirects.some(r => r.source === '/admin');
assert(
  'vercel.json redirects[] contains entry with source "/admin" → admin redirect confirmed',
  hasAdminRedirect,
  hasAdminRedirect
    ? `found redirect: ${JSON.stringify(redirects.find(r => r.source === '/admin'))}`
    : 'UNEXPECTED: no redirect with source "/admin" found'
);

// C2 — redirect source "/admin/"
const hasAdminSlashRedirect = redirects.some(r => r.source === '/admin/');
assert(
  'vercel.json redirects[] contains entry with source "/admin/" → admin redirect confirmed',
  hasAdminSlashRedirect,
  hasAdminSlashRedirect
    ? `found redirect: ${JSON.stringify(redirects.find(r => r.source === '/admin/'))}`
    : 'UNEXPECTED: no redirect with source "/admin/" found'
);

// C3 — rewrite source "/admin/:path*"
const hasAdminRewrite = rewrites.some(r => r.source === '/admin/:path*');
assert(
  'vercel.json rewrites[] contains entry with source "/admin/:path*" → admin proxy rewrite confirmed',
  hasAdminRewrite,
  hasAdminRewrite
    ? `found rewrite: ${JSON.stringify(rewrites.find(r => r.source === '/admin/:path*'))}`
    : 'UNEXPECTED: no rewrite with source "/admin/:path*" found'
);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('\n══════════════════════════════════════════════════════════════════');
console.log('SUMMARY');
console.log('══════════════════════════════════════════════════════════════════\n');
console.log(`  Bug sub-conditions CONFIRMED : ${passed}`);
console.log(`  Sub-conditions NOT confirmed : ${failed}`);

if (counterexamples.length > 0) {
  console.log('\n  ⚠️  Unexpected results (these sub-conditions were NOT confirmed):');
  for (const ex of counterexamples) {
    console.log(`     • ${ex.label}`);
    if (ex.evidence) console.log(`       ${ex.evidence}`);
  }
}

if (failed === 0) {
  console.log('\n  ✅  ALL 12 BUG SUB-CONDITIONS CONFIRMED');
  console.log('  The bug exists in full. Implementation tasks (3.x) may now proceed.');
  process.exit(0);
} else {
  console.log(`\n  ⚠️  ${failed} sub-condition(s) were NOT confirmed.`);
  console.log('  This means part of the bug may already be fixed, or the test needs review.');
  process.exit(1);
}
