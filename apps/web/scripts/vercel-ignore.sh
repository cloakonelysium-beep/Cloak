#!/bin/sh
# Vercel's "Ignored Build Step" (apps/web/vercel.json): exit 0 skips the build, exit 1 builds.
# The claude/ branch only mirrors main, so it never builds a preview of its own.
case "$VERCEL_GIT_COMMIT_REF" in claude/*) exit 0 ;; esac
cd ../..
PREV="${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}"
# the previous commit missing from Vercel's clone: build rather than fail
git cat-file -e "$PREV" 2>/dev/null || exit 1
# build only when something the site uses changed
git diff --quiet "$PREV" HEAD -- apps/web packages pnpm-lock.yaml package.json pnpm-workspace.yaml deployments
