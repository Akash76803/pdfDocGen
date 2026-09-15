# UX-5 Fix1 — Shape Media Background Placement

This fix makes the Shape media background workflow explicit in **Formatting → Media Style** and keeps the same control available in **Content → Inner Layout**.

## Media Style now exposes
- Placement in shape: Left / Right / Top / Bottom / Center / **Background — fill shape**
- **Clip media to shape** toggle
- Fit: Contain / Cover / Stretch
- Focal position: Center / Top / Bottom / Left / Right
- Background media opacity when Background placement is active
- One-click **Fill Shape with Media** preset

## Background behavior
Selecting **Background** automatically applies the recommended full-bleed setup:
- `shapeMediaPosition = background`
- `shapeClipMedia = true`
- `imageFit = cover`
- `imageObjectPosition = center`

The user may change Fit, focal position, clipping, or opacity afterward.

## Expected test
For a Rectangle shape with a square image:
1. Content mode = Media or Text + Media
2. Formatting → Media Style → Placement in shape = Background — fill shape
3. Confirm Clip media to shape = ON
4. Confirm Fit = Cover
5. Confirm Focal position = Center

The image should fill the full Rectangle frame rather than appear as a narrow centered media slot.
