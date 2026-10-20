import type { ItemDefinition } from '../types';

export type ShopCity = 'mathoria' | 'silverpond';

/** The three editor-owned shelf hosts display the local equipment progression. */
export function getShopEquipment(
    items: readonly ItemDefinition[],
    city: ShopCity,
    type: 'weapon' | 'shield',
): ItemDefinition[] {
    return items.filter(item => item.type === type && (item.shopCity ?? 'mathoria') === city)
        .sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0))
        .slice(0, 3);
}
