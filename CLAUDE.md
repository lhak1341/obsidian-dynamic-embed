# obsidian-dynamic-embed

House conventions for Obsidian plugin repos live in the `obsidian-plugin-dev` skill.
Only repo-specific facts are below.

Single-file plugin (`main.ts` at repo root, no `src/`).

## Core constraint

`MarkdownRenderer.render(app, markdown, el, sourcePath, component)` — `sourcePath` must
always be `ctx.sourcePath`, the host note that owns the rendered block. Passing the
embedded file's own path, even though this plugin renders another file's content, misdirects
Obsidian's internal rendering registry. This is the plugin's central invariant, not an
incidental detail.
