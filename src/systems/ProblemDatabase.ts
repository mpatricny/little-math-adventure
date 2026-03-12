import { BandId, SubAtomId, SubAtomNumber, ProblemForm, ProblemDefinition, ALL_BANDS, ALL_SUB_ATOM_NUMBERS, ALL_PROBLEM_FORMS } from '../types';

/**
 * Band ranges (non-overlapping):
 * A: operands & results 0-5
 * B: at least one operand or result in 6-8 (exclusively, not in A range)
 * C: at least one operand or result in 9-10
 * D: results 11-20, no crossing 10 (both operands on same side of 10)
 * E: results 0-20, crossing 10 (addition crosses up through 10, subtraction crosses down)
 */
interface BandRange {
    minResult: number;
    maxResult: number;
}

const BAND_RANGES: Record<BandId, BandRange> = {
    A: { minResult: 0, maxResult: 5 },
    B: { minResult: 0, maxResult: 8 },
    C: { minResult: 0, maxResult: 10 },
    D: { minResult: 0, maxResult: 20 },
    E: { minResult: 0, maxResult: 20 },
};

/**
 * Runtime-computed catalog of ALL possible problems.
 * The dataset is small (<1000 total problems) so we compute it at startup.
 */
export class ProblemDatabase {
    private static instance: ProblemDatabase;
    private problems: Map<string, ProblemDefinition> = new Map();
    private bySubAtom: Map<SubAtomId, ProblemDefinition[]> = new Map();
    private bySubAtomAndForm: Map<string, ProblemDefinition[]> = new Map();

    private constructor() {
        this.generateAllProblems();
    }

    static getInstance(): ProblemDatabase {
        if (!ProblemDatabase.instance) {
            ProblemDatabase.instance = new ProblemDatabase();
        }
        return ProblemDatabase.instance;
    }

    /** Get all problems for a sub-atom */
    getAllProblems(subAtomId: SubAtomId): ProblemDefinition[] {
        return this.bySubAtom.get(subAtomId) || [];
    }

    /** Get problems for a sub-atom + form combination */
    getProblemsForForm(subAtomId: SubAtomId, form: ProblemForm): ProblemDefinition[] {
        return this.bySubAtomAndForm.get(`${subAtomId}:${form}`) || [];
    }

    /** Get a single problem by key */
    getProblemByKey(key: string): ProblemDefinition | undefined {
        return this.problems.get(key);
    }

    /** Generate 3 answer choices (including correct) with plausible distractors */
    generateChoices(problem: ProblemDefinition): number[] {
        if (problem.form === 'compare_equation_vs_number' || problem.form === 'compare_equation_vs_equation') {
            return [0, 1, 2]; // <, =, >
        }

        const correct = problem.answer;
        const choices = new Set<number>([correct]);
        const range = BAND_RANGES[problem.bandId];
        const maxVal = range.maxResult;

        let attempts = 0;
        while (choices.size < 3 && attempts < 50) {
            attempts++;
            let wrong: number;

            // Generate plausible distractors
            const strategy = Math.floor(Math.random() * 3);
            if (strategy === 0) {
                // Off by 1 or 2
                wrong = correct + (Math.random() > 0.5 ? 1 : -1) * (Math.random() > 0.5 ? 1 : 2);
            } else if (strategy === 1) {
                // Swap operands mistake (for subtraction: a-b vs b-a)
                wrong = Math.abs(problem.operand1 - problem.operand2);
                if (wrong === correct) wrong = correct + 1;
            } else {
                // Random in band range
                wrong = Math.floor(Math.random() * (maxVal + 1));
            }

            if (wrong >= 0 && wrong <= maxVal + 5 && wrong !== correct && !choices.has(wrong)) {
                choices.add(wrong);
            }
        }

        // Fallback if we couldn't generate enough distractors
        while (choices.size < 3) {
            const wrong = correct + choices.size;
            choices.add(wrong);
        }

        return this.shuffle([...choices]);
    }

    /** Total number of problems in the database */
    get totalProblems(): number {
        return this.problems.size;
    }

