import { describe, expect, it } from "vitest";
import type { TFile } from "obsidian";
import { resolveEmbedTarget } from "./resolve-embed-target";

function fakeFile(path: string, extension: string): TFile {
    return { path, extension } as TFile;
}

describe("resolveEmbedTarget", () => {
    it("resolves a valid link to its file", () => {
        const target = fakeFile("Note.md", "md");
        const result = resolveEmbedTarget("[[Note]]", "Host.md", (linkpath, sourcePath) => {
            expect(linkpath).toBe("Note");
            expect(sourcePath).toBe("Host.md");
            return target;
        });

        expect(result).toEqual({ file: target });
    });

    it("strips alias and subpath before resolving", () => {
        const target = fakeFile("Note.md", "md");
        const result = resolveEmbedTarget("[[Note#heading|alias]]", "Host.md", (linkpath) => {
            expect(linkpath).toBe("Note");
            return target;
        });

        expect(result).toEqual({ file: target });
    });

    it("errors when the file link can't be resolved", () => {
        const result = resolveEmbedTarget("[[Missing]]", "Host.md", () => null);

        expect(result).toEqual({ error: "File link not found" });
    });

    it("errors when the resolved file isn't markdown", () => {
        const target = fakeFile("Image.png", "png");
        const result = resolveEmbedTarget("[[Image]]", "Host.md", () => target);

        expect(result).toEqual({ error: "Bad file extension found, expected markdown" });
    });
});
