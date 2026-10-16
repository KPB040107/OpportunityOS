import os
import re
from collections import defaultdict

MIGRATIONS_DIR = "supabase/migrations"
files = sorted([f for f in os.listdir(MIGRATIONS_DIR) if f.endswith(".sql")])

print(f"Total migration files: {len(files)}")

tables = defaultdict(list)
functions = defaultdict(list)
policies = []
indexes = []
alter_tables = []
rls_enabled = set()

for file in files:
    filepath = os.path.join(MIGRATIONS_DIR, file)
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    # Find CREATE TABLE
    for match in re.finditer(r"create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s*\((.*?)\);", content, re.IGNORECASE | re.DOTALL):
        tbl = match.group(1).lower()
        tables[tbl].append((file, match.group(2)))

    # Find ALTER TABLE ... ENABLE ROW LEVEL SECURITY
    for match in re.finditer(r"alter\s+table\s+(?:only\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s+enable\s+row\s+level\s+security", content, re.IGNORECASE):
        rls_enabled.add(match.group(1).lower())

    # Find ALTER TABLE
    for match in re.finditer(r"alter\s+table\s+(?:only\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s+(.*?);", content, re.IGNORECASE | re.DOTALL):
        tbl = match.group(1).lower()
        stmt = match.group(2).strip()
        if not stmt.lower().startswith("enable row level security"):
            alter_tables.append((file, tbl, stmt))

    # Find CREATE OR REPLACE FUNCTION
    for match in re.finditer(r"create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-zA-Z0-9_]+)\s*\((.*?)\)\s*returns\s+(.*?)\s+as\s+(\$\$|\$body\$|')([\s\S]*?)\4\s*language\s+([a-zA-Z0-9_]+)", content, re.IGNORECASE):
        fn = match.group(1).lower()
        args = match.group(2).strip()
        ret = match.group(3).strip()
        body = match.group(5).strip()
        lang = match.group(6).strip()
        functions[fn].append({
            "file": file,
            "args": args,
            "returns": ret,
            "body": body,
            "lang": lang
        })

    # Find CREATE POLICY
    for match in re.finditer(r"create\s+policy\s+(?:\"([^\"]+)\"|([a-zA-Z0-9_]+))\s+on\s+(?:public\.)?([a-zA-Z0-9_]+)([\s\S]*?);", content, re.IGNORECASE):
        pol_name = match.group(1) or match.group(2)
        tbl = match.group(3).lower()
        body = match.group(4).strip()
        policies.append((file, tbl, pol_name, body))

    # Find CREATE INDEX
    for match in re.finditer(r"create\s+(unique\s+)?index\s+(?:if\s+not\s+exists\s+)?([a-zA-Z0-9_]+)\s+on\s+(?:public\.)?([a-zA-Z0-9_]+)([\s\S]*?);", content, re.IGNORECASE):
        unique = bool(match.group(1))
        idx_name = match.group(2)
        tbl = match.group(3).lower()
        cols = match.group(4).strip()
        indexes.append((file, tbl, idx_name, unique, cols))

print(f"Unique tables created: {len(tables)}")
print(f"Tables with RLS enabled: {len(rls_enabled)}")
print(f"Unique functions created/replaced: {len(functions)}")
print(f"Total policies defined: {len(policies)}")
print(f"Total indexes defined: {len(indexes)}")

print("\n--- TABLES ---")
for t in sorted(tables.keys()):
    has_rls = t in rls_enabled
    print(f"Table: {t} (RLS: {has_rls}, Defined in: {tables[t][0][0]})")

print("\n--- POLICIES PER TABLE ---")
pol_by_tbl = defaultdict(list)
for f, tbl, p, b in policies:
    pol_by_tbl[tbl].append((f, p, b))

for t in sorted(tables.keys()):
    p_list = pol_by_tbl.get(t, [])
    print(f"Table {t}: {len(p_list)} policies")
    for f, p, b in p_list:
        print(f"  [{f}] Policy: {p} -> {b[:100]}...")

print("\n--- TARGET FUNCTIONS AUDIT ---")
target_funcs = [
    "worker_save_discovery_item",
    "enqueue_evaluation",
    "queue_opportunity_evaluation",
    "confirm_approval",
    "worker_claim_due_discovery",
    "toggle_opportunity_save",
    "set_source_preference",
    "get_home_counter"
]

for tf in target_funcs:
    if tf in functions:
        defs = functions[tf]
        print(f"\nFunction: {tf} ({len(defs)} versions)")
        for d in defs:
            print(f"  File: {d['file']}")
            print(f"  Args: {d['args']}")
            print(f"  Returns: {d['returns']}")
            # Check security definer
            # Let's inspect security definer in migration file
    else:
        print(f"\nFunction: {tf} NOT FOUND by regex! (Checking looser regex)")
