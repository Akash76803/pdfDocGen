# UX-5 Fix1 — Shape Media Background Placement

## Reported QA issue
For a wide Rectangle Shape containing a square image, Formatting → Media Style exposed only **Fit** and **Position**. The Shape-level media placement mode (**Background**) and **Clip media to shape** were available only in Content → Inner Layout, so the common full-frame image workflow was difficult to discover. The media remained in a left/center content slot and therefore appeared as a narrow image block instead of filling the Rectangle.

## Fix
Formatting → Media Style now exposes the Shape media placement controls directly:

- **Placement in shape**
  - Left
  - Right
  - Top
  - Bottom
  - Center / icon
  - **Background — fill shape**
- **Clip media to shape**
- **Background media opacity** when Background is selected
- **Fit**: Contain / Cover / Stretch
- **Focal position**: Center / Top / Bottom / Left / Right

Both Content → Inner Layout and Formatting → Media Style edit the same persisted fields, so there is no duplicate state.

## Fill Shape with Media quick action
A new **Fill Shape with Media** button applies the recommended full-background configuration in one click:

- Placement = `background`
- Clip media to shape = `true`
- Fit = `cover`
- Focal position = `center`

For the reported Rectangle + square-image case this is the fastest path to a full-frame image.

## Files changed
- `apps/desktop/src/pages/TemplateBuilder.tsx`
- `apps/desktop/src/styles/app.css`

## Manual QA
1. Add Rectangle Shape.
2. Content → Content mode = Media.
3. Upload square image.
4. Formatting → Media Style.
5. Click **Fill Shape with Media**.
6. Verify image fills the whole Rectangle.
7. Verify Placement = Background, Clip = ON, Fit = Cover, Focal position = Center.
8. Change Background media opacity and focal position.
9. Test Circle/Star with Clip ON.
10. Save/reload and confirm settings persist.

## Verification
- `TemplateBuilder.tsx` TypeScript transpile syntax check: PASS
- CSS brace validation: PASS
- Full workspace typecheck requires the normal project dependencies to be installed.
