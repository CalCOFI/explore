#!/usr/bin/env python3
"""Mirror the release objects this story reads, resolved through the release catalog.

Never builds a releases/{v}/parquet/ path by hand: every object URL is a `path` in catalog.json
(the same rule as src/release.ts, calcofi4r::cc_release_sources() and calcofi4py.release_sources()).

usage: fetch_release.py <dest_dir> [version|latest]
writes <dest_dir>/catalog.json, the objects under <dest_dir>/<catalog path>, and <dest_dir>/views.sql
(one DuckDB view per table; a partitioned table is one view over its partitions, restricted to WANT).
"""
import json, os, sys, urllib.request, concurrent.futures as cf

BASE   = os.environ.get("CALCOFI_DATA_URL", "https://storage.googleapis.com/calcofi-db/").rstrip("/") + "/"
PREFIX = os.environ.get("CALCOFI_RELEASE_PREFIX", "ducklake/releases").strip("/")

# table -> None (every object) or the partition values wanted
TEMPERATURE = ["temperature", "temperature_ave", "btl_temperature", "r_temperature", "ctdtemp_its90"]
WANT = {
  "measurement_type": None, "dataset": None, "cruise": None, "ship": None, "grid": None,
  "sample": None, "sample_root": None, "sample_measurement": None,
  "obs_env":     TEMPERATURE + ["salinity", "salinity_ave_corr", "sigma_theta", "sigma_theta_ave", "sst_c", "tsg1_temp_c"],
  "climatology": TEMPERATURE + ["salinity", "salinity_ave_corr", "sigma_theta", "sigma_theta_ave",
                                "mld_temperature_02", "mld_sigma_theta_002", "mld_sigma_theta_0125"],
  "obs_ctd_full": ["2026-11-33P4"],
}

def get(url, dest, nbytes=None):
  if os.path.exists(dest) and (nbytes is None or os.path.getsize(dest) == nbytes): return "have"
  os.makedirs(os.path.dirname(dest), exist_ok=True)
  tmp = dest + ".part"
  with urllib.request.urlopen(url) as r, open(tmp, "wb") as f:
    while chunk := r.read(1 << 20): f.write(chunk)
  if nbytes is not None and os.path.getsize(tmp) != nbytes:
    raise RuntimeError(f"{url}: {os.path.getsize(tmp)} bytes, catalog says {nbytes}")
  os.replace(tmp, dest)
  return "got"

def main():
  dest    = os.path.abspath(sys.argv[1])
  version = sys.argv[2] if len(sys.argv) > 2 else "latest"
  os.makedirs(dest, exist_ok=True)
  if version == "latest":
    version = urllib.request.urlopen(f"{BASE}{PREFIX}/latest.txt").read().decode().strip()
  get(f"{BASE}{PREFIX}/{version}/catalog.json", os.path.join(dest, "catalog.json"))
  cat = json.load(open(os.path.join(dest, "catalog.json")))
  assert cat["version"] == version, (cat["version"], version)
  tables = {t["name"]: t for t in cat["tables"]}
  jobs, views = [], [f"-- release {version}: views over the mirrored catalog objects (fetch_release.py)"]
  for name, parts in WANT.items():
    t = tables[name]
    seen, files = set(), []
    for o in t.get("objects") or []:
      pv = o.get("partition_value")
      if t["partitioned"] and pv is None: continue            # the single-file twin of a partitioned table
      if parts is not None and pv not in parts: continue
      if o["path"] in seen: continue
      seen.add(o["path"])
      local = os.path.join(dest, o["path"])
      jobs.append((BASE + o["path"], local, o.get("bytes")))
      files.append(local)
    if parts is not None:
      missing = sorted(set(parts) - {o.get("partition_value") for o in t.get("objects") or []})
      if missing: print(f"  {name}: no partition for {missing}", file=sys.stderr)
    lst = ", ".join(f"'{f}'" for f in files)
    hive = ", hive_partitioning = true" if t["partitioned"] else ""
    views.append(f"CREATE OR REPLACE VIEW {name} AS SELECT * FROM read_parquet([{lst}]{hive}, union_by_name = true);")
  with cf.ThreadPoolExecutor(8) as ex:
    res = list(ex.map(lambda j: get(*j), jobs))
  open(os.path.join(dest, "views.sql"), "w").write("\n".join(views) + "\n")
  open(os.path.join(dest, "VERSION"), "w").write(version + "\n")
  print(f"{version}: {len(jobs)} objects ({res.count('got')} fetched, {res.count('have')} already here), "
        f"{sum(j[2] or 0 for j in jobs) / 1e6:.1f} MB -> {dest}")

if __name__ == "__main__":
  main()
