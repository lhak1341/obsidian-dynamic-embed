// Race-guard: only the most recently started operation is allowed to finish.
export function createLatestWinsGate() {
    let token = 0;
    return {
        bump: () => ++token,
        isCurrent: (t: number) => t === token,
    };
}