    // ========================================
    // Problem generation
    // ========================================

    private generateAllProblems(): void {
        for (const band of ALL_BANDS) {
            for (const num of ALL_SUB_ATOM_NUMBERS) {
                const subAtomId = `${band}${num}` as SubAtomId;
                this.generateSubAtomProblems(band, num, subAtomId);
            }
        }

        console.log(`[ProblemDatabase] Generated ${this.problems.size} problems`);
    }

    private generateSubAtomProblems(band: BandId, subAtomNum: SubAtomNumber, subAtomId: SubAtomId): void {
        const operators = this.getOperatorsForSubAtom(subAtomNum);

        for (const form of ALL_PROBLEM_FORMS) {
            const problems = this.generateProblemsForForm(band, subAtomId, subAtomNum, form, operators);
            for (const p of problems) {
                this.problems.set(p.key, p);
                if (!this.bySubAtom.has(subAtomId)) this.bySubAtom.set(subAtomId, []);
                this.bySubAtom.get(subAtomId)!.push(p);
                const formKey = `${subAtomId}:${form}`;
                if (!this.bySubAtomAndForm.has(formKey)) this.bySubAtomAndForm.set(formKey, []);
                this.bySubAtomAndForm.get(formKey)!.push(p);
            }
        }
    }

    /** Sub-atom 1=addition, 2=subtraction, 3=three-operand (mixed), 4=mixed */
    private getOperatorsForSubAtom(num: SubAtomNumber): ('+' | '-')[] {
        switch (num) {
            case 1: return ['+'];
            case 2: return ['-'];
            case 3: return ['+', '-'];  // three-operand uses both
            case 4: return ['+', '-'];  // mixed
        }
    }

    private generateProblemsForForm(
        band: BandId,
        subAtomId: SubAtomId,
        subAtomNum: SubAtomNumber,
        form: ProblemForm,
        operators: ('+' | '-')[]
    ): ProblemDefinition[] {
        const results: ProblemDefinition[] = [];

        if (subAtomNum === 3) {
            // Three-operand sub-atom
            return this.generateThreeOperandProblems(band, subAtomId, form);
        }

        for (const op of operators) {
            const pairs = this.getValidPairs(band, op);

            for (const [a, b, answer] of pairs) {
                switch (form) {
                    case 'result_unknown': {
                        const key = `${subAtomId}:${a}${op}${b}:result_unknown`;
                        results.push({
                            key, bandId: band, subAtomId, form,
                            operand1: a, operand2: b, operator: op, answer,
                        });
                        break;
                    }
                    case 'missing_part': {
                        // a op ? = answer  (missing second operand)
                        const key = `${subAtomId}:${a}${op}?=${answer}:missing_part`;
                        results.push({
                            key, bandId: band, subAtomId, form,
                            operand1: a, operand2: answer, // operand2 stores result for display
                            operator: op, answer: b, // answer is the missing part
                        });
                        break;
                    }
                    case 'compare_equation_vs_number': {
                        // Generate a few comparison targets per equation
                        const leftSide = answer;
                        const targets = this.getComparisonTargets(band, leftSide);
                        for (const rightSide of targets) {
                            const cmpAnswer = leftSide < rightSide ? 0 : leftSide === rightSide ? 1 : 2;
                            const key = `${subAtomId}:${a}${op}${b}vs${rightSide}:compare_eq_num`;
                            results.push({
                                key, bandId: band, subAtomId, form,
                                operand1: a, operand2: b, operand3: rightSide,
                                operator: op, answer: cmpAnswer,
                            });
                        }
                        break;
                    }
                    case 'compare_equation_vs_equation': {
                        // Pair with another equation from same band
                        const rightPairs = this.getValidPairs(band, op === '+' ? '-' : '+');
                        // Take a subset to avoid explosion
                        const subset = rightPairs.slice(0, Math.min(3, rightPairs.length));
                        for (const [c, d, rightAnswer] of subset) {
                            const rightOp: '+' | '-' = op === '+' ? '-' : '+';
                            const cmpAnswer = answer < rightAnswer ? 0 : answer === rightAnswer ? 1 : 2;
                            const key = `${subAtomId}:${a}${op}${b}vs${c}${rightOp}${d}:compare_eq_eq`;
                            results.push({
                                key, bandId: band, subAtomId, form,
                                operand1: a, operand2: b,
                                operand3: c, operand4: d,
                                operator: op, operator3: rightOp,
                                answer: cmpAnswer,
                            });
                        }
                        break;
                    }
                }
            }
        }

        return results;
    }

