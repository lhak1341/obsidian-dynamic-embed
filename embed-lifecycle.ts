import type { TFile } from "obsidian";
import { resolveEmbedTarget } from "./resolve-embed-target";

type Unsubscribe = () => void;

export interface EmbedVaultPort {
    read(file: TFile): Promise<string>;
    onModify(cb: (path: string) => void): Unsubscribe;
    // Fires when a create or rename may have made a broken link resolvable.
    onLinkTargetsChanged(cb: () => void): Unsubscribe;
}

// `Slot` is the view's handle on the content container; opaque to the lifecycle.
export interface EmbedViewPort<Slot> {
    // Paths of every embed already being rendered along the host's ancestor chain.
    ancestorPaths(): string[];
    // Replaces the host's content with an error message.
    showError(message: string): void;
    // Replaces the host's content with an empty slot marked as embedding `path`.
    openSlot(path: string): Slot;
    clearSlot(slot: Slot): void;
    showSlotError(slot: Slot, message: string): void;
}

export interface EmbedRendererPort<Slot> {
    // `hostPath` must be the host note's path, never the embedded file's.
    render(markdown: string, slot: Slot, hostPath: string): Promise<void>;
}

export interface EmbedPorts<Slot> {
    vault: EmbedVaultPort;
    view: EmbedViewPort<Slot>;
    renderer: EmbedRendererPort<Slot>;
    getFirstLinkpathDest: (linkpath: string, sourcePath: string) => TFile | null;
}

export interface MountedEmbed {
    // Resolves after the first render, or after the first error is shown.
    ready: Promise<void>;
    dispose: () => void;
}

export function mountEmbed<Slot>(
    ports: EmbedPorts<Slot>,
    source: string,
    hostPath: string,
): MountedEmbed {
    const { vault, view, renderer, getFirstLinkpathDest } = ports;
    const unsubscribers: Unsubscribe[] = [];
    let dead = false;
    let shownError: string | null = null;
    let initialRender: Promise<void> = Promise.resolve();

    const dispose = () => {
        dead = true;
        for (const unsubscribe of unsubscribers.splice(0)) unsubscribe();
    };

    // Retry fires on every vault create event, so an unchanged error must not redraw.
    const fail = (message: string) => {
        if (shownError === message) return;
        shownError = message;
        view.showError(message);
    };

    const startRender = (file: TFile): Promise<void> => {
        shownError = null;
        const slot = view.openSlot(file.path);

        // Renders never overlap: a refresh requested mid-render is coalesced into
        // one rerun, so two renders can't write into the slot at once and a
        // superseded render's failure can't overwrite newer content.
        let active: Promise<void> | null = null;
        let rerun = false;

        const renderOnce = async () => {
            view.clearSlot(slot);
            const contents = await vault.read(file);
            if (dead || rerun) return;
            await renderer.render(contents, slot, hostPath);
        };

        const refresh = (): Promise<void> => {
            if (active !== null) {
                rerun = true;
                return active;
            }
            active = (async () => {
                try {
                    do {
                        rerun = false;
                        try {
                            await renderOnce();
                        } catch (err) {
                            console.error("Dynamic Embed:", err);
                            if (!rerun && !dead) view.showSlotError(slot, "Render failed");
                        }
                    } while (rerun && !dead);
                } finally {
                    active = null;
                }
            })();
            return active;
        };

        unsubscribers.push(
            vault.onModify((changedPath) => {
                if (changedPath !== file.path) return;
                void refresh();
            }),
        );

        return refresh();
    };

    // Returns true once the embed is settled (rendering or terminally errored),
    // false while the link is still broken and worth retrying.
    const attempt = (): boolean => {
        if (dead) return true;

        const target = resolveEmbedTarget(source, hostPath, getFirstLinkpathDest);
        if ("error" in target) {
            fail(target.error);
            return false;
        }

        if (view.ancestorPaths().includes(target.file.path)) {
            fail("Circular embed detected");
            return true;
        }

        initialRender = startRender(target.file);
        return true;
    };

    if (!attempt()) {
        // Broken link at mount time (target missing/renamed): retry once the vault
        // changes instead of staying stuck until the note reloads.
        const unsubscribeRetry = vault.onLinkTargetsChanged(() => {
            if (attempt()) unsubscribeRetry();
        });
        unsubscribers.push(unsubscribeRetry);
    }

    return { ready: initialRender, dispose };
}
