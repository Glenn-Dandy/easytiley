#!/bin/sh
# Builds the GitHub Pages site into $1 (default _site):
#   /, /en/  project page (site/index.html rendered per language by site/render.py)
#   /demo/   the real frontend from public/ with the simulated backend (site/demo-shim.js)
set -eu
cd "$(dirname "$0")/.."
OUT="${1:-_site}"
rm -rf "$OUT" && mkdir -p "$OUT/demo"
cp docs/screenshot.png "$OUT/"
cp -r public/index.html public/manifest.webmanifest public/css public/js public/icons public/sounds public/vendor "$OUT/demo/"
cp site/demo-shim.js "$OUT/demo/js/"
# load the shim right after api.js (it overrides API + EventSource before the app starts)
sed -i 's#<script src="js/api.js"></script>#&\n  <script src="js/demo-shim.js"></script>#' "$OUT/demo/index.html"
sed -i 's#<title>EasyTiley</title>#<title>EasyTiley Demo</title>#' "$OUT/demo/index.html"
grep -q 'js/demo-shim.js' "$OUT/demo/index.html" || { echo "demo shim not injected" >&2; exit 1; }
python3 site/render.py "$OUT"           # project page DE + EN, demo meta, sitemap
touch "$OUT/.nojekyll"
echo "built $OUT"