    private generateThreeOperandProblems(band: BandId, subAtomId: SubAtomId, form: ProblemForm): ProblemDefinition[] {
        const results: ProblemDefinition[] = [];
        const range = BAND_RANGES[band];
        const maxVal = range.maxResult;

        // Generate valid three-operand expressions: a op1 b op2 c
        const opCombos: ['+' | '-', '+' | '-'][] = [['+', '-'], ['-', '+'], ['+', '+'], ['-', '-']];

        for (const [op1, op2] of opCombos) {
            for (let a = 0; a <= maxVal; a++) {
                for (let b = 0; b <= maxVal; b++) {
                    for (let c = 0; c <= Math.min(maxVal, 5); c++) {
                        // All three operands must be distinct
                        if (a === b || b === c || a === c) continue;

                        const intermediate = op1 === '+' ? a + b : a - b;
                        const answer = op2 === '+' ? intermediate + c : intermediate - c;

                        if (answer < 0 || answer > maxVal) continue;
                        if (intermediate < 0 || intermediate > maxVal) continue;
                        if (!this.isInBandExclusive(band, a, b, answer, op1)) continue;
                        // Also check third operand context
                        if (band !== 'A' && a <= 5 && b <= 5 && c <= 5 && answer <= 5) continue;

                        switch (form) {
                            case 'result_unknown': {
                                const key = `${subAtomId}:${a}${op1}${b}${op2}${c}:result_unknown`;
                                if (!results.some(r => r.key === key)) {
                                    results.push({
                                        key, bandId: band, subAtomId, form,
                                        operand1: a, operand2: b, operand3: c,
                                        operator: op1, operator2: op2, answer,
                                    });
                                }
                                break;
                            }
                            case 'missing_part': {
                                // a op1 ? op2 c = answer → missing is b
                                const key = `${subAtomId}:${a}${op1}?${op2}${c}=${answer}:missing_part`;
                                if (!results.some(r => r.key === key)) {
                                    results.push({
                                        key, bandId: band, subAtomId, form,
                                        operand1: a, operand2: answer, operand3: c,
                                        operator: op1, operator2: op2, answer: b,
                                    });
                                }
                                break;
                            }
                            case 'compare_equation_vs_number': {
                                const targets = this.getComparisonTargets(band, answer);
                                for (const rightSide of targets) {
                                    const cmpAnswer = answer < rightSide ? 0 : answer === rightSide ? 1 : 2;
                                    const key = `${subAtomId}:${a}${op1}${b}${op2}${c}vs${rightSide}:compare_eq_num`;
                                    if (!results.some(r => r.key === key)) {
                                        results.push({
                                            key, bandId: band, subAtomId, form,
                                            operand1: a, operand2: b, operand3: c,
                                            operand4: rightSide,
                                            operator: op1, operator2: op2, answer: cmpAnswer,
                                        });
                                    }
                                }
                                break;
                            }
                            case 'compare_equation_vs_equation': {
                                // Compare two three-operand expressions (limit to avoid explosion)
                                if (results.filter(r => r.form === 'compare_equation_vs_equation').length < 30) {
                                    const rightAnswer = answer + (Math.floor(a * 7 + b * 3 + c) % 3) - 1; // deterministic variation
                                    if (rightAnswer >= 0 && rightAnswer <= maxVal) {
                                        const cmpAnswer = answer < rightAnswer ? 0 : answer === rightAnswer ? 1 : 2;
                                        const key = `${subAtomId}:${a}${op1}${b}${op2}${c}vs${rightAnswer}:compare_eq_eq`;
                                        if (!results.some(r => r.key === key)) {
                                            results.push({
                                                key, bandId: band, subAtomId, form,
                                                operand1: a, operand2: b, operand3: rightAnswer,
                                                operator: op1, operator2: op2, answer: cmpAnswer,
                                            });
                                        }
                                    }
                                }
                                break;
                            }
                        }

                        // Limit per band to prevent massive databases
                        if (results.length > 200) return results;
                    }
                }
            }
        }

        return results;
    }

