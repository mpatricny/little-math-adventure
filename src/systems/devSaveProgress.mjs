const storyMilestones = ['hasCompletedIntro', 'hasDefeatedVerdantGuardian', 'hasClaimedForestCrystal',
    'hasInstalledForestCrystal', 'hasUnlockedSilverpond', 'hasFreedLakeFairy', 'hasWaterBreathingScale'];

/** Refuse clear progress loss; this never reconstructs, merges or ranks complete saves. */
export function devSaveRollbackReasons(current, candidate) {
    if (current.player.gameplayProfileId !== candidate.player.gameplayProfileId) return [];
    const reasons = []; let advances = false;
    for (const [key, before, after] of [
        ['level', current.player.level, candidate.player.level],
        ['answers', current.mathStats.totalAttempts, candidate.mathStats.totalAttempts],
        ['correctAnswers', current.mathStats.correctAnswers, candidate.mathStats.correctAnswers],
    ]) {
        if (after < before) reasons.push(key);
        if (after > before) advances = true;
    }
    for (const flag of storyMilestones) {
        if (current.player.storyProgress?.[flag] === true && candidate.player.storyProgress?.[flag] !== true) reasons.push(flag);
        if (candidate.player.storyProgress?.[flag] === true && current.player.storyProgress?.[flag] !== true) advances = true;
    }
    const beforeLevels = current.player.arena?.completedArenaLevels ?? [], afterLevels = candidate.player.arena?.completedArenaLevels ?? [];
    if (beforeLevels.some(level => !afterLevels.includes(level))) reasons.push('arenas');
    if (afterLevels.some(level => !beforeLevels.includes(level))) advances = true;
    // Encounter results are historical achievements even when the active arena/wave resets.
    const beforeWaves = current.player.arena?.encounterResults ?? {}, afterWaves = candidate.player.arena?.encounterResults ?? {};
    for (const [id, result] of Object.entries(beforeWaves)) {
        if (result.completed && !afterWaves[id]?.completed) reasons.push('completedWave');
        if (result.perfectWave && !afterWaves[id]?.perfectWave) reasons.push('perfectWave');
    }
    for (const [id, result] of Object.entries(afterWaves)) {
        if (result.completed && !beforeWaves[id]?.completed) advances = true;
        if (result.perfectWave && !beforeWaves[id]?.perfectWave) advances = true;
    }
    // A later auto-save timestamp alone cannot turn an already-rolled-back game into the newest progress.
    if (!advances && candidate.timestamp < current.timestamp) reasons.push('olderTimestamp');
    return [...new Set(reasons)];
}
