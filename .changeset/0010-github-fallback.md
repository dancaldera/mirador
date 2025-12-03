---
"seerdb": patch
---

Fixed sdb opencode run and sdb --copy to fetch AGENTS.md from GitHub when local file is not available in compiled binary. Now works properly in production builds without requiring source files. Changed command execution to use stdin instead of command-line arguments for better handling of special characters in prompts.
