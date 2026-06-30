# Verification Report: fix-bazel-compat

- **Date**: 2026-06-30
- **Change**: fix-bazel-compat
- **Workflow**: hotfix
- **Verify Mode**: light

## Summary

Fix: Add try/catch around grammar loading in parse-worker.ts to prevent worker crashes when tree-sitter WASM grammars have incompatible language versions during AOSP federation indexing.

## Light Verification Results

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 1 | tasks.md all done | ✅ PASS | 3/3 tasks completed |
| 2 | Changed files match tasks.md | ✅ PASS | parse-worker.ts (+8 lines), parse-pool.ts (+9 lines) |
| 3 | Build passes | ✅ PASS | `npm run build` exit 0 |
| 4 | Tests pass | ✅ PASS | 1738 passed, 8 pre-existing failures (unrelated) |
| 5 | No security issues | ✅ PASS | No secrets, no unsafe ops |
| 6 | Light code review | ✅ PASS | 1 CRITICAL + 1 IMPORTANT fixed before final build |

## Code Review Fixes Applied

- **CRITICAL**: Moved `grammars-loaded` into try block (was sent unconditionally)
- **IMPORTANT**: Added `parentPort?.` null-guard in catch block

## Files Changed

- `src/extraction/parse-worker.ts` — try/catch wrapper for `loadGrammarsForLanguages()`
- `src/extraction/parse-pool.ts` — `grammar-load-error` message handler + worker termination

## Accepted Deviations

- Pre-existing test failures in `multi-repo-workspace.test.ts` (5 tests) and `workspace-scanner.test.ts` (3 tests) — unrelated to this change
