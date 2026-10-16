import glob
import re

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

migrations = sorted(glob.glob('supabase/migrations/*.sql'))

# Find the latest definition for each
latest_def = {}

for m in migrations:
    with open(m, 'r', encoding='utf-8') as f:
        c = f.read()
    for tf in target_funcs:
        pattern = rf"create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?{tf}\s*\((.*?)\)\s*returns\s+(.*?)(?:language\s+[a-zA-Z0-9_]+|security\s+definer|set\s+search_path[^\$]*|as\s+\$\$)*\s*as\s+\$\$(.*?)\$\$;"
        for match in re.finditer(pattern, c, re.IGNORECASE | re.DOTALL):
            header = c[max(0, match.start()-100):match.start() + len(match.group(0)) - len(match.group(3)) - 10]
            latest_def[tf] = {
                'migration': m,
                'args': match.group(1).strip(),
                'returns': match.group(2).strip(),
                'header': header,
                'body': match.group(3).strip()
            }

for tf in target_funcs:
    info = latest_def[tf]
    print(f"\n=======================================================")
    print(f"LATEST {tf} (from {info['migration']})")
    print(f"ARGS: {info['args']}")
    print(f"RETURNS: {info['returns']}")
    print(f"=======================================================")
    print(info['body'])
