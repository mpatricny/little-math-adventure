import type { MasteryData, PracticeTargetId } from '../types';
import { catacombProgress } from './CatacombProgress';
import { CoopSessionManager } from './CoopSessionManager';
import { getFoxLessonProgress } from './FoxLessons';
import { GameStateManager } from './GameStateManager';
import { readLearningProfiles, type LearningProfileSnapshot } from './LearningProfileView';
import { MasterySystem } from './MasterySystem';
import { getOpenPracticeTargets } from './PracticeProgress';
import { PracticeSystem } from './PracticeSystem';

type Exam = ReturnType<MasterySystem['getAvailableExams']>[number];
type GuildOffer = { slotIndex: number; key: string; target?: PracticeTargetId };

export function guildBoardExam(exams: readonly Exam[], coop: boolean): Exam | undefined {
    if (coop) return;
    return exams.find(exam => exam.type !== 'fluency_challenge' && exam.type !== 'mastery_challenge');
}

/** The door opens one specific player's lesson or module. Only that offer is advertised outside. */
export function guildCatacombEntrance(profiles: readonly LearningProfileSnapshot[]): GuildOffer | undefined {
    for (const { slotIndex, stats, player } of profiles) {
        const lesson = getFoxLessonProgress(player, stats.masteryData);
        if (lesson.ready) return { slotIndex, key: `lesson:${lesson.next}` };
    }
    for (const { slotIndex, stats, player } of profiles) {
        for (const target of getOpenPracticeTargets(stats.masteryData)) {
            const stage = catacombProgress(stats.masteryData, player, target).find(progress => progress.ready);
            if (stage) return { slotIndex, target, key: `trial:${target}:${stage.stage}` };
        }
    }
    return undefined;
}

function currentGuildOffers(): GuildOffer[] {
    const offers: GuildOffer[] = [];
    const coop = CoopSessionManager.getInstance();
    const exam = guildBoardExam(MasterySystem.getInstance().getAvailableExams(), coop.isCoopActive());
    if (exam) offers.push({ slotIndex: GameStateManager.getInstance().getActiveSlotIndex() ?? -1, key: `exam:${exam.targetId}:${exam.type}` });
    const entrance = guildCatacombEntrance(readLearningProfiles());
    if (entrance) offers.push(entrance);
    return offers;
}

function offerOwner(slotIndex: number): MasteryData | null {
    const coop = CoopSessionManager.getInstance();
    if (!coop.isCoopActive()) return GameStateManager.getInstance().getMasteryData();
    if (slotIndex === coop.getPlayerASlotIndex()) return coop.getPlayerAMasteryData();
    if (slotIndex === coop.getPlayerBSlotIndex()) return coop.getPlayerBMasteryData();
    return null;
}

function unseenGuildOffers() {
    return currentGuildOffers().flatMap(({ slotIndex, key }) => {
        const owner = offerOwner(slotIndex);
        return owner && !owner.seenGuildOffers?.includes(key) ? [{ owner, key }] : [];
    });
}

export function hasGuildNews(): boolean {
    return !!PracticeSystem.getOverview()?.introductionAvailable || unseenGuildOffers().length > 0;
}

/** Visiting the hall acknowledges what it actually shows. The exams stay available inside. */
export function acknowledgeGuildOffers(): void {
    const offers = unseenGuildOffers();
    if (!offers.length) return;
    for (const { owner, key } of offers) (owner.seenGuildOffers ??= []).push(key);
    const coop = CoopSessionManager.getInstance();
    if (coop.isCoopActive()) coop.persistMasteryProgress();
    else GameStateManager.getInstance().save();
}
