import glob
import re

migrations = sorted(glob.glob('supabase/migrations/*.sql'))

no_txn = []
with_txn = []

for m in migrations:
    m_name = m.replace('supabase/migrations\\', '').replace('supabase/migrations/', '')
    with open(m, 'r', encoding='utf-8') as f:
        c = f.read()
    
    # check for begin
    has_begin = bool(re.search(r'^\s*begin\s*;', c, re.M | re.I))
    has_commit = bool(re.search(r'^\s*commit\s*;', c, re.M | re.I))
    
    if has_begin and has_commit:
        with_txn.append(m_name)
    else:
        no_txn.append((m_name, has_begin, has_commit))

print(f"Migrations with full BEGIN/COMMIT transactions ({len(with_txn)}):")
for m in with_txn:
    print(f"  + {m}")

print(f"\nMigrations without full BEGIN/COMMIT transactions ({len(no_txn)}):")
for m, b, c in no_txn:
    print(f"  - {m} (Begin: {b}, Commit: {c})")
