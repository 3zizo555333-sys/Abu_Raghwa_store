#!/usr/bin/env python3
"""Parse Supabase migration DDL without connecting to a remote project."""
from pathlib import Path
import re
import sys

try:
    from pglast import parse_plpgsql, parse_sql
except ImportError as exc:
    print("pglast is required: python -m pip install pglast", file=sys.stderr)
    raise SystemExit(2) from exc

ROOT = Path(__file__).resolve().parents[1]
files = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))
if not files:
    print("No Supabase migrations found", file=sys.stderr)
    raise SystemExit(1)
for migration in files:
    source = migration.read_text(encoding="utf-8")
    statements = parse_sql(source)
    functions = re.findall(r"create\s+or\s+replace\s+function\s+.*?\$\$;", source, re.IGNORECASE | re.DOTALL)
    plpgsql = [function for function in functions if re.search(r"\blanguage\s+plpgsql\b", function, re.IGNORECASE)]
    for function in plpgsql:
        try:
            parse_plpgsql(function)
        except Exception as exc:
            known_enum_parser_limit = (
                migration.name == "20261027221000_purchase_raffles_trivia_live_stage.sql"
                and "create or replace function public.start_community_draw(" in function.lower()
                and '"v_status" is not a scalar variable' in str(exc)
            )
            if not known_enum_parser_limit:
                raise
            print("Known pglast limitation: PostgreSQL validates start_community_draw during supabase start.")
    print(f"{migration.relative_to(ROOT)}: parsed {len(statements)} PostgreSQL statements and {len(plpgsql)} PL/pgSQL bodies")
test_files = sorted((ROOT / "supabase" / "tests").glob("*.sql"))
for test_file in test_files:
    statements = parse_sql(test_file.read_text(encoding="utf-8"))
    print(f"{test_file.relative_to(ROOT)}: parsed {len(statements)} pgTAP SQL statements")
print("Note: static parsing does not apply the migration or prove runtime constraints, privileges, RLS isolation, or RPC behavior.")
