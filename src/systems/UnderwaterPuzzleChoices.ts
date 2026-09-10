/** Seeded Fisher–Yates: reproducible puzzles without a visible rotating answer pattern. */
export function shufflePuzzleChoices<T>(values: T[], seed: number): T[] {
    const result = [...values];
    let state = (seed + 0x6d2b79f5) | 0;
    for (let i = result.length - 1; i > 0; i--) {
        state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
        const j = (state >>> 0) % (i + 1);
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

export function underwaterLockWheels(word: string, seed: number) {
    const letters = Array.from(word.toUpperCase());
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const offsets = shufflePuzzleChoices([1, 2, 3, 4, 2], seed);
    const options = letters.map((letter, i) => shufflePuzzleChoices([letter,
        ...shufflePuzzleChoices(alphabet.filter(l => l !== letter), seed + i * 37).slice(0, 4)], seed + i * 71));
    const indexes = options.map((choices, i) => (choices.indexOf(letters[i]) + offsets[i]) % choices.length);
    return { options, indexes };
}
