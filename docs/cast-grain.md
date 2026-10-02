# The per-cast grain: derived hydrographic products in the Explorer

Design note for [explore#13](https://github.com/CalCOFI/explore/issues/13) (depends on
[workflows#98](https://github.com/CalCOFI/workflows/issues/98)); decision D2 of the workflows plan
"2026-10-02 After v2026.10.01". Written with the spike on branch `ws-1002e`. Every number below was measured on
release **v2026.10.01** on 2026-10-02.

## The decision

A **per-bin** value is a depth observation (temperature at 40 m): it lives in `obs_env` and every lens reads it. A
**per-cast** value is one number for a whole cast (a mixed-layer depth). It is not a depth observation, so the release
keeps it in `sample_measurement` on the cast's `sample` and does not project it into `obs_env`. The Explorer reads it
with a **consumer-side join** and treats it as a depth-less grain. Nothing in the release changes.

## What the release holds

- `sample_measurement` (2.6 MB, 652,879 rows): `sample_measurement_id, sample_key, dataset_key, measurement_type,
  measurement_value, measurement_qual`. For `calcofi_ctd-derived`: 63,276 rows, 7 types, 9,639 casts, one value per
  cast × type, `measurement_qual` NULL on all of them.
- The row's `sample_key` is the **cast's** (`calcofi_ctd-cast:cast:…`) and its `dataset_key` is the **measurement's**
  (`calcofi_ctd-derived`): the derived dataset publishes no sample of its own.
- Every one of those casts is a root sample: all 63,276 rows join `sample_root` on `root_sample_key`, and `sample`
  and `sample_root` agree on position, time, cruise and grid cell for all 9,639 casts.
- The registry (`measurement_type`) says `grain = sample` for 28 types (7 ctd-derived, 15 bottle-cast weather, 5 tow
  effort, 1 dungeness) and carries `description`, `units`, `derivation`, `category`. `coverage.json` lists
  per-observation types only.

## The join

`sql/slice_cast.sql` builds the same `slice` table the bio and env realms build, so **every lens template runs on it
unchanged**:

```sql
FROM sample_measurement sm JOIN sample_root r ON r.root_sample_key = sm.sample_key
WHERE sm.measurement_type = '<type>'
```

| slice column | per-cast value | why |
|---|---|---|
| `dataset_key` | `sm.dataset_key` | the measurement's dataset is what the pills, the Sources line and the citation read; the cast's own would cite the wrong dataset |
| `obs_id`, `root_id`, `sample_key` | `sample_measurement_id`, the cast's `root_id`, the cast | `root_id` is what `sample_spatial` joins on; `sample_key` leads back to the profile |
| `depth_min_m`, `depth_max_m`, `depth_bin` | NULL | no depth axis: the band never filters it, the depth strip is empty |
| `year`, `quarter`, position, `cruise_key`, `grid_key` | the cast's | from `sample_root` |
| `units` | registry lookup | a scalar subquery, so a repeated registry row cannot double a cast |
| `qual_ok` | `qualOkSQL("sm")` | below |
| `site_key`, `line`, `station`, `hex7` | NULL | `sample_root` carries neither a station nor an H3 cell |

**Why `sample_root`, not `sample`** (D2 says `sample`): it is the release's own cut of `sample` to the samples with no
parent, 10.5 MB against 25.9 MB, with no geometry column, and it carries the `root_id` the Regions lens needs. The
values are the same (measured above). The cost: a per-sample value on a non-root sample (a net's effort) is not
reachable this way, and that family is not in scope.

## Keyed on the registry, not on names

No `measurement_type` name is in the app (`src/castgrain.ts`). A variable is **per-cast** when the release holds no
`obs_env` object for it and its registry row says `grain = sample`. It is **listed** when a derived dataset publishes
it. Its label, units, hover and ramp are the registry's `description`, `units`, `derivation` and `units` again.
The one thing the app states that the registry cannot is which datasets are derived: `DERIVED_DATASETS =
["calcofi_ctd-derived"]`. So when the next release renames the headline MLD and changes the chlorophyll maximum
(workflows#101, #102), the picker, the sentence and the hover follow without an edit; `tests/castgrain.test.ts` pins
that with a type the app has never seen.

The ramp is the case that proves the rule: a per-cast type is named after its criterion. The name rule draws
`mld_sigma_theta_003` as a density and `mld_temperature_02` as a temperature (5 of the 7 types wrong); the registry
units (`m`) say it is a depth.

## Lenses

| lens | per-cast | spike |
|---|---|---|
| Stations | yes: the mean per grid cell | done and verified (97 cells, 9,078 casts) |
| Contours | yes: every cast at its own position, or the station grid | works unchanged |
| Cruises | yes: one dot per cast, a series per cruise | works unchanged |
| Regions | yes: `root_id` ⋈ `sample_spatial` | works unchanged |
| Hexagons | yes, in Wave 2 | says why not: no H3 cell on a cast (see Open) |
| Sections | **per-bin only**: a section cuts depth | says why not; spice and averaged sigma-theta draw there |

## What the UI says

- **Group.** The variable picker lists *Derived (hydrographic)*: everything the derived dataset publishes, per-bin and
  per-cast together, each also under its own category. A `derived` badge on the row; the unit line reads `m · per cast`.
- **Sentence.** *"Mixed-layer depth, sigma-theta increase of 0.03 kg/m3 from 10 m (…) (derived, one value per cast),
  the mean at each station, all years · all seasons."* No depth clause, in the sentence, the phone legend or a figure's
  stamp. The count is **casts**. The Depth pill says *no depth axis*; a `depth=` carried in from another view changes
  nothing.
- **Definition on hover.** The picker row, the word *derived* and *how it is computed* show the registry's
  `description` and `derivation` verbatim. The app writes no formula of its own.
- **Links.** The dataset page (`calcofi.io/datasets/{dataset_key}/`, its methods and citation). The measurement page
  (`calcofi.io/measurements/{type}/`) is designed but not linked yet: the three keys checked today return 404.
- **Attribution.** The view cites `calcofi_ctd-derived` (Sources line, CSV `dataset_key` column, bundle `CITATION.md`).

## Share › Copy code

Copy code and the download bundle hand over the SQL the browser ran, resolved to the catalog's content-addressed URLs
(`src/reproduce.ts`): the slice above, the lens table, the years; no depth-strip query. R and Python embed that same
SQL. Measured on the real release: the bundle's `query/*.sql` run in R and in Python give the app's station table, 97
rows, max |diff| 1.4e-14; the pasted SQL, R and Python each run as copied.

`measurement_qual` goes through `qualOkSQL("sm")` (`src/qual.ts`), byte-identical to `calcofi4r::cc_qual_ok_sql("sm")`.
`obs_env` arrives with `qual_ok` stamped by the release; `sample_measurement` is raw, so the consumer applies it.

## Open, for Ben and the next release

None of these block the grain; each removes a workaround.

1. **Hexagons.** `sample_root` has no H3 cell. Either the release adds `hex7` to `sample_root`, or the app computes it
   with h3-js. Measured: the res-10 cell's res-7 parent of the cast position equals the release's `hex7` for 9,271 of
   9,275 casts; the direct res-7 cell for only 8,609. With h3-js the copied SQL needs DuckDB's `h3` extension.
2. **`coverage.json`** lists no per-sample type, so the app counts `sample_measurement` itself (2.6 MB, fetched after
   the first lens answers). A `grain` field and the per-sample rows would remove that fetch.
3. **Which datasets are derived** is prose in the release. A `dataset.derived_from` would retire the one constant.
4. **The registry's `dataset` column says `ctd-cast`** for all nine derived types; the rows say `calcofi_ctd-derived`.
5. **Flags.** `calcofi_ctd-derived` has no vocabulary in `cc_qual_ok_sql()`. If the next release stamps a flag on a
   derived value, the three runtimes need an arm for it, or the flag is ignored.
6. **Labels.** The label is the registry's `description`, which is long and ends with the part that distinguishes the
   three MLDs. A short label column would fix the picker and the sentence.
