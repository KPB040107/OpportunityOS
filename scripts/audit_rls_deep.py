import glob
import re

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

print("=== DETAILED RLS POLICY & PERMISSION AUDIT ===")

for tbl in target_tables:
    print(f"\n=======================================================")
    print(f"TABLE: {tbl}")
    print(f"=======================================================")
    
    # Track RLS enabled, policies, revokes, grants across migrations
    rls_enabled_in = []
    pols = []
    grants = []
    revokes = []
    
    for m in migrations:
        m_name = m.replace('supabase/migrations\\', '').replace('supabase/migrations/', '')
        with open(m, 'r', encoding='utf-8') as f:
            c = f.read()
            
        # RLS enabled
        if re.search(rf'alter\s+table\s+(?:only\s+)?(?:[a-zA-Z0-9_]+\.)?{tbl}\s+enable\s+row\s+level\s+security', c, re.I):
            rls_enabled_in.append(m_name)
            
        # Policies
        for match in re.finditer(rf'create\s+policy\s+(?:"([^"]+)"|([a-zA-Z0-9_]+))\s+on\s+(?:([a-zA-Z0-9_]+)\.)?{tbl}(.*?);', c, re.I | re.DOTALL):
            pname = match.group(1) or match.group(2)
            schema = match.group(3) or 'public'
            pbody = " ".join(match.group(4).split())
            pols.append((m_name, pname, schema, pbody))
            
        # Grants
        for match in re.finditer(rf'grant\s+(.*?)\s+on\s+(?:table\s+)?(?:([a-zA-Z0-9_]+)\.)?{tbl}\s+to\s+(.*?);', c, re.I):
            privs = " ".join(match.group(1).split())
            to = match.group(3).strip()
            grants.append((m_name, privs, to))
            
        # Revokes
        for match in re.finditer(rf'revoke\s+(.*?)\s+on\s+(?:table\s+)?(?:([a-zA-Z0-9_]+)\.)?{tbl}\s+from\s+(.*?);', c, re.I):
            privs = " ".join(match.group(1).split())
            fro = match.group(3).strip()
            revokes.append((m_name, privs, fro))

    print(f"RLS Enabled In Migrations: {rls_enabled_in}")
    print(f"Active Policies ({len(pols)}):")
    for m, name, sch, body in pols:
        print(f"  [{m}] {name} ON {sch}.{tbl}:")
        print(f"    {body}")
    print(f"Grants ({len(grants)}):")
    for m, p, to in grants:
        print(f"  [{m}] GRANT {p} TO {to}")
    print(f"Revokes ({len(revokes)}):")
    for m, p, fro in revokes:
        print(f"  [{m}] REVOKE {p} FROM {fro}")
