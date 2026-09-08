import type { DesignShapeKind } from '@document-tool/contracts';

export type DesignerShortcutItem = {
  keys: string[];
  action: string;
  description: string;
};

export type DesignerShortcutGroup = {
  title: string;
  items: DesignerShortcutItem[];
};

export type DesignerUtilityShortcut =
  | 'SELECT'
  | 'LINE'
  | 'POLYLINE'
  | 'XLINE'
  | 'RAY'
  | 'ANGLE_LINE'
  | 'ARC'
  | 'PEN'
  | 'EDIT_PATH'
  | 'SCISSORS'
  | 'SPLIT'
  | 'TRIMMER'
  | 'ERASER'
  | 'FILL_BUCKET'
  | 'JOIN_PATH'
  | 'CLOSE_PATH';

const shapeShortcut = (keys: string[], action: string): DesignerShortcutItem => ({
  keys,
  action,
  description: `Activate ${action} drawing mode. Click/drag on the artboard to create the shape.`,
});

export const DESIGNER_SHAPE_SHORTCUTS: Array<{ key: string; alt: boolean; shift?: boolean; shape: DesignShapeKind; item: DesignerShortcutItem }> = [
  { key: 'r', alt: true, shape: 'RECTANGLE', item: shapeShortcut(['Alt', 'R'], 'Rectangle') },
  { key: 's', alt: true, shape: 'SQUARE', item: shapeShortcut(['Alt', 'S'], 'Square') },
  { key: 'r', alt: true, shift: true, shape: 'ROUNDED_RECTANGLE', item: shapeShortcut(['Alt', 'Shift', 'R'], 'Rounded Rectangle') },
  { key: 'u', alt: true, shape: 'CAPSULE', item: shapeShortcut(['Alt', 'U'], 'Capsule') },
  { key: 'c', alt: true, shape: 'CIRCLE', item: shapeShortcut(['Alt', 'C'], 'Circle') },
  { key: 'e', alt: true, shape: 'ELLIPSE', item: shapeShortcut(['Alt', 'E'], 'Ellipse') },
  { key: 't', alt: true, shape: 'TRIANGLE', item: shapeShortcut(['Alt', 'T'], 'Triangle') },
  { key: 't', alt: true, shift: true, shape: 'RIGHT_TRIANGLE', item: shapeShortcut(['Alt', 'Shift', 'T'], 'Right Triangle') },
  { key: 'd', alt: true, shape: 'DIAMOND', item: shapeShortcut(['Alt', 'D'], 'Diamond') },
  { key: '5', alt: true, shape: 'PENTAGON', item: shapeShortcut(['Alt', '5'], 'Pentagon') },
  { key: '6', alt: true, shape: 'HEXAGON', item: shapeShortcut(['Alt', '6'], 'Hexagon') },
  { key: '8', alt: true, shape: 'OCTAGON', item: shapeShortcut(['Alt', '8'], 'Octagon') },
  { key: 'z', alt: true, shape: 'TRAPEZOID', item: shapeShortcut(['Alt', 'Z'], 'Trapezoid') },
  { key: 'p', alt: true, shift: true, shape: 'PARALLELOGRAM', item: shapeShortcut(['Alt', 'Shift', 'P'], 'Parallelogram') },
  { key: 'a', alt: true, shape: 'ARROW', item: shapeShortcut(['Alt', 'A'], 'Arrow') },
  { key: 'a', alt: true, shift: true, shape: 'DOUBLE_ARROW', item: shapeShortcut(['Alt', 'Shift', 'A'], 'Double Arrow') },
  { key: 'y', alt: true, shape: 'CURVED_ARROW', item: shapeShortcut(['Alt', 'Y'], 'Curved Arrow') },
  { key: 'v', alt: true, shape: 'CHEVRON', item: shapeShortcut(['Alt', 'V'], 'Chevron') },
  { key: 'v', alt: true, shift: true, shape: 'DOUBLE_CHEVRON', item: shapeShortcut(['Alt', 'Shift', 'V'], 'Double Chevron') },
  { key: 'g', alt: true, shape: 'STAR', item: shapeShortcut(['Alt', 'G'], 'Star') },
  { key: 'p', alt: true, shape: 'POLYGON', item: shapeShortcut(['Alt', 'P'], 'Polygon') },
  { key: 'h', alt: true, shape: 'HEART', item: shapeShortcut(['Alt', 'H'], 'Heart') },
  { key: 'k', alt: true, shape: 'CLOUD', item: shapeShortcut(['Alt', 'K'], 'Cloud') },
  { key: 'b', alt: true, shape: 'SPEECH_BUBBLE', item: shapeShortcut(['Alt', 'B'], 'Speech Bubble') },
  { key: 'b', alt: true, shift: true, shape: 'CALLOUT', item: shapeShortcut(['Alt', 'Shift', 'B'], 'Callout') },
  { key: 'j', alt: true, shape: 'DOCUMENT', item: shapeShortcut(['Alt', 'J'], 'Document') },
  { key: 'i', alt: true, shape: 'CYLINDER', item: shapeShortcut(['Alt', 'I'], 'Cylinder') },
  { key: 'x', alt: true, shape: 'CROSS', item: shapeShortcut(['Alt', 'X'], 'Cross') },
  { key: '=', alt: true, shape: 'PLUS', item: shapeShortcut(['Alt', '='], 'Plus') },
  { key: 'n', alt: true, shape: 'BANNER', item: shapeShortcut(['Alt', 'N'], 'Banner') },
  { key: 'h', alt: true, shift: true, shape: 'SHIELD', item: shapeShortcut(['Alt', 'Shift', 'H'], 'Shield') },
  { key: 'w', alt: true, shape: 'RIBBON', item: shapeShortcut(['Alt', 'W'], 'Ribbon') },
  { key: 'q', alt: true, shape: 'BADGE', item: shapeShortcut(['Alt', 'Q'], 'Badge') },
  { key: 'c', alt: true, shift: true, shape: 'HALF_CIRCLE', item: shapeShortcut(['Alt', 'Shift', 'C'], 'Half Circle') },
  { key: 'm', alt: true, shape: 'ARC', item: shapeShortcut(['Alt', 'M'], 'Arc') },
  { key: '[', alt: true, shape: 'BRACKET', item: shapeShortcut(['Alt', '['], 'Bracket') },
  { key: 'l', alt: true, shape: 'LABEL_TAG', item: shapeShortcut(['Alt', 'L'], 'Label Tag') },
];

