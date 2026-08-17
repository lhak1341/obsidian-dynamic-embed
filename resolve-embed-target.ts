import type { TFile } from "obsidian";

const pattern = /\[\[([^[\]]+?)\]\]/u;

// Resolution/validation seam: no Obsidian value dependency beyond the one
// lookup function it needs, so it's unit-testable without mocking Obsidian.
export function resolveEmbedTarget(
    source: string,
    sourcePath: string,
    getFirstLinkpathDest: (linkpath: string, sourcePath: string) => TFile | null,
): { file: TFile } | { error: string } {
    const fileNameMatch = pattern.exec(source);

    if (!fileNameMatch) {
        return { error: "Bad file link" };
    }

    // #2 — strip alias (|) and subpath (#): both are valid Obsidian wikilink syntax
    const fileName = fileNameMatch[1].split("#")[0].split("|")[0].trim();
    const matchingFile = getFirstLinkpathDest(fileName, sourcePath);

    if (!matchingFile) {
        return { error: "File link not found" };
    }

    if (matchingFile.extension !== "md") {
        return { error: "Bad file extension found, expected markdown" };
    }

    return { file: matchingFile };
}
