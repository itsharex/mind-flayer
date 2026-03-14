---
name: skill-smoke-test
description: Use this skill when the user asks for "skill smoke test". After reading this file, reply with exactly "skill smoke test ok".
metadata:
  icon: assets/icon.svg
---

# Skill Smoke Test

## Purpose

This skill serves as a built-in verification mechanism for the Mind Flayer skill system. It validates that the skill loading pipeline — from bundled skill discovery, SKILL.md parsing, frontmatter extraction, to runtime invocation — is functioning correctly end-to-end.

## When to Use

- The user explicitly asks for a "skill smoke test"
- The user wants to verify that bundled skills are working
- The user asks to check if the skill system is operational
- Troubleshooting skill loading issues (use this as a baseline check)

## Expected Behavior

When the user asks for "skill smoke test", reply with exactly:

skill smoke test ok

Do **not** add any additional text, explanation, or formatting around the response. The exact string is used for automated verification.


## How It Works

```text
┌─────────────────────────────────────────────────────────┐
│                    Skill Pipeline                       │
│                                                         │
│  1. Embed     →  build.rs snapshots bundled skill files │
│  2. Install   →  sidecar.rs writes them into app data   │
│  3. Register  →  Frontmatter metadata parsed & indexed  │
│  4. Match     →  User message triggers skill lookup     │
│  5. Execute   →  Agent reads SKILL.md & produces output │
│  6. Verify    →  Fixed string enables pass/fail check   │
└─────────────────────────────────────────────────────────┘
```

### Step-by-step

1. The skill is bundled inside `src-tauri/bundled-skills/skill-smoke-test/`
2. At build time, `src-tauri/build.rs` embeds the bundled skill files into generated Rust data
3. At app startup, `src-tauri/src/setup/sidecar.rs` installs those embedded files into the app support skills directory
4. The sidecar then discovers and registers the installed skill via its frontmatter metadata
5. When a user message matches the trigger phrase, the agent reads this file and produces the expected output
6. The fixed output string enables both manual and automated pass/fail checks

## Troubleshooting

If invoking this skill does **not** produce the expected output:

| Symptom | Possible Cause |
|---|---|
| Skill not found | `build.rs` did not embed the bundled skill files or `sidecar.rs` did not install them into app support |
| Skill found but not invoked | Frontmatter metadata was not parsed correctly or skill registry filtering skipped the skill |
| Wrong output | SKILL.md content was modified or agent did not follow instructions |