export const DESIGNER_UTILITY_SHORTCUTS: Array<{ key: string; shift?: boolean; action: DesignerUtilityShortcut; item: DesignerShortcutItem }> = [
  { key: 'v', action: 'SELECT', item: { keys: ['V'], action: 'Select Tool', description: 'Exit the active drawing tool and activate normal selection.' } },
  { key: 'l', action: 'LINE', item: { keys: ['L'], action: 'Line', description: 'Activate the CAD two-point LINE tool.' } },
  { key: 'p', action: 'POLYLINE', item: { keys: ['P'], action: 'Polyline', description: 'Activate the connected multi-segment Polyline tool.' } },
  { key: 'x', action: 'XLINE', item: { keys: ['X'], action: 'Construction Line', description: 'Activate CAD XLINE reference drawing.' } },
  { key: 'r', action: 'RAY', item: { keys: ['R'], action: 'Ray', description: 'Activate CAD RAY — an origin-based one-direction construction reference.' } },
  { key: 'a', action: 'ANGLE_LINE', item: { keys: ['A'], action: 'Angle Line', description: 'Activate dedicated CAD Angle Line. Pick a start point, then enter exact Length and Angle or use the live preview.' } },
  { key: 'a', shift: true, action: 'ARC', item: { keys: ['Shift', 'A'], action: 'CAD Arc', description: 'Create an editable circular arc using Start, Through and End points.' } },
  { key: 'n', action: 'PEN', item: { keys: ['N'], action: 'Pen Tool', description: 'Activate the freeform Pen path tool.' } },
  { key: 'e', action: 'EDIT_PATH', item: { keys: ['E'], action: 'Edit Path', description: 'Enter Edit Path for exactly one selected PATH.' } },
  { key: 'k', action: 'SCISSORS', item: { keys: ['K'], action: 'Scissors', description: 'Activate Scissors for a selected editable PATH.' } },
  { key: 's', shift: true, action: 'SPLIT', item: { keys: ['Shift', 'S'], action: 'Split', description: 'Activate the boundary-to-boundary section Split tool.' } },
  { key: 't', action: 'TRIMMER', item: { keys: ['T'], action: 'Erase Segment', description: 'Activate CAD-style segment erasing/trimming.' } },
  { key: 'e', shift: true, action: 'ERASER', item: { keys: ['Shift', 'E'], action: 'Freeform Eraser', description: 'Activate the freeform lasso eraser.' } },
  { key: 'b', action: 'FILL_BUCKET', item: { keys: ['B'], action: 'Fill Bucket', description: 'Activate Fill Bucket for closed shapes/sections.' } },
  { key: 'j', action: 'JOIN_PATH', item: { keys: ['J'], action: 'Join Path', description: 'Join exactly two selected open PATHs when eligible.' } },
  { key: 'c', shift: true, action: 'CLOSE_PATH', item: { keys: ['Shift', 'C'], action: 'Close Path', description: 'Close exactly one selected open PATH when eligible.' } },
];

