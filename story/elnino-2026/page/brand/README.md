# The calcofi.io brand, v2, as files

Copied verbatim from <https://calcofi.io/brand/v2/> on 2026-11-13 so the story page starts without a request to
calcofi.io: `fonts.css`, `theme.css`, the three font files `fonts.css` names (Source Sans 3 roman and italic, Teko;
variable weight, Latin subsets) and their licences (SIL OFL 1.1). Nothing here is edited. To refresh:

```sh
cd story/elnino-2026/page/brand
for f in fonts.css theme.css fonts/SourceSans3-VF.woff2 fonts/SourceSans3-Italic-VF.woff2 fonts/Teko-VF.woff2 \
         fonts/OFL-SourceSans3.txt fonts/OFL-Teko.txt; do curl -s -o $f https://calcofi.io/brand/v2/$f; done
```
