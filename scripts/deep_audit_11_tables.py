import glob
import re
from collections import defaultdict

target_tables = [
    'opportunities',
    'opportunity_requirements',
    'opportunity_sources',
    'raw_items',
    'matches',
    'student_decisions',
    'profiles',
    'standing_rules',
    'weekly_plans',
    'catalog_opportunities',
    'discovery_catalog',
    'discovery_runs'
]

migrations = sorted(glob.glob('supabase/migrations/*.sql'))

# Gather info per table
table_info = {t: {
    'schemas': set(),
    'creations': [],
    'alters': [],
    'rls_enabled': False,
    'policies': [],
    'grants': [],
    'revokes': [],
    'indexes': [],
    'fks': [],
    'checks': [],
    'uniques': []
} for t in target_tables}

for m in migrations:
    with open(m, 'r', encoding='utf-8') as f:
        c = f.read()
    
    for t in target_tables:
        info = table_info[t]
        
        # Check CREATE TABLE (public or opportunityos_private or unqualified)
        for match in re.finditer(rf'create\s+table\s+(?:if\s+not\s+exists\s+)?(?:([a-zA-Z0-9_]+)\.)?{t}\s*\((.*?)\);', c, re.I | re.DOTALL):
            schema = match.group(1).lower() if match.group(1) else 'public'
            info['schemas'].add(schema)
            info['creations'].append((m, schema, match.group(2).strip()))
            
            # parse fks, checks, uniques from def
            body = match.group(2)
            for fk in re.finditer(r'(?:constraint\s+[a-zA-Z0-9_]+\s+)?foreign\s+key\s*\((.*?)\)\s*references\s+(?:([a-zA-Z0-9_]+)\.)?([a-zA-Z0-9_]+)\s*\((.*?)\)(.*?)(?:,|$)', body, re.I):
                info['fks'].append((m, fk.group(1).strip(), fk.group(3).strip(), fk.group(4).strip(), fk.group(5).strip()))
            for col_fk in re.finditer(r'([a-zA-Z0-9_]+)\s+[a-zA-Z0-9_\(\)]+\s+references\s+(?:([a-zA-Z0-9_]+)\.)?([a-zA-Z0-9_]+)\s*(?:\((.*?)\))?(.*?)(?:,|$)', body, re.I):
                info['fks'].append((m, col_fk.group(1).strip(), col_fk.group(3).strip(), col_fk.group(4).strip() or 'id', col_fk.group(5).strip()))
            for chk in re.finditer(r'(?:constraint\s+([a-zA-Z0-9_]+)\s+)?check\s*\((.*?)\)', body, re.I):
                info['checks'].append((m, chk.group(1) or 'inline', chk.group(2).strip()))
            for u in re.finditer(r'(?:constraint\s+([a-zA-Z0-9_]+)\s+)?unique\s*\((.*?)\)', body, re.I):
                info['uniques'].append((m, u.group(1) or 'inline', u.group(2).strip()))

        # Check ALTER TABLE
        for match in re.finditer(rf'alter\s+table\s+(?:only\s+)?(?:([a-zA-Z0-9_]+)\.)?{t}\s+(.*?);', c, re.I | re.DOTALL):
            stmt = match.group(2).strip()
            schema = match.group(1).lower() if match.group(1) else 'public'
            if 'enable row level security' in stmt.lower():
                info['rls_enabled'] = True
            info['alters'].append((m, schema, stmt))
            
            # parse constraint additions
            for fk in re.finditer(r'add\s+constraint\s+([a-zA-Z0-9_]+)\s+foreign\s+key\s*\((.*?)\)\s*references\s+(?:([a-zA-Z0-9_]+)\.)?([a-zA-Z0-9_]+)\s*\((.*?)\)(.*)', stmt, re.I):
                info['fks'].append((m, fk.group(2).strip(), fk.group(4).strip(), fk.group(5).strip(), fk.group(6).strip()))
            for chk in re.finditer(r'add\s+constraint\s+([a-zA-Z0-9_]+)\s+check\s*\((.*?)\)', stmt, re.I):
                info['checks'].append((m, chk.group(1), chk.group(2).strip()))
            for u in re.finditer(r'add\s+constraint\s+([a-zA-Z0-9_]+)\s+unique\s*\((.*?)\)', stmt, re.I):
                info['uniques'].append((m, u.group(1), u.group(2).strip()))

        # Check POLICIES
        for match in re.finditer(rf'create\s+policy\s+(?:"([^"]+)"|([a-zA-Z0-9_]+))\s+on\s+(?:([a-zA-Z0-9_]+)\.)?{t}(.*?);', c, re.I | re.DOTALL):
            pname = match.group(1) or match.group(2)
            pbody = match.group(4).strip()
            info['policies'].append((m, pname, pbody))

        # Check INDEXES
        for match in re.finditer(rf'create\s+(unique\s+)?index\s+(?:if\s+not\s+exists\s+)?([a-zA-Z0-9_]+)\s+on\s+(?:([a-zA-Z0-9_]+)\.)?{t}(.*?);', c, re.I | re.DOTALL):
            unique = bool(match.group(1))
            idx_name = match.group(2)
            idx_detail = match.group(4).strip()
            info['indexes'].append((m, idx_name, unique, idx_detail))

        # Check GRANTS / REVOKES
        for match in re.finditer(rf'grant\s+(.*?)\s+on\s+(?:table\s+)?(?:([a-zA-Z0-9_]+)\.)?{t}\s+to\s+(.*?);', c, re.I):
            privs = match.group(1).strip()
            grantee = match.group(3).strip()
            info['grants'].append((m, privs, grantee))
        for match in re.finditer(rf'revoke\s+(.*?)\s+on\s+(?:table\s+)?(?:([a-zA-Z0-9_]+)\.)?{t}\s+from\s+(.*?);', c, re.I):
            privs = match.group(1).strip()
            grantee = match.group(3).strip()
            info['revokes'].append((m, privs, grantee))

