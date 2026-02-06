# Movement System Documentation

This document describes reusable patterns for player movement in explorable scenes. The canonical implementation is `ForestRiddleScene.ts`.

## Overview

The movement system creates a 2.5D walking effect where the player's X position is controlled freely (via click-to-move), but Y position is constrained to a terrain path. This allows the player to "walk over" bridges, hills, or other elevated terrain.

---

## Core Pattern: Path-Based Y Movement

Instead of tweening both X and Y independently, the player's Y position is calculated from their X position using a path function.

### Path Profile Function

Define a function that returns the Y coordinate for any X position:

```typescript
private getPathY(x: number): number {
    const bridgeStartX = 280;      // Start ascending
    const bridgeTopStartX = 295;   // Reach bridge top
    const bridgeTopEndX = 980;     // End of bridge top
    const bridgeEndX = 1000;       // Finish descending

    if (x < bridgeStartX) {
        // Flat ground before bridge
        return 590;
    } else if (x < bridgeTopStartX) {
        // Ascending to bridge
        const progress = (x - bridgeStartX) / (bridgeTopStartX - bridgeStartX);
        return 590 - (progress * 70);  // Rise from 590 to 520
    } else if (x <= bridgeTopEndX) {
        // On bridge - flat
        return 520;
    } else if (x < bridgeEndX) {
        // Descending from bridge
        const progress = (x - bridgeTopEndX) / (bridgeEndX - bridgeTopEndX);
        return 520 + (progress * 60);  // Fall from 520 to 580
    } else {
        // Flat ground after bridge
        return 580;
    }
}
```

### Path Segments

A path profile consists of segments:

| Segment Type | Description | Y Calculation |
|--------------|-------------|---------------|
| **Flat** | Constant Y | `return fixedY;` |
| **Ascending** | Y decreases as X increases | `return baseY - (progress * riseAmount);` |
| **Descending** | Y increases as X increases | `return baseY + (progress * fallAmount);` |

The `progress` variable is a 0-1 ratio of how far through the segment the player is:
```typescript
const progress = (x - segmentStart) / (segmentEnd - segmentStart);
```

---

## walkTo() Implementation

The key insight: **tween only X**, and update Y via the `onUpdate` callback.

### Complete Implementation

```typescript
private walkTo(targetX: number, targetY: number, onComplete?: () => void): void {
    this.isWalking = true;

    const player = this.gameState.getPlayer();
    const spriteConfig = getPlayerSpriteConfig(player.characterType);

    // Calculate horizontal distance for duration
    const dx = targetX - this.player.x;
    const distance = Math.abs(dx);
    const duration = (distance / 350) * 1000;  // 350 pixels per second

    // Flip sprite based on direction
    this.player.setFlipX(dx < 0);

    // Play walk animation
    this.player.play(spriteConfig.walkAnim);

    // IMPORTANT: Only tween X, update Y in onUpdate
    this.tweens.add({
        targets: this.player,
        x: targetX,
        duration,
        ease: 'Linear',
        onUpdate: () => {
            // Continuously update Y based on current X
            this.player.y = this.getPathY(this.player.x);
        },
        onComplete: () => {
            this.player.play(spriteConfig.idleAnim);
            this.isWalking = false;

            if (onComplete) {
                onComplete();
            }
        }
    });
}
```

### Why This Works

1. **X tween**: Phaser smoothly interpolates X position over time
2. **onUpdate callback**: Called every frame during the tween
3. **Y recalculation**: Each frame, Y is set based on current X via `getPathY()`
4. **Result**: Player smoothly follows the terrain curve

### Common Mistakes

| Mistake | Problem | Solution |
|---------|---------|----------|
| Tweening both X and Y | Linear interpolation ignores path curves | Only tween X, use onUpdate for Y |
| Using targetY directly | Y target is only correct for final position | Calculate Y from X each frame |
| Not using onUpdate | Y never changes during movement | Add onUpdate callback |

---

## Click-to-Move with Interactive Object Filtering

When a scene has draggable objects or clickable UI, you need to prevent movement when clicking on them.

### Implementation

```typescript
private setupClickToMove(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        // Guard: Already walking
        if (this.isWalking) return;

        // CRITICAL: Check if clicking on interactive object
        const hitObjects = this.input.hitTestPointer(pointer);
        if (hitObjects.length > 0) {
            // Clicked on something interactive - don't move
            return;
        }

        // Check if click is in walkable area (not UI)
        if (pointer.y > 300) {
            const targetX = pointer.x;
            const targetY = this.getPathY(targetX);
            this.walkTo(targetX, targetY, () => {
                this.checkExitZones();
            });
        }
    });
}
```

### Key Points

