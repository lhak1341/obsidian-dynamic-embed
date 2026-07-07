import { MarkdownRenderChild, MarkdownRenderer, Plugin } from "obsidian";

export default class DynamicEmbed extends Plugin {
    static readonly codeBlockKeyword = "dynamic-embed";
    static readonly containerClass = "dynamic-embed";
    static readonly errorClass = "dynamic-embed-error";
    static readonly pattern = /\[\[([^[\]]+?)\]\]/u;  // #5 — moved out of hot path

    // #7 — regular static method instead of class-field arrow
    static displayError(parent: HTMLElement, text: string): void {
        parent.createEl("pre", { text: "Dynamic Embed: Error: " + text, cls: [DynamicEmbed.containerClass, DynamicEmbed.errorClass] });
    }

    async onload() {
        this.registerMarkdownCodeBlockProcessor(DynamicEmbed.codeBlockKeyword, async (source, el, ctx) => {
            const fileNameMatch = DynamicEmbed.pattern.exec(source);

            if (!fileNameMatch) {
                DynamicEmbed.displayError(el, "Bad file link");
                return;
            }

            // #2 — strip alias (|) and subpath (#): both are valid Obsidian wikilink syntax
            const fileName = fileNameMatch[1].split("#")[0].split("|")[0].trim();
            const matchingFile = this.app.metadataCache.getFirstLinkpathDest(fileName, ctx.sourcePath);

            if (!matchingFile) {
                DynamicEmbed.displayError(el, "File link not found");
                return;
            }

            if (matchingFile.extension !== "md") {
                DynamicEmbed.displayError(el, "Bad file extension found, expected markdown");
                return;
            }

            // #6 — single-class cls doesn't need an array
            const container = el.createDiv({ cls: DynamicEmbed.containerClass });
            const component = new MarkdownRenderChild(container);
            ctx.addChild(component);

            // #4 — cancel token: superseded renders exit before writing to the DOM
            let renderToken = 0;
            const render = async () => {
                const token = ++renderToken;
                container.empty();
                const fileContents = await this.app.vault.cachedRead(matchingFile);
                if (token !== renderToken) return;
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
