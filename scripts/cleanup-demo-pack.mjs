// Cleanup disposable demo user and associated rows from Supabase
import { writeFileSync } from 'node:fs';

export function generateCleanupSql(userId) {
  if(typeof userId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(userId))throw new Error('A valid disposable demo UUID is required.');
  const quote = v => "'" + String(v).replaceAll("'", "''") + "'";
  const email=`demo-pack-${userId}@example.invalid`;
  return `begin;
do $$ begin if exists(select 1 from auth.users where id=${quote(userId)}::uuid and email<>${quote(email)}) then raise exception 'Refusing to remove a non-demo account';end if;end;$$;
delete from auth.users where id = ${quote(userId)}::uuid and email=${quote(email)};
commit;
select not exists(select 1 from auth.users where id = ${quote(userId)}::uuid) as demo_user_removed;
`;
}

if (process.argv[1]?.endsWith('cleanup-demo-pack.mjs')&&process.argv[2]) {
  const userId = process.argv[2];
  const sql = generateCleanupSql(userId);
  writeFileSync(new URL('../.local/demo-pack-cleanup.sql', import.meta.url), sql);
  console.log(`Generated .local/demo-pack-cleanup.sql for user ${userId}`);
}
