# UiElementBuilder Click Handling

This document describes the correct way to handle clicks on buttons/elements created with `UiElementBuilder`.

## The Problem

When you create a UI element (like a button) using `UiElementBuilder.buildFromTemplate()`, the returned object is a `Phaser.GameObjects.Container` that contains multiple child objects (layers, text areas, etc.).

**Common mistake:**
```typescript
const button = builder.buildFromTemplate(templateId, x, y);
button.setInteractive({ useHandCursor: true });
button.on('pointerdown', () => doSomething());  // ❌ DOESN'T WORK!
```

This fails because:
1. The Container's interactive hit area may not be properly sized
2. The child layers inside the container receive the click events, not the container itself
3. Click animations on child layers work, but the container's `pointerdown` event never fires

## Symptoms

- Button visually responds to clicks (animation plays, hover effects work)
- But the click handler function is never called
- Console logs in the handler never appear
- `setSize()` + `setInteractive()` on container still doesn't work

## The Solution

Use `sceneBuilder.bindClick()` instead of directly attaching event handlers:

```typescript
// ✅ CORRECT - use sceneBuilder.bindClick()
this.sceneBuilder.bindClick('Green_button_1', () => {
    this.doSomething();
});
```

### How bindClick Works

`SceneBuilder.bindClick()` properly sets up click handling by:
1. Finding all interactive layers within the container
2. Attaching the click handler to each layer
3. Handling the hit area calculation correctly

### Dynamic Click Handlers

For buttons that need different handlers based on state (like a bind button that's sometimes enabled/disabled):

```typescript
private updateBindButton(): void {
    const canBind = this.canPerformBinding();
    const bindButton = this.sceneBuilder.get('Green_button_1') as Container;

    if (canBind) {
        // Enable visual state
        layerObjects?.forEach(layer => layer.clearTint());

        // Bind click handler
        this.sceneBuilder.bindClick('Green_button_1', () => {
            this.performBinding();
        });
    } else {
        // Disable visual state
        layerObjects?.forEach(layer => layer.setTint(0x666666));

        // Remove click handler (bind empty function)
        this.sceneBuilder.bindClick('Green_button_1', () => {});
    }
}
```

## When to Use Each Method

| Method | Use Case |
|--------|----------|
| `sceneBuilder.bindClick(id, handler)` | UiElementBuilder buttons, template-based UI |
| `container.on('pointerdown', handler)` | Simple containers you created with `this.add.container()` |
| `sprite.on('pointerdown', handler)` | Individual sprites/images |

## Related Issues

### Hit Area Offset Bug

For simple containers (not UiElementBuilder), you may encounter the hit area offset bug. See `CLAUDE.md` section "Known Recurring Bugs" → "Hit Area Offset Bug".

**Fix:** Always use `container.setSize(w, h)` before `setInteractive()`:
```typescript
container.setSize(100, 50);
container.setInteractive({ useHandCursor: true });
```

## Example: Complete Button Setup

```typescript
// In create() - setup button once
private createBindingArea(): void {
    const bindButton = this.sceneBuilder.get('Green_button_1') as Container;

    // Set initial text
    const textObjects = bindButton.getData('textObjects') as Map<string, { text: Text }>;
    const btnText = textObjects?.get('text-area-id');
    btnText?.text.setText('BIND');

    // Initial state
    this.updateBindButton();
}

// Called whenever selection changes
private updateBindButton(): void {
    const bindButton = this.sceneBuilder.get('Green_button_1') as Container;
    if (!bindButton) return;

    const canBind = this.canPerformBinding();
    const layerObjects = bindButton.getData('layerObjects') as Map<string, Image>;
    const textObjects = bindButton.getData('textObjects') as Map<string, { text: Text }>;

    if (canBind) {
        // Visual: enabled
        layerObjects?.forEach(layer => layer.clearTint());
        textObjects?.forEach(t => t.text.setColor('#ffffff'));

        // Click handler
        this.sceneBuilder.bindClick('Green_button_1', () => this.performBinding());
    } else {
        // Visual: disabled
        layerObjects?.forEach(layer => layer.setTint(0x666666));
        textObjects?.forEach(t => t.text.setColor('#888888'));

        // No-op click handler
        this.sceneBuilder.bindClick('Green_button_1', () => {});
    }
}
```

## Debugging Tips

1. Add console.log inside the click handler to verify it's being called
2. Check if the button's layers are receiving events (click animation plays)
3. If animation plays but handler doesn't fire → use `sceneBuilder.bindClick()`
4. Check browser console for any errors during the click
