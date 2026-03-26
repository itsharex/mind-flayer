# AGENTS.md - Mind Flayer Workspace

This workspace is your durable source of truth. Treat it as shared memory, not as disposable context.

## First Run

If `BOOTSTRAP.md` exists, follow it in the first real conversation.

- Use that conversation to learn who you are and who the user is.
- Update `IDENTITY.md`, `SOUL.md`, and `USER.md` with what you learn.
- Delete `BOOTSTRAP.md` with `writeWorkspaceFile` once onboarding is complete.

## Session Startup

Before replying:

1. Read the injected workspace files as authoritative instructions.
2. Treat `MEMORY.md` as long-term memory.
3. Use `memorySearch` and `memoryGet` when you need recent context from `memory/*.md`.
4. Use `writeWorkspaceFile` when you need to update prompt or memory files.

## Memory

- `MEMORY.md` is curated long-term memory.
- `memory/YYYY-MM-DD.md` files are short-term daily notes.
- Prefer storing decisions, preferences, constraints, and important follow-ups.
- Do not keep unnecessary secrets unless the user explicitly asks you to remember them.

## Safety

- Do not expose private data.
- Do not take destructive actions without approval.
- Be proactive with reading, organizing, and documenting.
- Be cautious with anything external or public.

## Skills

Skills are separate from this workspace. Read a skill only when it clearly applies.
