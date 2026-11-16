#!/usr/bin/env python3
"""Assemble out/findings.md from findings.template.md and the tables the queries wrote.

The prose is authored in the template; every table is generated: `{{table:NAME}}` becomes the markdown rendering of
<out>/tables/NAME.csv (optionally `{{table:NAME|col1,col2}}` to keep a subset of its columns, in that order, and
`{{table:NAME|...|head=N}}` to keep the first N rows). `{{release}}` is the release version the mirror was built from.

usage: build_findings.py <template.md> <out_dir> <release_version>
"""
import csv, os, re, sys

def md_table(path, cols=None, head=None):
  rows = list(csv.reader(open(path, newline="")))
  hdr, body = rows[0], rows[1:]
  if cols:
    idx = [hdr.index(c) for c in cols]
    hdr, body = [hdr[i] for i in idx], [[r[i] for i in idx] for r in body]
  if head: body = body[:head]
  num = [all(re.fullmatch(r"-?\d+(\.\d+)?", r[i] or "0") for r in body) for i in range(len(hdr))]
  out = ["| " + " | ".join(h.replace("_", " ") for h in hdr) + " |",
         "|" + "|".join("---:" if n else "---" for n in num) + "|"]
  out += ["| " + " | ".join(c.replace("|", "/") for c in r) + " |" for r in body]
  return "\n".join(out)

def main():
  template, out_dir, release = sys.argv[1:4]
  text = open(template).read().replace("{{release}}", release)
  def sub(m):
    parts = m.group(1).split("|")
    name, cols, head = parts[0], None, None
    for p in parts[1:]:
      if p.startswith("head="): head = int(p[5:])
      elif p: cols = [c.strip() for c in p.split(",")]
    return md_table(os.path.join(out_dir, "tables", name + ".csv"), cols, head)
  text = re.sub(r"\{\{table:([^}]+)\}\}", sub, text)
  left = re.findall(r"\{\{[^}]+\}\}", text)
  if left: sys.exit(f"unresolved placeholders: {left}")
  open(os.path.join(out_dir, "findings.md"), "w").write(text)
  print(f"wrote {os.path.join(out_dir, 'findings.md')} ({len(text.splitlines())} lines)")

if __name__ == "__main__":
  main()
