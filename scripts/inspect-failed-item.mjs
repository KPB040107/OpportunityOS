import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../web/package.json', import.meta.url));
const { createServerClient } = require('@supabase/ssr');

const envConfig = Object.fromEntries(
  fs.readFileSync('web/.env.local', 'utf8')
    .split(/\r?\n/)
    .filter(l => l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
);

const savedSession = JSON.parse(fs.readFileSync('.local/repair-live-session.json', 'utf8'));

const supabase = createServerClient(envConfig.NEXT_PUBLIC_SUPABASE_URL, envConfig.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  cookies: { getAll: () => [], setAll: () => {} }
});

await supabase.auth.setSession(savedSession);

const { data: item } = await supabase.from('raw_items').select('*').eq('id', '4169692c-99b7-4b0a-8d6b-9058d53f0ff9');
console.log('Raw Item:', item);

const { data: events } = await supabase.from('events').select('*').order('created_at', { ascending: false }).limit(5);
console.log('Recent Events:', events);
