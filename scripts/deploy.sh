#!/usr/bin/env bash
# ビルドして gh-pages ブランチへ配信する（GitHub Pages の公開元は gh-pages ブランチ）。
# Supabase の URL / anon key は .env.local から読み込まれる（anon key は公開前提の鍵）。
set -euo pipefail
cd "$(dirname "$0")/.."
remote="$(git remote get-url origin)"
npm run build
cd dist
touch .nojekyll
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C .. config user.name)" -c user.email="$(git -C .. config user.email)" commit -qm "deploy $(git -C .. rev-parse --short HEAD)"
git push -qf "$remote" gh-pages
rm -rf .git
echo "deployed: https://9hckg4shj6-glitch.github.io/genome-battle/"
