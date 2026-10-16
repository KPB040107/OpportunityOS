import glob
import re
from collections import defaultdict

migrations = sorted(glob.glob('supabase/migrations/*.sql'))

funcs = defaultdict(list)

for m in migrations:
    m_name = m.replace('supabase/migrations\\', '').replace('supabase/migrations/', '')
    with open(m, 'r', encoding='utf-8') as f:
        c = f.read()

    # match function creations
    for match in re.finditer(r'create\s+(?:or\s+replace\s+)?function\s+(?:([a-zA-Z0-9_]+)\.)?([a-zA-Z0-9_]+)\s*\((.*?)\)\s*returns\s+([^\$]+?)\s+as\s+(\$\$|\$body\$|[\'\"])([\s\S]*?)\5', c, re.I):
        schema = match.group(1) or 'public'
        name = match.group(2).lower()
        args = " ".join(match.group(3).split())
        ret_and_props = match.group(4)
        body = match.group(6)
        
        sec_def = "security definer" in ret_and_props.lower()
        sec_inv = "security invoker" in ret_and_props.lower()
        search_path = re.search(r"set\s+search_path\s*=\s*['\"]?([a-zA-Z0-9_,'\"\s]*)['\"]?", ret_and_props, re.I)
        sp_val = search_path.group(1).strip() if search_path else "NOT SET"
        
        # Grants/revokes in this file
        grants = re.findall(rf'grant\s+execute\s+on\s+function\s+(?:public\.)?{name}.*?to\s+([^;]+);', c, re.I)
        revokes = re.findall(rf'revoke\s+(?:all|execute)\s+on\s+function\s+(?:public\.)?{name}.*?from\s+([^;]+);', c, re.I)
        
        funcs[name].append({
            'migration': m_name,
            'schema': schema,
            'args': args,
            'sec_def': sec_def,
            'search_path': sp_val,
            'grants': grants,
            'revokes': revokes
        })

print(f"Total Unique Functions: {len(funcs)}")
print(f"{'FUNCTION NAME':35} | {'DEFINER':7} | {'SEARCH_PATH':15} | {'LATEST FILE':30} | {'VERSIONS'}")
print("-" * 105)

missing_search_path = []
for name in sorted(funcs.keys()):
    latest = funcs[name][-1]
    is_sec_def = latest['sec_def']
    sp = latest['search_path']
    if sp == "NOT SET":
        missing_search_path.append((name, latest['migration'], is_sec_def))
    print(f"{name:35} | {str(is_sec_def):7} | {sp:15} | {latest['migration']:30} | {len(funcs[name])}")

print(f"\nFunctions missing set search_path ({len(missing_search_path)}):")
for name, m, sd in missing_search_path:
    print(f"  - {name} (File: {m}, Security Definer: {sd})")
