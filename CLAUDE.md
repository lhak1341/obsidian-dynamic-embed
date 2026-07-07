# obsidian-dynamic-embed

## ESLint
ESLint 10 is installed — flat config only (`eslint.config.mjs`). Do not add `.eslintrc`; it is silently ignored by ESLint 10.

## Obsidian API
`MarkdownRenderer.render(app, markdown, el, sourcePath, component)` — `sourcePath` must always be `ctx.sourcePath` (the host note that owns the rendered block). Do not pass the embedded/source file's path here, even when rendering another file's content; doing so misdirects Obsidian's internal rendering registry.
