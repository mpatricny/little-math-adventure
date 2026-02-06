# Slide-Out/Slide-In Animation Pattern

This document describes how to implement carousel-style pagination animations in Phaser where content slides out one side and new content slides in from the opposite side.

## The Problem

When animating pagination (e.g., crystal inventory pages), you want:
1. **Old content** slides OUT in one direction (e.g., LEFT)
2. **New content** slides IN from the opposite side (e.g., from RIGHT, moving LEFT)

This creates a continuous "carousel" or "filmstrip" effect.

## Key Concepts

### Phaser Tweens
```typescript
this.tweens.add({
    targets: object,      // The object to animate
    x: targetX,           // Tween animates FROM current value TO this value
    alpha: 1,             // Opacity (0 = invisible, 1 = visible)
    duration: 150,        // Time in milliseconds
    ease: 'Power2'        // Easing function
});
```

**Important**: Tweens animate FROM the object's **current property value** TO the **target value**.

### Delayed Callbacks
```typescript
this.time.delayedCall(delayMs, () => {
    // Code executes after delay
});
```

## Implementation Pattern

### Step 1: Store Original Positions
When creating elements, store their "home" position:
```typescript
holder.setData('originalX', x);
```

### Step 2: Slide-Out Animation
```typescript
const slideDistance = 80;
const duration = 150;

// Calculate target based on direction
// direction='left' means content moves LEFT (next page)
const targetX = direction === 'left'
    ? holder.x - slideDistance   // Move LEFT
    : holder.x + slideDistance;  // Move RIGHT

this.tweens.add({
    targets: holder,
    x: targetX,
    alpha: 0,
    duration: duration,
    ease: 'Power2'
});
```

### Step 3: Slide-In Animation (After Delay)
```typescript
this.time.delayedCall(duration, () => {
    // Update data first
    this.updateContent();

    holders.forEach(holder => {
        // CRITICAL: Kill any running tweens first!
        this.tweens.killTweensOf(holder);

        const originalX = holder.getData('originalX') as number;

        // Start position is OPPOSITE side from exit direction
        // If old exited LEFT, new enters from RIGHT (and vice versa)
        const startX = direction === 'left'
            ? originalX + slideDistance   // Start RIGHT, will move LEFT
            : originalX - slideDistance;  // Start LEFT, will move RIGHT

        // Set starting position
        holder.x = startX;
        holder.alpha = 0;

        // Animate to home position
        this.tweens.add({
            targets: holder,
            x: originalX,
            alpha: 1,
            duration: duration,
            ease: 'Power2'
        });
    });
});
```

## Critical Points

### 1. Kill Previous Tweens
Always call `this.tweens.killTweensOf(holder)` before repositioning and starting the slide-in tween. Otherwise, the slide-out tween may still be running and will fight with your position changes.

### 2. Direction Logic
The `direction` parameter indicates which way content MOVES, not which button was clicked:
- `direction='left'` → content moves LEFT (typically "next page")
- `direction='right'` → content moves RIGHT (typically "previous page")

### 3. Opposite Side Entry
For carousel effect, new content must enter from the **opposite** side:
```typescript
// If direction='left' (old exits left), new starts on RIGHT (+slideDistance)
// If direction='right' (old exits right), new starts on LEFT (-slideDistance)
const startX = direction === 'left'
    ? originalX + slideDistance
    : originalX - slideDistance;
```

### 4. Same Movement Direction
Both old and new content should move in the SAME direction:
- Old: moves from `originalX` → `originalX - slideDistance` (LEFT)
- New: moves from `originalX + slideDistance` → `originalX` (also LEFT)

## Visual Masking

To make content appear to slide behind edges (rather than floating over everything), use a Phaser mask:

### Step 1: Create a Container for Animated Elements
```typescript
// Create container at origin (children use absolute positions)
this.holdersContainer = this.add.container(0, 0);
this.holdersContainer.setDepth(10);
```

### Step 2: Create the Mask Graphics
```typescript
// Use this.make.graphics() - creates graphics WITHOUT adding to scene
const maskGraphics = this.make.graphics();
maskGraphics.fillStyle(0xffffff);
maskGraphics.fillRect(maskX, maskY, maskW, maskH);
```

### Step 3: Apply Mask to Container
```typescript
const mask = maskGraphics.createGeometryMask();
this.holdersContainer.setMask(mask);
```

### Step 4: Add Animated Elements to Container
```typescript
// When creating elements, add them to the masked container
const holder = this.createHolder(x, y);
this.holdersContainer.add(holder);  // NOT this.add.xxx()
```

### Complete Example
```typescript
private createGrid(): void {
    // Frame boundaries (from scene editor)
    const frameX = 215, frameY = 583;
    const frameW = 450, frameH = 288;

    // Create masked container
    this.holdersContainer = this.add.container(0, 0);
    this.holdersContainer.setDepth(10);

    // Define mask area (slightly inset from frame edges)
    const maskPadding = 10;
    const maskX = frameX - frameW / 2 + maskPadding;
    const maskY = frameY - frameH / 2 + maskPadding;
    const maskW = frameW - maskPadding * 2;
    const maskH = frameH - maskPadding * 2;

    // Create and apply mask
    const maskGraphics = this.make.graphics();
    maskGraphics.fillStyle(0xffffff);
    maskGraphics.fillRect(maskX, maskY, maskW, maskH);
    this.holdersContainer.setMask(maskGraphics.createGeometryMask());

    // Create holders and add to container
    for (let i = 0; i < count; i++) {
        const holder = this.createHolder(x, y);
        this.holdersContainer.add(holder);
    }
}
```

Content outside the mask rectangle will be hidden, creating a clean "window" effect where elements appear to slide behind the frame edges.

## Complete Example

See `PythiaWorkshopScene.ts` method `animateCrystalPageChange()` for a working implementation.
