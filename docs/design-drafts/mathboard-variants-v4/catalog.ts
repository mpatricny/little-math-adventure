import type { MathProblem, ComparisonStageId } from '../../../src/types';
import { createComparisonDemoProblems } from '../../../src/systems/ComparisonLearningSystem';

const arithmetic = (extra: Partial<MathProblem>): MathProblem => ({ id: 'workshop', operand1: 2, operand2: 3,
    operator: '+', answer: 5, choices: [4, 5, 6], showVisualHint: false, hintType: 'none',
    source: 'player', damageMultiplier: 4, ...extra });
export const samples: Array<{id: string; label: string; group: string; problem: MathProblem}> = [
    {id:'addition',label:'Sčítání',group:'Počítání',problem:arithmetic({})},
    {id:'subtraction',label:'Odčítání',group:'Počítání',problem:arithmetic({operand1:7,operand2:3,operator:'-',answer:4,choices:[3,4,5]})},
    {id:'multiplication',label:'Násobení',group:'Počítání',problem:arithmetic({operand1:3,operand2:4,operator:'*',answer:12,choices:[10,12,14]})},
    {id:'three',label:'Tři čísla',group:'Počítání',problem:arithmetic({operand1:8,operand2:4,operand3:3,operator2:'-',answer:9,choices:[8,9,10]})},
    {id:'missing',label:'Chybějící číslo',group:'Doplňování',problem:arithmetic({operand1:3,operand2:7,problemType:'missing_operand',answer:4,choices:[3,4,5]})},
    {id:'missing-three',label:'Doplnění ve výrazu',group:'Doplňování',problem:arithmetic({operand1:8,operand2:7,operand3:3,operator:'-',operator2:'+',problemType:'missing_operand',answer:4,choices:[3,4,5]})},
    {id:'expression-number',label:'Výraz a číslo',group:'Porovnávání',problem:arithmetic({operand3:6,problemType:'comparison',answer:0,choices:[0,1,2]})},
    {id:'expression-expression',label:'Dva výrazy',group:'Porovnávání',problem:arithmetic({operand1:12,operand2:3,operand3:8,operand4:7,operator3:'+',problemType:'comparison_eq_vs_eq',answer:1,choices:[0,1,2]})},
    {id:'long-expression',label:'Dlouhé porovnání',group:'Porovnávání',problem:arithmetic({operand1:12,operand2:5,operand3:3,operator2:'-',operand4:11,problemType:'comparison',answer:2,choices:[0,1,2]})},
    ...([
        ['size','Velikost','size_crocodile'], ['count','Počet','count_crocodile'],
        ['numbered','Obrázky s čísly','number_crocodile'], ['symbols','Samotná čísla','number_symbol'],
        ['guided','Výraz s pomocí','expression_guided'], ['independent','Samostatný výraz','expression_independent'],
    ] as const).map(([id,label,stage])=>({id,label,group:'Krokodýlí lekce',problem: {
        ...createComparisonDemoProblems(stage as ComparisonStageId)[id==='numbered'?2:0],
        id:'workshop-'+id,damageMultiplier:4,source:'player' as const,
    }})),
];
export const modes = [
    {id:'attack',label:'Útok',icon:'fist',title:'Tvůj útok'},
    {id:'sword',label:'Meč',icon:'sword',title:'Síla meče'},
    {id:'pet',label:'Mazlíček',icon:'paw',title:'Tvůj parťák'},
    {id:'defense',label:'Obrana',icon:'shield',title:'Braň se'},
    {id:'practice',label:'Procvičování',icon:'fist',title:'Trénujeme'},
    {id:'prep-sword',label:'Příprava meče',icon:'sword',title:'Nabij meč'},
    {id:'prep-shield',label:'Příprava štítu',icon:'shield',title:'Nabij štít'},
    {id:'exam',label:'Zkouška',icon:'star',title:'Zkouška'},
    {id:'catacomb',label:'Katakomby',icon:'paw',title:'Zkouška lišky'},
    {id:'coop',label:'Dva hráči',icon:'fist',title:'Tvůj tah'},
] as const;
export type Mode = typeof modes[number]['id'];
