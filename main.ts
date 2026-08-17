import { MarkdownRenderChild, MarkdownRenderer, Plugin, type TFile } from "obsidian";
import { resolveEmbedTarget } from "./resolve-embed-target";
import { createLatestWinsGate } from "./latest-wins-gate";

// Ancestor check: nested renders place their container as a DOM descendant
// of the embed that triggered them, so walking up from `el` sees every
// file already being embedded along this chain, however deep.
function findCircularEmbed(el: HTMLElement, targetPath: string): boolean {
    for (let node: HTMLElement | null = el; node; node = node.parentElement) {
        if (node.dataset.dynamicEmbedPath === targetPath) return true;
    }
    return false;
}

export default class DynamicEmbed extends Plugin {
    static readonly codeBlockKeyword = "dynamic-embed";
    static readonly containerClass = "dynamic-embed";
    static readonly errorClass = "dynamic-embed-error";

    // Regular static method instead of a class-field arrow: no `this` capture needed.
    static displayError(parent: HTMLElement, text: string): void {
        parent.createEl("pre", { text: "Dynamic Embed: Error: " + text, cls: [DynamicEmbed.containerClass, DynamicEmbed.errorClass] });
    }

    async onload() {
        this.registerMarkdownCodeBlockProcessor(DynamicEmbed.codeBlockKeyword, async (source, el, ctx) => {
            const component = new MarkdownRenderChild(el);
            ctx.addChild(component);

            const getFirstLinkpathDest = (linkpath: string, sourcePath: string) =>
                this.app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);

            const setupEmbed = (matchingFile: TFile): Promise<void> => {
                if (findCircularEmbed(el, matchingFile.path)) {
                    el.empty();
                    DynamicEmbed.displayError(el, "Circular embed detected");
                    return Promise.resolve();
                }

                el.empty();
                // Single-class cls doesn't need an array here.
                const container = el.createDiv({ cls: DynamicEmbed.containerClass });
                container.dataset.dynamicEmbedPath = matchingFile.path;

                // Cancel token: superseded renders exit before writing to the DOM.
                const gate = createLatestWinsGate();
                const render = async () => {
                    const token = gate.bump();
                    container.empty();
                    const fileContents = await this.app.vault.cachedRead(matchingFile);
                    if (!gate.isCurrent(token)) return;
                    await MarkdownRenderer.render(this.app, fileContents, container, ctx.sourcePath, component);
                };

                // Surface render errors instead of swallowing them, for every
                // call site (initial render, retry-triggered, and re-render).
                const renderSafely = () => render().catch(err => {
                    container.empty();
                    DynamicEmbed.displayError(container, "Render failed");
                    console.error("Dynamic Embed:", err);
                });

                component.registerEvent(
                    this.app.vault.on("modify", (changedFile) => {
                        if (changedFile.path !== matchingFile.path) return;
                        void renderSafely();
                    })
                );

                return renderSafely();
            };

            const attemptResolve = (): Promise<void> | false => {
                const target = resolveEmbedTarget(source, ctx.sourcePath, getFirstLinkpathDest);

                if ("error" in target) {
                    el.empty();
                    DynamicEmbed.displayError(el, target.error);
                    return false;
                }

                return setupEmbed(target.file);
            };

            const initial = attemptResolve();
            if (initial !== false) {
                await initial;
                return;
            }

            // Broken link at render time (target missing/renamed): retry once the
            // vault changes instead of staying stuck until the note reloads.
            const retry = () => {
                if (attemptResolve() !== false) {
                    this.app.vault.offref(createRef);
                    this.app.vault.offref(renameRef);
                }
            };
            const createRef = this.app.vault.on("create", retry);
            const renameRef = this.app.vault.on("rename", retry);
            component.registerEvent(createRef);
            component.registerEvent(renameRef);
        });
    }
}