- `this.input.hitTestPointer(pointer)` returns all interactive objects under the pointer
- If array is non-empty, the click was on an interactive object → skip movement
- This allows draggable rocks, buttons, etc. to work without triggering player movement

---

## One-Way Progression (No Backtracking)

Some scenes require preventing the player from returning after passing a threshold.

### State Tracking

```typescript
private hasCrossedBridge = false;  // Once crossed, no going back
```

### Setting the Flag

Set the flag when player passes the threshold:

```typescript
this.walkTo(targetX, targetY, () => {
    // Mark as crossed if past the bridge
    if (this.bridgeUnlocked && targetX > 900) {
        this.hasCrossedBridge = true;
    }
    this.checkExitZones();
});
```

### Blocking Backward Movement

In click-to-move, prevent clicks to the left after crossing:

```typescript
// Prevent backtracking after crossing the bridge
if (this.hasCrossedBridge && targetX < this.bridgeBlockX + 100) {
    return;  // Silently ignore - don't move backward
}
```

### Blocking Left Exit

Disable the left exit zone once crossed:

```typescript
private checkExitZones(): void {
    // Left exit - only allowed if bridge NOT yet crossed
    if (this.player.x < 80 && !this.hasCrossedBridge) {
        this.transitionToRoom('forest_edge', 'left');
        return;
    }

    // Right exit continues normally...
}
```

### Preventing Re-entry from Right

In `init()`, redirect if player tries to enter from the right:

```typescript
init(data: SceneData) {
    // BLOCK: Cannot enter this scene from the right
    if (this.fromDirection === 'right') {
        this.scene.start('ForestRoomScene', {
            roomId: 'deep_forest_1',
            fromDirection: 'left'
        });
    }
}
```

---

## Player Spawn Based on Entry Direction

Spawn position should reflect where the player came from:

```typescript
private createPlayer(): void {
    let spawnX = 80;  // Default: left side

    if (this.fromDirection === 'right') {
        spawnX = 1100;  // Coming from right
        this.hasCrossedBridge = true;  // Already past the bridge
    }

    // Y follows the path at spawn X
    const spawnY = this.getPathY(spawnX);

    this.player = this.add.sprite(spawnX, spawnY, texture)
        .setFlipX(this.fromDirection === 'right');  // Face correct direction
}
```

---

## Complete Example: Bridge Scene

```typescript
export class BridgeScene extends Phaser.Scene {
    private player!: Phaser.GameObjects.Sprite;
    private isWalking = false;
    private hasCrossedBridge = false;
    private bridgeUnlocked = false;

    // Path profile: flat → ascend → flat bridge → descend → flat
    private getPathY(x: number): number {
        if (x < 280) return 590;
        else if (x < 295) {
            const p = (x - 280) / 15;
            return 590 - (p * 70);
        } else if (x <= 980) return 520;
        else if (x < 1000) {
            const p = (x - 980) / 20;
            return 520 + (p * 60);
        } else return 580;
    }

    private walkTo(targetX: number, targetY: number, onComplete?: () => void): void {
        this.isWalking = true;
        const dx = targetX - this.player.x;
        const duration = (Math.abs(dx) / 350) * 1000;

        this.player.setFlipX(dx < 0);
        this.player.play('walk');

        this.tweens.add({
            targets: this.player,
            x: targetX,
            duration,
            ease: 'Linear',
            onUpdate: () => {
                this.player.y = this.getPathY(this.player.x);
            },
            onComplete: () => {
                this.player.play('idle');
                this.isWalking = false;
                onComplete?.();
            }
        });
    }

    private setupClickToMove(): void {
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            if (this.isWalking) return;

            const hitObjects = this.input.hitTestPointer(pointer);
            if (hitObjects.length > 0) return;

            if (pointer.y > 300) {
                let targetX = pointer.x;

                // One-way progression check
                if (this.hasCrossedBridge && targetX < 380) return;

                // Bridge unlock check
                if (!this.bridgeUnlocked && targetX > 280) {
                    targetX = 230;
                }

                this.walkTo(targetX, this.getPathY(targetX), () => {
                    if (this.bridgeUnlocked && targetX > 900) {
                        this.hasCrossedBridge = true;
                    }
                    this.checkExitZones();
                });
            }
        });
    }
}
```

---

## Summary

| Concept | Key Implementation |
|---------|-------------------|
| **Path profile** | `getPathY(x)` function with segment-based calculations |
| **Walking** | Tween X only, use `onUpdate` to set Y from path |
| **Click filtering** | `hitTestPointer()` to skip clicks on interactive objects |
| **One-way** | `hasCrossedBridge` flag + movement/exit blocking |
| **Spawn position** | Set X from `fromDirection`, Y from `getPathY()` |

---

## Reference Implementation

See `src/scenes/ForestRiddleScene.ts` for the canonical implementation of all these patterns.
