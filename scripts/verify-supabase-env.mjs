import fs from 'node:fs';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

function loadEnvFile(path) {
  if (!fs.existsSync(path)) return;
  const text = fs.readFileSync(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    let value = rawValue.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] ||= value;
  }
}

function mask(value) {
  if (!value) return '(missing)';
  if (value.length <= 12) return `${value.slice(0, 3)}…${value.slice(-3)}`;
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

loadEnvFile('.env.local');
loadEnvFile('.env');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const expectedProjectRef = 'arsjxqwyzccvrilpdhad';
const missing = [];
if (!url) missing.push('NEXT_PUBLIC_SUPABASE_URL');
if (!anonKey) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');

console.log('Gridiron GM Supabase env check');
console.log(`- NEXT_PUBLIC_SUPABASE_URL: ${url || '(missing)'}`);
console.log(`- NEXT_PUBLIC_SUPABASE_ANON_KEY: ${mask(anonKey)}`);
console.log(`- SUPABASE_SERVICE_ROLE_KEY: ${mask(serviceRoleKey)} ${serviceRoleKey ? '(admin endpoints enabled)' : '(admin seed endpoints disabled)'}`);

if (missing.length > 0) {
  console.error(`\nMissing required browser env var(s): ${missing.join(', ')}`);
  console.error('Create .env.local from SUPABASE-SETUP.md, then rerun: npm run db:verify');
  process.exit(1);
}

if (!url.includes(expectedProjectRef)) {
  console.warn(`\nWarning: URL does not include expected project ref ${expectedProjectRef}. Check that you are pointing at the Gridiron GM project.`);
}

async function countWith(label, key) {
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { count, error } = await supabase
    .from('players')
    .select('*', { count: 'exact', head: true });
  if (error) {
    console.error(`- ${label} players count: FAILED — ${error.message}`);
    return false;
  }
  console.log(`- ${label} players count: ${count ?? 0}`);
  return true;
}

let ok = await countWith('anon', anonKey);
if (serviceRoleKey) {
  ok = (await countWith('service_role', serviceRoleKey)) && ok;
}

process.exit(ok ? 0 : 1);