export const DESIGNER_SHORTCUT_GROUPS: DesignerShortcutGroup[] = [
  {
    title: 'General',
    items: [
      { keys: ['Ctrl', 'Z'], action: 'Undo', description: 'Undo the last design change.' },
      { keys: ['Ctrl', 'Shift', 'Z'], action: 'Redo', description: 'Redo the last undone design change.' },
      { keys: ['Ctrl', 'Y'], action: 'Redo', description: 'Alternate redo shortcut.' },
      { keys: ['Esc'], action: 'Exit / Cancel tool', description: 'Exit the active drawing/editing tool and return to Select. In Select mode, clears selection.' },
      { keys: ['Delete'], action: 'Delete', description: 'Delete selected elements, or selected path nodes while editing a path.' },
      { keys: ['Backspace'], action: 'Delete', description: 'Same as Delete for the current selection.' },
    ],
  },
  {
    title: 'Selection, Clipboard & Duplicate',
    items: [
      { keys: ['Ctrl', 'A'], action: 'Select all', description: 'Select all selectable elements on the active artboard.' },
      { keys: ['Ctrl', 'C'], action: 'Copy', description: 'Copy the current selection.' },
      { keys: ['Ctrl', 'V'], action: 'Paste', description: 'Paste copied elements with an offset.' },
      { keys: ['Ctrl', 'D'], action: 'Duplicate with offset', description: 'Duplicate the current selection and offset the copy by 2 mm.' },
      { keys: ['Ctrl', 'Shift', 'D'], action: 'Duplicate in place', description: 'Duplicate the current selection at the exact same coordinates for stacked copies.' },
      { keys: ['Arrow keys'], action: 'Nudge', description: 'Move selected elements one nudge step.' },
      { keys: ['Shift', 'Arrow keys'], action: 'Large nudge', description: 'Move selected elements by a larger nudge step.' },
      { keys: ['Ctrl / Cmd / Shift', 'Click'], action: 'Toggle selection', description: 'Add or remove an element from the current selection.' },
      { keys: ['Alt', 'Click'], action: 'Select generated component', description: 'On an auto-section face, select the related generated component/group instead of only the clicked face.' },
    ],
  },
  { title: 'Utility Tools', items: DESIGNER_UTILITY_SHORTCUTS.map(entry => entry.item) },
  { title: 'Shapes', items: DESIGNER_SHAPE_SHORTCUTS.map(entry => entry.item) },
  {
    title: 'Groups',
    items: [
      { keys: ['Ctrl', 'G'], action: 'Group', description: 'Group the current multi-selection.' },
      { keys: ['Ctrl', 'Shift', 'G'], action: 'Ungroup', description: 'Ungroup selected grouped elements.' },
    ],
  },
  {
    title: 'CAD Drawing',
    items: [
      { keys: ['F8'], action: 'Toggle Ortho', description: 'Toggle horizontal/vertical Ortho tracking.' },
      { keys: ['F10'], action: 'Toggle Polar', description: 'Toggle Polar angle tracking.' },
      { keys: ['Enter'], action: 'Finish current path', description: 'Finish the active Pen/Polyline path and stay ready to start another.' },
      { keys: ['Enter'], action: 'Commit dynamic input', description: 'While editing CAD Length/Angle or Circle Radius input, commit the exact typed value.' },
      { keys: ['Tab'], action: 'Switch CAD input field', description: 'Move between Length and Angle fields in the LINE dynamic input HUD.' },
      { keys: ['Esc'], action: 'Exit drawing', description: 'Exit LINE, Polyline, Pen, Split, Mirror Line, XLINE, RAY, or shape drawing and return to Select.' },
    ],
  },
  {
    title: 'Path Editing',
    items: [
      { keys: ['Enter'], action: 'Exit Edit Path', description: 'Finish path editing and return to Select.' },
      { keys: ['Delete / Backspace'], action: 'Delete nodes', description: 'Delete selected path nodes safely.' },
      { keys: ['Arrow keys'], action: 'Nudge nodes', description: 'Move selected path nodes.' },
      { keys: ['Shift', 'Arrow keys'], action: 'Large node nudge', description: 'Move selected path nodes by a larger step.' },
      { keys: ['Shift', 'Click'], action: 'Multi-select / add node', description: 'Toggle existing nodes; on an empty path segment, add a new node.' },
      { keys: ['Double-click endpoint'], action: 'Extend CAD LINE', description: 'In Edit Path, extend a CAD LINE endpoint along its current angle to the nearest valid boundary.' },
    ],
  },
  {
    title: 'Canvas Navigation',
    items: [
      { keys: ['Mouse wheel'], action: 'Zoom', description: 'Pointer-centered CAD-style zoom.' },
      { keys: ['Middle mouse', 'Drag'], action: 'Pan', description: 'Pan the canvas without using scrollbars.' },
      { keys: ['Space', 'Drag'], action: 'Pan', description: 'Temporarily pan the canvas while holding Space.' },
      { keys: ['Pan tool', 'Left drag'], action: 'Pan', description: 'With Pan mode enabled, drag the canvas using the left mouse button.' },
    ],
  },
];

export function resolveDesignerShapeShortcut(event: KeyboardEvent): DesignShapeKind | null {
  if (!event.altKey || event.ctrlKey || event.metaKey) return null;
  const key = event.key.toLowerCase();
  const match = DESIGNER_SHAPE_SHORTCUTS.find(entry => entry.key === key && Boolean(entry.shift) === event.shiftKey);
  return match?.shape ?? null;
}

export function resolveDesignerUtilityShortcut(event: KeyboardEvent): DesignerUtilityShortcut | null {
  if (event.altKey || event.ctrlKey || event.metaKey) return null;
  const key = event.key.toLowerCase();
  const match = DESIGNER_UTILITY_SHORTCUTS.find(entry => entry.key === key && Boolean(entry.shift) === event.shiftKey);
  return match?.action ?? null;
}
