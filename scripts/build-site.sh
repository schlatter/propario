#!/usr/bin/env bash
# Puts the website together in one folder: site/ plus the pictures from docs/images, the logo
# and the app's own fonts (from node_modules, so run `npm ci` first). The Pages workflow
# publishes that folder; open <folder>/index.html to look at it locally.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

out=${1:?usage: $0 <folder>}
fonts=node_modules/@fontsource-variable
for f in "$fonts/public-sans/files/public-sans-latin-wght-normal.woff2" \
	"$fonts/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2"; do
	[ -f "$f" ] || {
		echo "site: $f is missing – run npm ci first" >&2
		exit 1
	}
done

rm -rf "$out"
mkdir -p "$out/images" "$out/fonts"
cp site/* "$out/"
cp docs/images/*.png "$out/images/"
cp public/favicon.svg "$out/"
cp "$fonts/public-sans/files/public-sans-latin-wght-normal.woff2" \
	"$fonts/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2" "$out/fonts/"
echo "site: $out"