    /**
     * Get valid (operand1, operand2, answer) triples for a band + operator.
     * Band-exclusive: problems must involve numbers in that band's exclusive range.
     */
    private getValidPairs(band: BandId, operator: '+' | '-'): [number, number, number][] {
        const pairs: [number, number, number][] = [];
        const range = BAND_RANGES[band];
        const maxVal = range.maxResult;

        if (operator === '+') {
            for (let a = 0; a <= maxVal; a++) {
                for (let b = 0; b <= maxVal - a; b++) {
                    const answer = a + b;
                    if (answer > maxVal) continue;
                    if (!this.isInBandExclusive(band, a, b, answer, operator)) continue;
                    pairs.push([a, b, answer]);
                }
            }
        } else {
            for (let a = 0; a <= maxVal; a++) {
                for (let b = 0; b <= a; b++) {
                    const answer = a - b;
                    if (!this.isInBandExclusive(band, a, b, answer, operator)) continue;
                    pairs.push([a, b, answer]);
                }
            }
        }

        return pairs;
    }

    /**
     * Check if a problem belongs exclusively to a band (not a lower band).
     * Band A: all values 0-5
     * Band B: at least one value in 6-8
     * Band C: at least one value in 9-10
     * Band D: result 11-20, no crossing 10
     * Band E: crossing 10 (addition goes from <10 to >10, subtraction from >10 to <10)
     */
    private isInBandExclusive(band: BandId, a: number, b: number, answer: number, operator: '+' | '-'): boolean {
        const vals = [a, b, answer];
        const maxVal = Math.max(...vals);

        switch (band) {
            case 'A':
                return maxVal <= 5;

            case 'B':
                // At least one value in 6-8, none above 8
                return maxVal <= 8 && vals.some(v => v >= 6);

            case 'C':
                // At least one value in 9-10, none above 10
                return maxVal <= 10 && vals.some(v => v >= 9);

            case 'D':
                // Results 11-20, no crossing 10
                // Both operands on same side of 10
                if (answer > 20 || answer < 0) return false;
                if (operator === '+') {
                    // Both operands >= 10 or result in 11-20 without crossing
                    // "No crossing 10" means: a >= 10 and b >= 0 and result 11-20
                    // OR a and b are both on the same side
                    return answer >= 11 && answer <= 20 && a >= 10 && b <= 10;
                } else {
                    // a >= 11, result >= 10 (no crossing down through 10)
                    return a >= 11 && a <= 20 && answer >= 10;
                }

            case 'E':
                // Crossing 10
                if (answer > 20 || answer < 0) return false;
                if (operator === '+') {
                    // a < 10 and answer > 10 (crosses up through 10)
                    return a < 10 && b > 0 && answer > 10 && answer <= 20;
                } else {
                    // a > 10 and answer < 10 (crosses down through 10)
                    return a > 10 && a <= 20 && answer < 10 && answer >= 0;
                }
        }
    }

    /** Get comparison target numbers for a band */
    private getComparisonTargets(band: BandId, leftSide: number): number[] {
        const range = BAND_RANGES[band];
        const targets: number[] = [];
        // Equal
        targets.push(leftSide);
        // Less than (left < right, so right is bigger)
        if (leftSide + 1 <= range.maxResult) targets.push(leftSide + 1);
        if (leftSide + 2 <= range.maxResult) targets.push(leftSide + 2);
        // Greater than (left > right, so right is smaller)
        if (leftSide - 1 >= 0) targets.push(leftSide - 1);
        if (leftSide - 2 >= 0) targets.push(leftSide - 2);
        return targets;
    }

    private shuffle<T>(arr: T[]): T[] {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }
}
