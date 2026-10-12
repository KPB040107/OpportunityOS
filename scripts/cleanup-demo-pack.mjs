// Cleanup disposable demo user and associated rows from Supabase
import { writeFileSync } from 'node:fs';

export function generateCleanupSql(userId) {
  const quote = v => "'" + String(v).replaceAll("'", "''") + "'";
  return `begin;
delete from auth.users where id = ${quote(userId)}::uuid;
commit;
select not exists(select 1 from auth.users where id = ${quote(userId)}::uuid) as demo_user_removed;
`;
}

if (process.argv[2]) {
  const userId = process.argv[2];
  const sql = generateCleanupSql(userId);
  writeFileSync(new URL('../.local/demo-pack-cleanup.sql', import.meta.url), sql);
  console.log(`Generated .local/demo-pack-cleanup.sql for user ${userId}`);
}
