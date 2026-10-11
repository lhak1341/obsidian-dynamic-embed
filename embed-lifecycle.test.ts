import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { TFile } from "obsidian";
import { mountEmbed, type EmbedPorts } from "./embed-lifecycle";

interface Slot {
    path: string;
    content: string[];
}

interface Deferred {
    markdown: string;
    resolve(): void;
    reject(err: Error): void;
}

function fakeFile(path: string, extension = "md"): TFile {
    return { path, extension } as TFile;
}

function setup(options: { files?: Record<string, TFile>; ancestors?: string[] } = {}) {
    const files = options.files ?? {};
    const modifyHandlers = new Set<(path: string) => void>();
    const linkHandlers = new Set<() => void>();
    const hostLog: string[] = []; // what the host element currently shows, as ops
    const slots: Slot[] = [];
    const renders: Deferred[] = [];
    const renderCalls: { slot: Slot; hostPath: string }[] = [];
    let contents: Record<string, string> = {};
    let activeRenders = 0;
    let maxActiveRenders = 0;

    const ports: EmbedPorts<Slot> = {
        vault: {
            read: (file) => Promise.resolve(contents[file.path] ?? ""),
            onModify: (cb) => {
                modifyHandlers.add(cb);
                return () => modifyHandlers.delete(cb);
            },
            onLinkTargetsChanged: (cb) => {
                linkHandlers.add(cb);
                return () => linkHandlers.delete(cb);
            },
        },
        view: {
            ancestorPaths: () => options.ancestors ?? [],
            showError: (message) => hostLog.push("error:" + message),
            openSlot: (path) => {
                const slot: Slot = { path, content: [] };
                slots.push(slot);
                hostLog.push("slot:" + path);
                return slot;
            },
            clearSlot: (slot) => {
                slot.content = [];
            },
            showSlotError: (slot, message) => {
                hostLog.push("slot-error:" + message);
                slot.content = ["error:" + message];
            },
        },
        renderer: {
            render: (markdown, slot, hostPath) => {
                renderCalls.push({ slot, hostPath });
                activeRenders++;
                maxActiveRenders = Math.max(maxActiveRenders, activeRenders);
                return new Promise<void>((resolve, reject) => {
                    renders.push({
                        markdown,
                        resolve: () => {
                            activeRenders--;
                            slot.content.push(markdown);
                            resolve();
                        },
                        reject: (err) => {
                            activeRenders--;
                            reject(err);
                        },
                    });
                });
            },
        },
        getFirstLinkpathDest: (linkpath) => files[linkpath] ?? null,
    };

    return {
        ports,
        hostLog,
        slots,
        renders,
        renderCalls,
        modifyHandlers,
        linkHandlers,
        setContents: (next: Record<string, string>) => (contents = next),
        maxActiveRenders: () => maxActiveRenders,
        modify: (path: string) => modifyHandlers.forEach((cb) => cb(path)),
        linkTargetsChanged: () => [...linkHandlers].forEach((cb) => cb()),
    };
}

