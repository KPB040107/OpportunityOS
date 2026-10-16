import glob
import re
from collections import defaultdict

migrations = sorted(glob.glob('supabase/migrations/*.sql'))
tables = {}
rls = {}
policies = defaultdict(list)
grants = defaultdict(list)
revokes = defaultdict(list)

for m in migrations:
    with open(m, 'r', encoding='utf-8') as f:
        c = f.read()
    for match in re.finditer(r'create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-zA-Z0-9_]+)', c, re.I):
        t = match.group(1).lower()
        if t not in tables:
            tables[t] = m
    for match in re.finditer(r'alter\s+table\s+(?:only\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s+enable\s+row\s+level\s+security', c, re.I):
        rls[match.group(1).lower()] = True
    for match in re.finditer(r'create\s+policy\s+(?:"([^"]+)"|([a-zA-Z0-9_]+))\s+on\s+(?:public\.)?([a-zA-Z0-9_]+)', c, re.I):
        pname = match.group(1) or match.group(2)
        policies[match.group(3).lower()].append((m, pname))
    # Check table grants / revokes
    for match in re.finditer(r'revoke\s+.*?\s+on\s+(?:table\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s+from\s+(.*?);', c, re.I):
        revokes[match.group(1).lower()].append((m, match.group(2).strip()))
    for match in re.finditer(r'grant\s+.*?\s+on\s+(?:table\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s+to\s+(.*?);', c, re.I):
        grants[match.group(1).lower()].append((m, match.group(2).strip()))

print(f"{'TABLE NAME':32} | {'RLS':5} | {'POLICIES':8} | {'REVOKES':7} | {'GRANTS':6} | {'FIRST DEFINED'}")
print("-" * 105)
for t in sorted(tables.keys()):
    is_rls = rls.get(t, False)
    p_count = len(policies.get(t, []))
    r_count = len(revokes.get(t, []))
    g_count = len(grants.get(t, []))
    origin = tables[t].replace('supabase/migrations\\', '').replace('supabase/migrations/', '')
    print(f"{t:32} | {str(is_rls):5} | {p_count:8} | {r_count:7} | {g_count:6} | {origin}")
