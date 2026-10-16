import glob
import re

migrations = sorted(glob.glob('supabase/migrations/*.sql'))

print(f"Total migrations: {len(migrations)}")

for m in migrations:
    m_name = m.replace('supabase/migrations\\', '').replace('supabase/migrations/', '')
    with open(m, 'r', encoding='utf-8') as f:
        c = f.read()
    
    first_lines = [l.strip() for l in c.splitlines() if l.strip() and not l.strip().startswith('--')][:3]
    comments = [l.strip().lstrip('-').strip() for l in c.splitlines() if l.strip().startswith('--')][:3]
    
    # Check if transaction wrapped
    has_begin = bool(re.search(r'^\s*begin\s*;', c, re.M | re.I))
    has_commit = bool(re.search(r'^\s*commit\s*;', c, re.M | re.I))
    
    created_tables = re.findall(r'create\s+table\s+(?:if\s+not\s+exists\s+)?([a-zA-Z0-9_\.]+)', c, re.I)
    altered_tables = re.findall(r'alter\s+table\s+(?:only\s+)?([a-zA-Z0-9_\.]+)', c, re.I)
    created_funcs = re.findall(r'create\s+(?:or\s+replace\s+)?function\s+([a-zA-Z0-9_\.]+)', c, re.I)
    created_policies = re.findall(r'create\s+policy\s+(?:"([^"]+)"|([a-zA-Z0-9_]+))', c, re.I)
    created_indexes = re.findall(r'create\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?([a-zA-Z0-9_]+)', c, re.I)
    
    desc = "; ".join(comments[:2]) if comments else "No header comment"
    print(f"\n{m_name}")
    print(f"  Summary: {desc}")
    print(f"  Txn: Begin={has_begin}, Commit={has_commit}")
    if created_tables: print(f"  Tables Created: {created_tables}")
    if altered_tables: print(f"  Tables Altered: {list(set(altered_tables))}")
    if created_funcs: print(f"  Functions: {created_funcs}")
    if created_indexes: print(f"  Indexes: {created_indexes}")
