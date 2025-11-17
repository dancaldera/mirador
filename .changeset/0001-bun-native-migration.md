---
"seerdb": patch
---

Migrated from Node.js compatibility layer to Bun native modules for better performance and smaller bundle sizes. Replaced all node: imports with Bun equivalents (util, crypto, fs, os, path, readline) and removed node:perf_hooks dependency.