// Lets the awaited vault read inside a render settle.
// Flushes the microtask queue so awaited vault reads inside a render settle.
async function settle(): Promise<void> {
    for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe("mountEmbed", () => {
    let errorSpy: MockInstance<typeof console.error>;

    beforeEach(() => {
        errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("renders the target with the host note's path as sourcePath", async () => {
        const env = setup({ files: { Note: fakeFile("folder/Note.md") } });
        env.setContents({ "folder/Note.md": "# hi" });

        const { ready } = mountEmbed(env.ports, "[[Note]]", "Host.md");
        await settle();
        env.renders[0].resolve();
        await ready;

        expect(env.renderCalls).toHaveLength(1);
        expect(env.renderCalls[0].hostPath).toBe("Host.md");
        expect(env.slots[0].content).toEqual(["# hi"]);
    });

    it("shows an error and resolves ready for a bad link", async () => {
        const env = setup();

        const { ready } = mountEmbed(env.ports, "no link here", "Host.md");
        await ready;

        expect(env.hostLog).toEqual(["error:Bad file link"]);
    });

    it("retries after link targets change, then stops listening", async () => {
        const files: Record<string, TFile> = {};
        const env = setup({ files });
        env.setContents({ "Note.md": "body" });

        mountEmbed(env.ports, "[[Note]]", "Host.md");
        expect(env.hostLog).toEqual(["error:File link not found"]);
        expect(env.linkHandlers.size).toBe(1);

        files.Note = fakeFile("Note.md");
        env.linkTargetsChanged();

        expect(env.hostLog).toEqual(["error:File link not found", "slot:Note.md"]);
        expect(env.linkHandlers.size).toBe(0);
    });

    it("does not redraw an unchanged error on repeated retries", () => {
        const env = setup();

        mountEmbed(env.ports, "[[Missing]]", "Host.md");
        env.linkTargetsChanged();
        env.linkTargetsChanged();

        expect(env.hostLog).toEqual(["error:File link not found"]);
    });

    it("refuses a target already on the ancestor chain", async () => {
        const env = setup({
            files: { Note: fakeFile("Note.md") },
            ancestors: ["Note.md"],
        });

        const { ready } = mountEmbed(env.ports, "[[Note]]", "Host.md");
        await ready;

        expect(env.hostLog).toEqual(["error:Circular embed detected"]);
        expect(env.renderCalls).toHaveLength(0);
        expect(env.linkHandlers.size).toBe(0);
    });

    it("re-renders when the target is modified and ignores other files", async () => {
        const env = setup({ files: { Note: fakeFile("Note.md") } });
        env.setContents({ "Note.md": "v1" });
        const { ready } = mountEmbed(env.ports, "[[Note]]", "Host.md");
        await settle();
        env.renders[0].resolve();
        await ready;

        env.modify("Other.md");
        await settle();
        expect(env.renders).toHaveLength(1);

        env.setContents({ "Note.md": "v2" });
        env.modify("Note.md");
        await settle();
        env.renders[1].resolve();

        expect(env.slots[0].content).toEqual(["v2"]);
    });

    it("never overlaps renders: a mid-render modify is coalesced into one rerun", async () => {
        const env = setup({ files: { Note: fakeFile("Note.md") } });
        env.setContents({ "Note.md": "v1" });
        mountEmbed(env.ports, "[[Note]]", "Host.md");
        await settle();
        expect(env.renders).toHaveLength(1);

        env.setContents({ "Note.md": "v2" });
        env.modify("Note.md");
        env.modify("Note.md");
        await settle();
        expect(env.renders).toHaveLength(1);

        env.renders[0].resolve();
        await settle();
        expect(env.renders).toHaveLength(2);
        env.renders[1].resolve();
        await settle();

        expect(env.maxActiveRenders()).toBe(1);
        expect(env.slots[0].content).toEqual(["v2"]);
    });

    it("ignores a superseded render's failure", async () => {
        const env = setup({ files: { Note: fakeFile("Note.md") } });
        env.setContents({ "Note.md": "v1" });
        mountEmbed(env.ports, "[[Note]]", "Host.md");
        await settle();

        env.modify("Note.md");
        env.renders[0].reject(new Error("boom"));
        await settle();
        env.renders[1].resolve();
        await settle();

        expect(env.hostLog).not.toContain("slot-error:Render failed");
        expect(env.slots[0].content).toEqual(["v1"]);
    });

    it("shows 'Render failed' when the latest render fails", async () => {
        const env = setup({ files: { Note: fakeFile("Note.md") } });
        const { ready } = mountEmbed(env.ports, "[[Note]]", "Host.md");
        await settle();

        env.renders[0].reject(new Error("boom"));
        await ready;

        expect(env.slots[0].content).toEqual(["error:Render failed"]);
        expect(errorSpy).toHaveBeenCalled();
    });

    it("writes nothing and unsubscribes everything after dispose mid-render", async () => {
        const env = setup({ files: { Note: fakeFile("Note.md") } });
        env.setContents({ "Note.md": "v1" });
        const { dispose } = mountEmbed(env.ports, "[[Note]]", "Host.md");
        expect(env.modifyHandlers.size).toBe(1);

        dispose();
        await settle();

        expect(env.renderCalls).toHaveLength(0);
        expect(env.modifyHandlers.size).toBe(0);
        expect(env.linkHandlers.size).toBe(0);
    });
});
