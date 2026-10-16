import glob
import re
from collections import defaultdict

migrations = sorted(glob.glob('supabase/migrations/*.sql'))

indexes = defaultdict(list)

for m in migrations:
    m_name = m.replace('supabase/migrations\\', '').replace('supabase/migrations/', '')
    with open(m, 'r', encoding='utf-8') as f:
        c = f.read()

    # In CREATE TABLE inline primary key / unique
    for match in re.finditer(r'create\s+table\s+(?:if\s+not\s+exists\s+)?([a-zA-Z0-9_\.]+)\s*\((.*?)\);', c, re.I | re.DOTALL):
        tbl = match.group(1).lower()
        body = match.group(2)
        
        # primary key
        pk = re.search(r'primary\s+key\s*\((.*?)\)', body, re.I)
        if pk:
            indexes[tbl].append((m_name, f"PK_{tbl}", True, f"({pk.group(1).strip()})", "inline PK"))
        col_pk = re.search(r'([a-zA-Z0-9_]+)\s+[a-zA-Z0-9_\(\)]+\s+primary\s+key', body, re.I)
        if col_pk and not pk:
            indexes[tbl].append((m_name, f"PK_{tbl}", True, f"({col_pk.group(1).strip()})", "inline PK col"))

        # unique constraints
        for u in re.finditer(r'(?:constraint\s+([a-zA-Z0-9_]+)\s+)?unique\s*\((.*?)\)', body, re.I):
            indexes[tbl].append((m_name, u.group(1) or f"UQ_{tbl}", True, f"({u.group(2).strip()})", "inline UNIQUE"))

    # In CREATE INDEX
    for match in re.finditer(r'create\s+(unique\s+)?index\s+(?:if\s+not\s+exists\s+)?([a-zA-Z0-9_]+)\s+on\s+([a-zA-Z0-9_\.]+)(.*?);', c, re.I | re.DOTALL):
        unique = bool(match.group(1))
        idx_name = match.group(2)
        tbl = match.group(3).lower()
        details = match.group(4).strip()
        indexes[tbl].append((m_name, idx_name, unique, details, "CREATE INDEX"))

    # In ALTER TABLE ADD CONSTRAINT UNIQUE
    for match in re.finditer(r'alter\s+table\s+(?:only\s+)?([a-zA-Z0-9_\.]+)\s+add\s+constraint\s+([a-zA-Z0-9_]+)\s+unique\s*\((.*?)\);', c, re.I):
        tbl = match.group(1).lower()
        cname = match.group(2)
        cols = match.group(3).strip()
        indexes[tbl].append((m_name, cname, True, f"({cols})", "ALTER TABLE ADD UNIQUE"))

print("=== COMPLETE INDEXES AND CONSTRAINTS INVENTORY ===")
for tbl in sorted(indexes.keys()):
    print(f"\nTABLE: {tbl} ({len(indexes[tbl])} indexes/uniques)")
    for m, name, unique, cols, itype in indexes[tbl]:
        u_flag = "UNIQUE " if unique else ""
        print(f"  - [{m}] {u_flag}{name} {cols} ({itype})")
