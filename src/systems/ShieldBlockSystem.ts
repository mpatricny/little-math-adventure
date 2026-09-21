export function calculateShieldAnswerBlock(
    blockPower: number,
    incomingDamage: number,
    correct: boolean,
    quick: boolean,
    assisted: boolean,
): number {
    if (!correct || incomingDamage <= 0) return 0;
    const power = Math.max(1, Math.round(blockPower));
    const rawBlock = quick && !assisted ? power * 2 : power;
    return Math.min(incomingDamage, rawBlock);
}
