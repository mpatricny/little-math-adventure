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

export interface MathBoardContext {
    mode?: Mode;
    practice?: boolean;
    portraits?: string[];
    activePlayer?: number;
    progress?: { index:number; total:number; results:boolean[] };
}
