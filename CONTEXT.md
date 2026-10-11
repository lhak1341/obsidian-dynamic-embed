# obsidian-dynamic-embed

**Host note** — the note that owns a `dynamic-embed` block; its path is `ctx.sourcePath`. Rendering always passes the host note's path as `sourcePath`, never the embed target's.

**Embed target** — the markdown file a block's `[[link]]` resolves to. Non-markdown files and unresolved links are errors, not targets.

**Embed lifecycle** — everything a block does from mount to dispose: resolve the link, retry while it is broken, refuse circular embeds, render the target, re-render when it is modified, show errors. Lives in `embed-lifecycle.ts` behind vault, view and renderer ports.
