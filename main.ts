import { MarkdownRenderChild, MarkdownRenderer, Plugin } from "obsidian";
import { resolveEmbedTarget } from "./resolve-embed-target";
import { createLatestWinsGate } from "./latest-wins-gate";

export default class DynamicEmbed extends Plugin {
    static readonly codeBlockKeyword = "dynamic-embed";
    static readonly containerClass = "dynamic-embed";
    static readonly errorClass = "dynamic-embed-error";

    // #7 — regular static method instead of class-field arrow
    static displayError(parent: HTMLElement, text: string): void {
        parent.createEl("pre", { text: "Dynamic Embed: Error: " + text, cls: [DynamicEmbed.containerClass, DynamicEmbed.errorClass] });
    }

    async onload() {
        this.registerMarkdownCodeBlockProcessor(DynamicEmbed.codeBlockKeyword, async (source, el, ctx) => {
            const target = resolveEmbedTarget(
                source,
                ctx.sourcePath,
                (linkpath, sourcePath) => this.app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath),
            );

            if ("error" in target) {
                DynamicEmbed.displayError(el, target.error);
                return;
            }

            const matchingFile = target.file;

            // #6 — single-class cls doesn't need an array
            const container = el.createDiv({ cls: DynamicEmbed.containerClass });
            const component = new MarkdownRenderChild(container);
            ctx.addChild(component);

            // #4 — cancel token: superseded renders exit before writing to the DOM
            const gate = createLatestWinsGate();
            const render = async () => {
                const token = gate.bump();
                container.empty();
                const fileContents = await this.app.vault.cachedRead(matchingFile);
                if (!gate.isCurrent(token)) return;
                await MarkdownRenderer.render(this.app, fileContents, container, ctx.sourcePath, component);
            };

            component.registerEvent(
                this.app.vault.on("modify", (changedFile) => {
                    if (changedFile.path !== matchingFile.path) return;
                    // #3 — surface re-render errors instead of swallowing them
                    render().catch(err => {
                        container.empty();
                        DynamicEmbed.displayError(container, "Re-render failed");
                        console.error("Dynamic Embed:", err);
                    });
                })
            );

            await render();
        });
    }
}
