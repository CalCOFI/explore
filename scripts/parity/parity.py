"""D10 parity: run a downloaded bundle's query/*.sql in Python and compare the lens table to the CSV the browser wrote.
usage: python scripts/parity/parity.py <unzipped bundle dir>"""
import glob, os, re, sys
import duckdb, pandas as pd
os.chdir(sys.argv[1] if len(sys.argv) > 1 else ".")
con = duckdb.connect(); con.execute("INSTALL httpfs; LOAD httpfs")
def run(f):
    sql = open(f"query/{f}").read()
    return con.execute(sql) if re.match(r"^\s*(--.*\n)*\s*CREATE", sql) else con.execute(sql).df()
fs = sorted(os.path.basename(f) for f in glob.glob("query/*.sql")); run(fs[0]); r = run(fs[1])
app = pd.read_csv(glob.glob("data/summary/*.csv")[0])
key = [c for c in r.columns if c in app.columns][0]
m = r.merge(app, on=key, suffixes=("_py", "_app"))
num = [c for c in r.columns if c != key and c in app.columns and pd.api.types.is_numeric_dtype(r[c]) and pd.api.types.is_numeric_dtype(app[c])]
maxd = max((m[f"{c}_py"] - m[f"{c}_app"]).abs().max() for c in num)
ok = len(r) == len(app) == len(m) and maxd < 1e-9
print(f"{fs[1]}: py rows {len(r)} · app rows {len(app)} · matched {len(m)} on {key} · max |diff| over {','.join(num)} = {maxd:.3g} → {'PARITY' if ok else 'MISMATCH'}")
sys.exit(0 if ok else 1)
