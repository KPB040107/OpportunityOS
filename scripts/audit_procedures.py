import glob
import re

migrations = sorted(glob.glob('supabase/migrations/*.sql'))

target_funcs = [
    'worker_save_discovery_item',
    'enqueue_evaluation',
    'queue_opportunity_evaluation',
    'confirm_approval',
    'worker_claim_due_discovery',
    'toggle_opportunity_save',
    'set_source_preference',
    'get_home_counter'
]

results = {tf: [] for tf in target_funcs}

for m in migrations:
    with open(m, 'r', encoding='utf-8') as f:
        c = f.read()
    for tf in target_funcs:
        # Search for create or replace function public.tf or tf
        pattern = rf"create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?{tf}\s*\((.*?)\)\s*returns\s+(.*?)(?:language\s+[a-zA-Z0-9_]+|security\s+definer|set\s+search_path[^\$]*|as\s+\$\$)*\s*as\s+\$\$(.*?)\$\$;"
        for match in re.finditer(pattern, c, re.IGNORECASE | re.DOTALL):
            args = match.group(1).strip()
            ret = match.group(2).strip()
            body = match.group(3).strip()
            
            # Find declaration header
            full_header = c[max(0, match.start()-100):match.start() + len(match.group(0)) - len(match.group(3)) - 10]
            sec_def = "security definer" in full_header.lower() or "security definer" in match.group(0).lower()
            set_search = "set search_path" in full_header.lower() or "set search_path" in match.group(0).lower()
            
            # Find grant/revoke in this file
            grants = re.findall(rf"grant\s+execute\s+on\s+function\s+(?:public\.)?{tf}.*?to\s+([^;]+);", c, re.I)
            revokes = re.findall(rf"revoke\s+all\s+on\s+function\s+(?:public\.)?{tf}.*?from\s+([^;]+);", c, re.I)
            
            results[tf].append({
                "migration": m,
                "args": args,
                "ret": ret,
                "sec_def": sec_def,
                "set_search": set_search,
                "grants": grants,
                "revokes": revokes,
                "body_len": len(body),
                "body": body
            })

for tf in target_funcs:
    print(f"\n=======================================================")
    print(f"FUNCTION: {tf} (Total definitions: {len(results[tf])})")
    print(f"=======================================================")
    for d in results[tf]:
        print(f"File: {d['migration']}")
        print(f"  Args: {d['args']}")
        print(f"  Returns: {d['ret']}")
        print(f"  Security Definer: {d['sec_def']}")
        print(f"  Set search_path: {d['set_search']}")
        print(f"  Grants in file: {d['grants']}")
        print(f"  Revokes in file: {d['revokes']}")
        print(f"  Body length: {d['body_len']} chars")
