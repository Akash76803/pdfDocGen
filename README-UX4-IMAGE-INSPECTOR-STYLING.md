# DB5G UX4 – Image / Signature Inspector Styling

## Goal
Bring the Image inspector closer to the redesigned Text/Table inspectors so users can manage:
- image source
- dynamic image binding
- position and size
- flow vs floating placement
- fit mode
- border / corner radius / background / opacity styling

## Implemented

### 1) Image / Signature tabs
For Image and Signature elements the inspector now shows:
- Properties
- Formatting
- Conditions

The old separate `Data` tab is removed for Image/Signature. Dynamic binding is now inside **Properties → Image Source**.

### 2) Image Properties panel
Added structured sections:
- **Image Source**
  - Upload / Replace image
  - Remove image
  - Image URL / data URL
  - Dynamic binding picker
  - Binding preview
- **Position & Size**
  - X / Y / Width / Height
- **Layout**
  - Flow / Floating using the same document-flow concepts as text
- **Fit & Crop**
  - Contain / Cover / Stretch
- **Region**
  - Body / Header / Footer
- **Advanced**
  - Arrange + Duplicate + Delete

### 3) Image Formatting panel
Added formatting controls:
- **Appearance**
  - Opacity
  - Background color
- **Border**
  - Border style
  - Border width
  - Border color
  - Corner radius

### 4) Canvas rendering
Image / Signature frames now respect the new styling fields in the live builder preview:
- background color
- opacity
- border style / width / color
- border radius

## Files touched
- `apps/desktop/src/pages/TemplateBuilder.tsx`
- `apps/desktop/src/styles/app.css`

## Manual test checklist
1. Add an **Image** element.
2. Confirm tabs are **Properties / Formatting / Conditions** only.
3. In **Properties → Image Source**, upload an image and verify preview updates.
4. Bind the image to a dynamic field and verify the binding preview shows.
5. Change Width / Height and verify the frame resizes.
6. Switch **Fit mode** between Contain / Cover / Stretch and verify preview behavior.
7. In **Formatting**, set:
   - opacity
   - background color
   - border style / width / color
   - corner radius
   and confirm canvas preview updates.
8. Switch image between **Flow** and **Floating** and verify layout tools behave like the redesigned text inspector.
9. Repeat for a **Signature** element.

## Verification note
Local full typecheck/build could not be completed in this environment because required dependency typings were not fully installed from the workspace lockfile. Source-level implementation is completed and ready for normal project-side `npm install` + `npm run typecheck` + `npm run build` verification.
