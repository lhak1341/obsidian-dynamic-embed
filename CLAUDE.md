# obsidian-dynamic-embed

House conventions for Obsidian plugin repos live in the `obsidian-plugin-dev` skill.
Only repo-specific facts are below.

Plugin lives at repo root, no `src/`. `main.ts` holds the Obsidian-coupled `Plugin`
subclass; Obsidian-free pure logic (e.g. `resolve-embed-target.ts`) gets its own root-level
file instead of a static method on the class — it's the only way to unit-test it without
mocking `obsidian`, which has no runtime `main` and can't be value-imported outside the app.

## Core constraint

`MarkdownRenderer.render(app, markdown, el, sourcePath, component)` — `sourcePath` must
always be `ctx.sourcePath`, the host note that owns the rendered block. Passing the
embedded file's own path, even though this plugin renders another file's content, misdirects
Obsidian's internal rendering registry. This is the plugin's central invariant, not an
incidental detail.

## Testing

Pure-logic unit tests use vitest (`bun run test`); each test file colocates at the repo
root next to the module it tests (e.g. `resolve-embed-target.test.ts` next to
`resolve-embed-target.ts`). No Obsidian mocking — testable seams take narrow function
dependencies instead of Obsidian objects, and `obsidian` types are imported with
`import type` only.

`embed-lifecycle.ts` takes vault, view and renderer ports; `main.ts` holds the only Obsidian
adapters for them, and `embed-lifecycle.test.ts` holds the in-memory ones. Vitest runs in
node, so DOM work belongs behind the view port. Domain terms are in `CONTEXT.md`.
