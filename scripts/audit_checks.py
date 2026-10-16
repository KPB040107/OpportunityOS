import glob
import re

migrations = sorted(glob.glob('supabase/migrations/*.sql'))

checks = []

for m in migrations:
    m_name = m.replace('supabase/migrations\\', '').replace('supabase/migrations/', '')
    with open(m, 'r', encoding='utf-8') as f:
        c = f.read()

    # In CREATE TABLE
    for match in re.finditer(r'create\s+table\s+(?:if\s+not\s+exists\s+)?([a-zA-Z0-9_\.]+)\s*\((.*?)\);', c, re.I | re.DOTALL):
        tbl = match.group(1).lower()
        body = match.group(2)
        for chk in re.finditer(r'(?:constraint\s+([a-zA-Z0-9_]+)\s+)?check\s*\((.*?)\)', body, re.I):
            cname = chk.group(1) or 'inline'
            expr = chk.group(2).strip()
            checks.append((m_name, tbl, cname, expr))

    # In ALTER TABLE
    for match in re.finditer(r'alter\s+table\s+(?:only\s+)?([a-zA-Z0-9_\.]+)\s+(.*?);', c, re.I | re.DOTALL):
        tbl = match.group(1).lower()
        stmt = match.group(2).strip()
        for chk in re.finditer(r'add\s+(?:constraint\s+([a-zA-Z0-9_]+)\s+)?check\s*\((.*?)\)', stmt, re.I):
            cname = chk.group(1) or 'inline'
            expr = chk.group(2).strip()
            checks.append((m_name, tbl, cname, expr))

print(f"Total Check Constraints Discovered: {len(checks)}")
print(f"{'TABLE':32} | {'CONSTRAINT':25} | {'EXPRESSION':55} | {'MIGRATION'}")
print("-" * 130)
for m, tbl, cname, expr in checks:
    print(f"{tbl:32} | {cname:25} | {expr[:55]:55} | {m}")
