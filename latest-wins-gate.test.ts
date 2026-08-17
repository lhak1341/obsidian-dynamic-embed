import { describe, expect, it } from "vitest";
import { createLatestWinsGate } from "./latest-wins-gate";

describe("createLatestWinsGate", () => {
    it("increments on each bump", () => {
        const gate = createLatestWinsGate();

        expect(gate.bump()).toBe(1);
        expect(gate.bump()).toBe(2);
    });

    it("treats the latest bumped token as current", () => {
        const gate = createLatestWinsGate();

        const token = gate.bump();

        expect(gate.isCurrent(token)).toBe(true);
    });

    it("treats a superseded token as stale once a newer one is bumped", () => {
        const gate = createLatestWinsGate();

        const staleToken = gate.bump();
        gate.bump();

        expect(gate.isCurrent(staleToken)).toBe(false);
    });
});
