import os
import glob
import re

migrations = sorted(glob.glob("supabase/migrations/*.sql"))
print(f"Found {len(migrations)} migration files.")

# We want to extract:
# 1. All CREATE TABLE statements
# 2. All ALTER TABLE statements (ADD COLUMN, ADD CONSTRAINT, DROP, etc.)
# 3. All CREATE TRIGGER statements
# 4. All CREATE INDEX statements
# 5. All ENABLE ROW LEVEL SECURITY statements
# 6. All CREATE POLICY statements
# 7. Function analysis for the 8 target functions + any other critical functions.

table_creations = {}
alter_statements = []
triggers = []
indexes = []
rls_status = {}
policies = []

for m in migrations:
    with open(m, "r", encoding="utf-8") as f:
        content = f.read()

    # Tables
    # Handle comments and multiline
    for match in re.finditer(r"create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s*\((.*?)\);", content, re.IGNORECASE | re.DOTALL):
        tbl_name = match.group(1).lower()
        table_creations[tbl_name] = (m, match.group(2))

    # Alters
    for match in re.finditer(r"alter\s+table\s+(?:only\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s+(.*?);", content, re.IGNORECASE | re.DOTALL):
        tbl_name = match.group(1).lower()
        stmt = match.group(2).strip()
        if "enable row level security" in stmt.lower():
            rls_status[tbl_name] = True
        else:
            alter_statements.append((m, tbl_name, stmt))

    # Triggers
    for match in re.finditer(r"create\s+trigger\s+([a-zA-Z0-9_]+)\s+(.*?)\s+on\s+(?:public\.)?([a-zA-Z0-9_]+)\s+(.*?);", content, re.IGNORECASE | re.DOTALL):
        trig_name = match.group(1)
        timing = match.group(2).strip()
        tbl_name = match.group(3).lower()
        action = match.group(4).strip()
        triggers.append((m, tbl_name, trig_name, timing, action))

    # Indexes
    for match in re.finditer(r"create\s+(unique\s+)?index\s+(?:if\s+not\s+exists\s+)?([a-zA-Z0-9_]+)\s+on\s+(?:public\.)?([a-zA-Z0-9_]+)(.*?);", content, re.IGNORECASE | re.DOTALL):
        unique = bool(match.group(1))
        idx_name = match.group(2)
        tbl_name = match.group(3).lower()
        details = match.group(4).strip()
        indexes.append((m, tbl_name, idx_name, unique, details))

    # Policies
    for match in re.finditer(r"create\s+policy\s+(?:\"([^\"]+)\"|([a-zA-Z0-9_]+))\s+on\s+(?:public\.)?([a-zA-Z0-9_]+)(.*?);", content, re.IGNORECASE | re.DOTALL):
        pname = match.group(1) or match.group(2)
        tbl_name = match.group(3).lower()
        pbody = match.group(4).strip()
        policies.append((m, tbl_name, pname, pbody))

print("=== TABLES INVENTORY ===")
for tbl, (orig_m, defn) in sorted(table_creations.items()):
    has_rls = rls_status.get(tbl, False)
    tbl_indexes = [idx for idx in indexes if idx[1] == tbl]
    tbl_triggers = [trg for trg in triggers if trg[1] == tbl]
    tbl_policies = [pol for pol in policies if pol[1] == tbl]
    print(f"\nTABLE: {tbl}")
    print(f"  Origin Migration: {orig_m}")
    print(f"  RLS Enabled: {has_rls}")
    print(f"  Indexes count: {len(tbl_indexes)}")
    for idx in tbl_indexes:
        print(f"    - [{idx[0]}] {'UNIQUE ' if idx[3] else ''}{idx[2]} ON {idx[4]}")
    print(f"  Triggers count: {len(tbl_triggers)}")
    for trg in tbl_triggers:
        print(f"    - [{trg[0]}] {trg[2]}: {trg[3]} ON {trg[1]} -> {trg[4]}")
    print(f"  Policies count: {len(tbl_policies)}")
    for pol in tbl_policies:
        print(f"    - [{pol[0]}] {pol[2]}: {pol[3]}")

