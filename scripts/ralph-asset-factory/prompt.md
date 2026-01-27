# Ralph Agent Instructions

You are an autonomous coding agent working on the Scene Editor project.

## Project Context

This is a Phaser game with a scene editor. The editor creates scenes but they don't render in the game due to an asset mapping gap:
- **scenes.json**: Uses dot-notation asset paths (e.g., `"environments.backgrounds.town"`)
- **scene-layouts.json**: Uses texture keys (e.g., `"bg-town"`)
- **assets.json**: Maps dot-notation → texture keys + metadata

We're building an Asset Factory to bridge this gap.

## Your Task

1. Read the PRD at `prd.json` (in the same directory as this file)
2. Read the progress log at `progress.txt` (check Codebase Patterns section first)
3. Check you're on the correct branch from PRD `branchName`. If not, check it out or create from main.
4. Pick the **highest priority** user story where `passes: false`
5. Implement that single user story
6. Run quality checks:
   - `cd /Users/datamole/little-math-adventure/scene-editor && npx tsc --noEmit`
7. Update CLAUDE.md if you discover reusable patterns
8. If checks pass, commit ALL changes with message: `feat: [Story ID] - [Story Title]`
9. Update the PRD to set `passes: true` for the completed story
10. Append your progress to `progress.txt`

## Key Directories

- **Scene Editor**: `/Users/datamole/little-math-adventure/scene-editor/`
- **Game**: `/Users/datamole/little-math-adventure/`
- **Data files**: `/Users/datamole/little-math-adventure/public/assets/data/`

## Progress Report Format

APPEND to progress.txt (never replace, always append):
```
## [Date/Time] - [Story ID]
- What was implemented
- Files changed
- **Learnings for future iterations:**
  - Patterns discovered
  - Gotchas encountered
  - Useful context
---
```

## Consolidate Patterns

If you discover a **reusable pattern**, add it to the `## Codebase Patterns` section at the TOP of progress.txt:

```
## Codebase Patterns
- API endpoints are in scene-editor/vite.config.ts
- Use existing component patterns from scene-editor/src/components/
- Data files are in little-math-adventure/public/assets/data/
```

## Quality Requirements

- ALL commits must pass typecheck
- Do NOT commit broken code
- Keep changes focused and minimal
- Follow existing code patterns

## Browser Testing (Required for Frontend Stories)

For any story that changes UI, you MUST verify it works in the browser:
1. Start the editor: `cd /Users/datamole/little-math-adventure/scene-editor && npm run dev`
2. Navigate to the relevant tab/panel
3. Verify the UI changes work as expected

A frontend story is NOT complete until browser verification passes.

## Stop Condition

After completing a user story, check if ALL stories have `passes: true`.

If ALL stories are complete and passing, reply with:
<promise>COMPLETE</promise>

If there are still stories with `passes: false`, end your response normally (another iteration will pick up the next story).

## Important

- Work on ONE story per iteration
- Commit frequently
- Keep CI green
- Read the Codebase Patterns section in progress.txt before starting
