import glob
import re

migrations = sorted(glob.glob('supabase/migrations/*.sql'))
schemas = set()
private_tables = set()

for m in migrations:
    with open(m, 'r', encoding='utf-8') as f:
        c = f.read()
    for match in re.finditer(r'create\s+schema\s+(?:if\s+not\s+exists\s+)?([a-zA-Z0-9_]+)', c, re.I):
        schemas.add(match.group(1).lower())
    for match in re.finditer(r'create\s+table\s+(?:if\s+not\s+exists\s+)?([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)', c, re.I):
        sname = match.group(1).lower()
        tname = match.group(2).lower()
        if sname != 'public':
            private_tables.add((sname, tname, m))

print("Schemas:", schemas)
print("Non-public tables:")
for s, t, m in sorted(private_tables):
    print(f"  {s}.{t} (from {m})")