print("=== DEEP DIVE ON 11 TARGET TABLES ===")
for t in target_tables:
    inf = table_info[t]
    print(f"\n#################################################################")
    print(f"TABLE: {t} (Schemas: {inf['schemas']}, RLS: {inf['rls_enabled']})")
    print(f"#################################################################")
    print(f"Creations ({len(inf['creations'])}):")
    for cr in inf['creations']:
        print(f"  - [{cr[0]}] Schema: {cr[1]}")
    print(f"Foreign Keys ({len(inf['fks'])}):")
    for fk in inf['fks']:
        print(f"  - [{fk[0]}] ({fk[1]}) -> {fk[2]}({fk[3]}) {fk[4]}")
    print(f"Check Constraints ({len(inf['checks'])}):")
    for chk in inf['checks']:
        print(f"  - [{chk[0]}] {chk[1]}: CHECK({chk[2]})")
    print(f"Unique Constraints / Indexes ({len(inf['uniques']) + len(inf['indexes'])}):")
    for u in inf['uniques']:
        print(f"  - [{u[0]}] UNIQUE {u[1]} ({u[2]})")
    for idx in inf['indexes']:
        print(f"  - [{idx[0]}] {'UNIQUE ' if idx[2] else ''}INDEX {idx[1]} ON {idx[3]}")
    print(f"Grants ({len(inf['grants'])}):")
    for g in inf['grants']:
        print(f"  - [{g[0]}] GRANT {g[1]} TO {g[2]}")
    print(f"Revokes ({len(inf['revokes'])}):")
    for r in inf['revokes']:
        print(f"  - [{r[0]}] REVOKE {r[1]} FROM {r[2]}")
    print(f"RLS Policies ({len(inf['policies'])}):")
    for p in inf['policies']:
        print(f"  - [{p[0]}] Policy: '{p[1]}'")
        print(f"    Body: {p[2]}")
