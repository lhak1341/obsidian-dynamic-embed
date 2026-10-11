import { MarkdownRenderChild, MarkdownRenderer, Plugin, type App } from "obsidian";
import { mountEmbed, type EmbedPorts } from "./embed-lifecycle";

const codeBlockKeyword = "dynamic-embed";
const containerClass = "dynamic-embed";
const errorClass = "dynamic-embed-error";
const embedPathKey = "dynamicEmbedPath";

function displayError(parent: HTMLElement, text: string): void {
    parent.createEl("pre", { text: "Dynamic Embed: Error: " + text, cls: [containerClass, errorClass] });
}

// Ancestor check: nested renders place their container as a DOM descendant
// of the embed that triggered them, so walking up from `el` sees every
// file already being embedded along this chain, however deep.
function ancestorEmbedPaths(el: HTMLElement): string[] {
    const paths: string[] = [];
    for (let node: HTMLElement | null = el; node; node = node.parentElement) {
        const path = node.dataset[embedPathKey];
        if (path) paths.push(path);
    }
    return paths;
}

function obsidianPorts(
    app: App,
    el: HTMLElement,
    component: MarkdownRenderChild,
): EmbedPorts<HTMLElement> {
    return {
        vault: {
            read: (file) => app.vault.cachedRead(file),
            onModify: (cb) => {
                const ref = app.vault.on("modify", (changedFile) => cb(changedFile.path));
                return () => app.vault.offref(ref);
            },
            onLinkTargetsChanged: (cb) => {
                const createRef = app.vault.on("create", cb);
                const renameRef = app.vault.on("rename", cb);
                return () => {
                    app.vault.offref(createRef);
                    app.vault.offref(renameRef);
                };
            },
        },
        view: {
            ancestorPaths: () => ancestorEmbedPaths(el),
            showError: (message) => {
                el.empty();
                displayError(el, message);
            },
            openSlot: (path) => {
                el.empty();
                const slot = el.createDiv({ cls: containerClass });
                slot.dataset[embedPathKey] = path;
                return slot;
            },
            clearSlot: (slot) => slot.empty(),
            showSlotError: (slot, message) => {
                slot.empty();
                displayError(slot, message);
            },
        },
        renderer: {
            render: (markdown, slot, hostPath) =>
                MarkdownRenderer.render(app, markdown, slot, hostPath, component),
        },
        getFirstLinkpathDest: (linkpath, sourcePath) =>
            app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath),
    };
}

export default class DynamicEmbed extends Plugin {
    async onload() {
        this.registerMarkdownCodeBlockProcessor(codeBlockKeyword, async (source, el, ctx) => {
            const component = new MarkdownRenderChild(el);
            ctx.addChild(component);

            // `hostPath` must stay ctx.sourcePath, never the embedded file's own path.
            const { ready, dispose } = mountEmbed(
                obsidianPorts(this.app, el, component),
                source,
                ctx.sourcePath,
            );
            component.register(dispose);
            await ready;
        });
    }
}
