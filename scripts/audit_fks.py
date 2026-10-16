import glob
import re

migrations = sorted(glob.glob('supabase/migrations/*.sql'))

fks = []

for m in migrations:
    m_name = m.replace('supabase/migrations\\', '').replace('supabase/migrations/', '')
    with open(m, 'r', encoding='utf-8') as f:
        c = f.read()

    # From CREATE TABLE
    for match in re.finditer(r'create\s+table\s+(?:if\s+not\s+exists\s+)?([a-zA-Z0-9_\.]+)\s*\((.*?)\);', c, re.I | re.DOTALL):
        tbl = match.group(1).lower()
        body = match.group(2)
        
        # table-level FK
        for fk in re.finditer(r'(?:constraint\s+([a-zA-Z0-9_]+)\s+)?foreign\s+key\s*\((.*?)\)\s*references\s+([a-zA-Z0-9_\.]+)\s*\((.*?)\)(.*?)(?:,|$)', body, re.I):
            cname = fk.group(1) or 'unnamed'
            cols = fk.group(2).strip()
            reftbl = fk.group(3).strip()
            refcols = fk.group(4).strip()
            actions = fk.group(5).strip()
            fks.append((m_name, tbl, cname, cols, reftbl, refcols, actions))
            
        # column-level FK: col type references ...
        for cfk in re.finditer(r'([a-zA-Z0-9_]+)\s+[a-zA-Z0-9_\(\)]+(?:\s+not\s+null|\s+null)?\s+references\s+([a-zA-Z0-9_\.]+)(?:\s*\((.*?)\))?(.*?)(?:,|$)', body, re.I):
            col = cfk.group(1).strip()
            reftbl = cfk.group(2).strip()
            refcols = cfk.group(3).strip() or 'id'
            actions = cfk.group(4).strip()
            fks.append((m_name, tbl, 'inline', col, reftbl, refcols, actions))

    # From ALTER TABLE ADD CONSTRAINT
    for match in re.finditer(r'alter\s+table\s+(?:only\s+)?([a-zA-Z0-9_\.]+)\s+add\s+(?:constraint\s+([a-zA-Z0-9_]+)\s+)?foreign\s+key\s*\((.*?)\)\s*references\s+([a-zA-Z0-9_\.]+)\s*\((.*?)\)(.*?);', c, re.I | re.DOTALL):
        tbl = match.group(1).lower()
        cname = match.group(2) or 'unnamed'
        cols = match.group(3).strip()
        reftbl = match.group(4).strip()
        refcols = match.group(5).strip()
        actions = match.group(6).strip()
        fks.append((m_name, tbl, cname, cols, reftbl, refcols, actions))

print(f"Total Foreign Keys Discovered: {len(fks)}")
print(f"{'SOURCE TABLE':32} | {'COLUMNS':20} | {'REFERENCED TABLE':32} | {'REF COLS':10} | {'CASCADE ACTIONS':25} | {'MIGRATION'}")
print("-" * 140)
for m, tbl, cname, cols, reftbl, refcols, actions in fks:
    print(f"{tbl:32} | {cols:20} | {reftbl:32} | {refcols:10} | {actions:25} | {m}")
