import React from 'react';
import type { Artboard, DesignElement, DesignTemplate, TextDesignElement, ImageDesignElement, SvgDesignElement, ShapeDesignElement, PathDesignElement, PathGeometry } from '@document-tool/contracts';
import { 
  updateDesignElement,
  alignElements,
  distributeElements,
  joinPathGeometries,
  shapeToPathGeometry,
  trimPathSegment,
  closePathGeometry,
  getPathEndpoints,
  performBooleanSelection, performFragmentSelection, canBooleanSelection, canFragmentSelection,
  replaceElementsAtLayer,
  lineToCurve, lineToArc, flipArc, convertPathSegmentToLine, setPathPointMode, deletePathPointsSafely, mirrorElementsAcrossArtboard, flipElementsInPlace, flipElementsAsGroup,
  matchAlignmentUnitsSize,
  getAlignmentUnitCount
} from '@document-tool/design-engine';
import { DesignerToolbarMode } from './designerToolbarConfig.js';
import { DESIGN_FONT_FAMILIES } from './fontLibrary.js';
import { AlignLeft, AlignCenter, AlignRight, AlignHorizontalSpaceAround, AlignVerticalSpaceAround } from 'lucide-react';

export type DesignerContextToolbarProps = {
  mode: DesignerToolbarMode;
  sourceArtboard: Artboard;
  sourceElements: DesignElement[];
  primaryElementId?: string;
  mutate: (fn: (t: DesignTemplate) => DesignTemplate) => void;
  onGroupSelected?: () => void;
  onUngroupSelected?: () => void;
  pathEditMode?: { active: boolean; selectedNodeIds: string[] };
  interactionMode?: 'SELECT' | 'EDIT_PATH' | 'SCISSORS' | 'PEN' | 'TRIMMER' | 'SPLIT' | 'ERASER' | 'FILL_BUCKET' | 'DRAW_SHAPE' | 'FLEXIBLE_LINE' | 'MIRROR_LINE' | 'XLINE' | 'RAY' | 'ANGLE_LINE' | 'ARC' | 'REFERENCE_ALIGN';
  setInteractionMode?: (m: 'SELECT' | 'EDIT_PATH' | 'SCISSORS' | 'PEN' | 'TRIMMER' | 'SPLIT' | 'ERASER' | 'FILL_BUCKET' | 'DRAW_SHAPE' | 'FLEXIBLE_LINE' | 'MIRROR_LINE' | 'XLINE' | 'RAY' | 'ANGLE_LINE' | 'ARC' | 'REFERENCE_ALIGN') => void;
  pathSelectedSegmentIds?: string[];
  setPathSelectedSegmentIds?: (m: string[]) => void;
  setPathSelectedNodeIds?: (m: string[]) => void;
  onMirrorInvoked?: (axis: 'HORIZONTAL'|'VERTICAL') => void;
  onReferenceMirrorRequested?: (mode:'COPY'|'MOVE')=>void;
  onReferenceAlignRequested?: ()=>void;
  pathSymmetryMode?: 'OFF'|'H'|'V';
  setPathSymmetryMode?: (mode:'OFF'|'H'|'V')=>void;
  onReplaceSelection?: (elementIds:string[])=>void;
};

export const DesignerContextToolbar: React.FC<DesignerContextToolbarProps> = ({
  mode, sourceArtboard, sourceElements, primaryElementId, mutate, onGroupSelected, onUngroupSelected, pathEditMode, interactionMode, setInteractionMode, pathSelectedSegmentIds, setPathSelectedSegmentIds, setPathSelectedNodeIds, onMirrorInvoked, pathSymmetryMode='OFF', setPathSymmetryMode, onReplaceSelection, onReferenceMirrorRequested, onReferenceAlignRequested
}) => {
  if (mode === 'NONE') return null;

  const artboardId = sourceArtboard.id;
  const primary = sourceElements.find(element => element.id === primaryElementId) ?? sourceElements[0];

  const update = (fn: (e: DesignElement) => DesignElement) => {
    if (primary) mutate(t => updateDesignElement(t, artboardId, primary.id, fn));
  };

  const renderTextToolbar = () => {
    const el = primary as TextDesignElement;
    if (!el) return null;
    return (
      <>
        <div className="dg-designer-context-toolbar__group">
          <select value={el.style.fontFamily} onChange={e => update(e_ => ({ ...e_, style: { ... (e_ as TextDesignElement).style, fontFamily: e.target.value } }))}>
            {!(DESIGN_FONT_FAMILIES as readonly string[]).includes(el.style.fontFamily)&&<option value={el.style.fontFamily}>{el.style.fontFamily} (Current)</option>}
            {DESIGN_FONT_FAMILIES.map(f=><option key={f} value={f}>{f}</option>)}
          </select>
          <input 
            type="number" 
            className="dg-toolbar-number"
            min="1" 
            value={el.style.fontSizePt} 
            onChange={e => update(e_ => ({ ...e_, style: { ... (e_ as TextDesignElement).style, fontSizePt: Math.max(1, Number(e.target.value) || 1) } }))}
          />
        </div>
        <div className="dg-designer-context-toolbar__separator" />
        <div className="dg-designer-context-toolbar__group">
          <button className={`dg-toolbar-toggle ${el.style.fontWeight >= 700 ? 'active' : ''}`} onClick={() => update(e_ => ({ ...e_, style: { ... (e_ as TextDesignElement).style, fontWeight: el.style.fontWeight >= 700 ? 400 : 700 } }))}>B</button>
          <button className={`dg-toolbar-toggle ${el.style.italic ? 'active' : ''}`} onClick={() => update(e_ => ({ ...e_, style: { ... (e_ as TextDesignElement).style, italic: !el.style.italic } }))} style={{fontStyle:'italic'}}>I</button>
          <button className={`dg-toolbar-toggle ${el.style.underline ? 'active' : ''}`} onClick={() => update(e_ => ({ ...e_, style: { ... (e_ as TextDesignElement).style, underline: !el.style.underline } }))} style={{textDecoration:'underline'}}>U</button>
        </div>
        <div className="dg-designer-context-toolbar__separator" />
        <div className="dg-designer-context-toolbar__group">
          <select value={el.style.alignment} onChange={e => update(e_ => ({ ...e_, style: { ... (e_ as TextDesignElement).style, alignment: e.target.value as any } }))}>
            <option value="LEFT">Left</option>
            <option value="CENTER">Center</option>
            <option value="RIGHT">Right</option>
          </select>
          <input type="color" value={el.style.color} onChange={e => update(e_ => ({ ...e_, style: { ... (e_ as TextDesignElement).style, color: e.target.value } }))} />
        </div>
      </>
    );
  };

  const renderImageToolbar = () => {
    const el = primary as ImageDesignElement;
    if (!el) return null;
    return (
      <>
        <div className="dg-designer-context-toolbar__group">
          <span className="dg-designer-context-toolbar__label">Fit:</span>
          <select value={el.fit} onChange={e => update(e_ => ({ ...e_, fit: e.target.value as any }))}>
            <option value="FIT">Fit</option>
            <option value="FILL">Fill</option>
            <option value="STRETCH">Stretch</option>
          </select>
        </div>
        <div className="dg-designer-context-toolbar__separator" />
        <div className="dg-designer-context-toolbar__group">
          <span className="dg-designer-context-toolbar__label">Opacity:</span>
          <input type="range" min="0" max="100" value={Math.round(el.opacity * 100)} onChange={e => update(e_ => ({ ...e_, opacity: Number(e.target.value) / 100 }))} />
        </div>
      </>
    );
  };

  const renderSvgToolbar = () => {
    const el = primary as SvgDesignElement;
    if (!el) return null;
    return (
      <>
        <div className="dg-designer-context-toolbar__group">
          <span className="dg-designer-context-toolbar__label">Tint:</span>
          <input type="color" value={el.tintColor ?? '#111827'} onChange={e => update(e_ => ({ ...e_, tintColor: e.target.value }))} />
        </div>
        <div className="dg-designer-context-toolbar__separator" />
        <div className="dg-designer-context-toolbar__group">
          <span className="dg-designer-context-toolbar__label">Opacity:</span>
          <input type="range" min="0" max="100" value={Math.round(el.opacity * 100)} onChange={e => update(e_ => ({ ...e_, opacity: Number(e.target.value) / 100 }))} />
        </div>
      </>
    );
  };

  const renderShapeToolbar = () => {
    const el = primary as ShapeDesignElement;
    if (!el) return null;
    const isSolid = el.fill.type === 'SOLID';
    return (
      <>
        <div className="dg-designer-context-toolbar__group">
          <span className="dg-designer-context-toolbar__label">Fill:</span>
          {isSolid && <input type="color" value={(el.fill as any).color} onChange={e => update(e_ => ({ ...e_, fill: { type: 'SOLID', color: e.target.value, opacity: 1 } }))} />}
        </div>
        <div className="dg-designer-context-toolbar__separator" />
        <div className="dg-designer-context-toolbar__group">
          <span className="dg-designer-context-toolbar__label">Stroke:</span>
          <input type="color" value={el.stroke.color} onChange={e => update(e_ => ({ ...e_, stroke: { ... (e_ as ShapeDesignElement).stroke, color: e.target.value } }))} />
          <input type="number" min="0" step="0.1" className="dg-toolbar-number" value={el.stroke.widthMm} onChange={e => update(e_ => ({ ...e_, stroke: { ... (e_ as ShapeDesignElement).stroke, widthMm: Math.max(0, Number(e.target.value) || 0) } }))} />
        </div>
        <div className="dg-designer-context-toolbar__separator" />
        <div className="dg-designer-context-toolbar__group">
          <button className="dg-toolbar-button" onClick={() => {
            mutate(t => {
              return {
                ...t, artboards: t.artboards.map(a => a.id === sourceArtboard.id ? {
                  ...a, elements: a.elements.map(e => {
                    if (e.id !== el.id) return e;
                    const pathGeo = shapeToPathGeometry(el.shape as any, el.size);
                    return {
                      ...e,
                      type: 'PATH',
                      geometry: pathGeo,
                    } as unknown as import('@document-tool/contracts').PathDesignElement;
                  })
                } : a)
              };
            });
            if (setInteractionMode) setInteractionMode('EDIT_PATH');
          }}>Convert to Path</button>
        </div>
      </>
    );
  };

  const renderMultiToolbar = () => {
    const ids = sourceElements.map(e => e.id);
    const unitCount = getAlignmentUnitCount(sourceArtboard,ids);
    const groupIds=[...new Set(sourceElements.map(e=>e.groupId).filter(Boolean) as string[])];
    const singleGroup=groupIds.length===1&&sourceElements.every(e=>e.groupId===groupIds[0]);
    
    // Boolean works on any 2+ closed visible unlocked vector elements (SHAPE or PATH).
    const paths = sourceElements.filter(e => e.type === 'PATH') as import('@document-tool/contracts').PathDesignElement[];
    const canJoinPaths = paths.length === 2 && !paths[0]!.geometry.closed && !paths[1]!.geometry.closed;
    const canBooleanPaths = canBooleanSelection(sourceElements);
    const canFragmentPaths = canFragmentSelection(sourceElements);

    const doBooleanOperation = (op: 'UNION' | 'SUBTRACT' | 'INTERSECT' | 'EXCLUDE') => {
       if (!canBooleanPaths) return;
       const result = performBooleanSelection(sourceElements, primaryElementId, op);
       if (!result) return;
       const topZ = Math.max(...sourceElements.map(element => element.zIndex));
       const nextResult={...result,zIndex:topZ};
       mutate(t => replaceElementsAtLayer(t,sourceArtboard.id,sourceElements.map(element=>element.id),[nextResult]));
       onReplaceSelection?.([nextResult.id]);
    };

    const doFragment = () => {
      if (!canFragmentPaths) return;
      const fragments = performFragmentSelection(sourceElements, primaryElementId);
      if (!fragments.length) return;
      const topZ = Math.max(...sourceElements.map(element => element.zIndex));
      const nextFragments=fragments.map((fragment,index)=>({...fragment,zIndex:topZ+index}));
      mutate(t => replaceElementsAtLayer(t, sourceArtboard.id, sourceElements.map(element=>element.id), nextFragments));
      onReplaceSelection?.(nextFragments.map(fragment=>fragment.id));
    };
    
    const doJoinPaths = () => {
       if (!canJoinPaths) return;
       mutate(t => {
          const joined=joinPathGeometries(paths[0]!.geometry,paths[1]!.geometry,paths[0],paths[1]);
          return replaceElementsAtLayer(t,sourceArtboard.id,[paths[0]!.id,paths[1]!.id],[{
                   ...paths[0]!,
                   id: crypto.randomUUID(),
                   zIndex:Math.max(paths[0]!.zIndex,paths[1]!.zIndex),
                   ...joined.boundingBox,
                   geometry:joined.geometry
                }]);
       });
    };
    
    return (
      <>
        <div className="dg-designer-context-toolbar__group">
          <button className="dg-toolbar-button" title="Align Left" onClick={() => mutate(t => alignElements(t, artboardId, ids, 'LEFT', 'SELECTION'))}><AlignLeft size={16}/></button>
          <button className="dg-toolbar-button" title="Align Center" onClick={() => mutate(t => alignElements(t, artboardId, ids, 'HCENTER', 'SELECTION'))}><AlignCenter size={16}/></button>
          <button className="dg-toolbar-button" title="Align Right" onClick={() => mutate(t => alignElements(t, artboardId, ids, 'RIGHT', 'SELECTION'))}><AlignRight size={16}/></button>
        </div>
        <div className="dg-designer-context-toolbar__separator" />
        <div className="dg-designer-context-toolbar__group">
          <button className="dg-toolbar-button" title="Align Left to Primary" disabled={!primaryElementId} onClick={() => mutate(t => alignElements(t, artboardId, ids, 'LEFT', 'PRIMARY', primaryElementId))}>Primary L</button>
          <button className="dg-toolbar-button" title="Align horizontal center to Primary" disabled={!primaryElementId} onClick={() => mutate(t => alignElements(t, artboardId, ids, 'HCENTER', 'PRIMARY', primaryElementId))}>Primary C</button>
          <button className="dg-toolbar-button" title="Same Width as Primary" disabled={!primaryElementId} onClick={() => primaryElementId&&mutate(t => matchAlignmentUnitsSize(t,artboardId,ids,primaryElementId,'WIDTH'))}>Same W</button>
          <button className="dg-toolbar-button" title="Same Height as Primary" disabled={!primaryElementId} onClick={() => primaryElementId&&mutate(t => matchAlignmentUnitsSize(t,artboardId,ids,primaryElementId,'HEIGHT'))}>Same H</button>
          <button className="dg-toolbar-button" title="Same Size as Primary" disabled={!primaryElementId} onClick={() => primaryElementId&&mutate(t => matchAlignmentUnitsSize(t,artboardId,ids,primaryElementId,'BOTH'))}>Same Size</button>
        </div>
        <div className="dg-designer-context-toolbar__separator" />
        <div className="dg-designer-context-toolbar__group">
          <button className="dg-toolbar-button" title="Distribute Horizontal" disabled={unitCount < 3} onClick={() => mutate(t => distributeElements(t, artboardId, ids, 'HORIZONTAL'))}><AlignHorizontalSpaceAround size={16}/></button>
          <button className="dg-toolbar-button" title="Distribute Vertical" disabled={unitCount < 3} onClick={() => mutate(t => distributeElements(t, artboardId, ids, 'VERTICAL'))}><AlignVerticalSpaceAround size={16}/></button>
        </div>
        <div className="dg-designer-context-toolbar__separator" />
        <div className="dg-designer-context-toolbar__group">
          <button className="dg-toolbar-button" title="Flip selected vector/image elements horizontally in place" onClick={() => mutate(t => singleGroup?flipElementsAsGroup(t,artboardId,ids,'VERTICAL'):flipElementsInPlace(t, artboardId, ids, 'VERTICAL'))}>Flip H</button>
          <button className="dg-toolbar-button" title="Flip selected vector/image elements vertically in place" onClick={() => mutate(t => singleGroup?flipElementsAsGroup(t,artboardId,ids,'HORIZONTAL'):flipElementsInPlace(t, artboardId, ids, 'HORIZONTAL'))}>Flip V</button>
        </div>
        <div className="dg-designer-context-toolbar__separator" />
        <div className="dg-designer-context-toolbar__group">
          {onGroupSelected && <button className="dg-toolbar-button" onClick={onGroupSelected} disabled={unitCount < 2}>Group</button>}
          {onUngroupSelected && <button className="dg-toolbar-button" onClick={onUngroupSelected}>Ungroup</button>}
        </div>
        {canBooleanPaths && (
          <>
            <div className="dg-designer-context-toolbar__separator" />
            <div className="dg-designer-context-toolbar__group">
              <span className="dg-toolbar-group-label">Boolean</span>
              <button className="dg-toolbar-button" title="Union — merge all selected closed vectors. Primary element provides the result style." onClick={() => doBooleanOperation('UNION')}>Union</button>
              <button className="dg-toolbar-button" title="Subtract — subtract every other selected vector from the Primary element." onClick={() => doBooleanOperation('SUBTRACT')}>Subtract</button>
              <button className="dg-toolbar-button" title="Intersect — keep only the area common to all selected vectors." onClick={() => doBooleanOperation('INTERSECT')}>Intersect</button>
              <button className="dg-toolbar-button" title="Combine / XOR — keep non-overlapping regions." onClick={() => doBooleanOperation('EXCLUDE')}>Combine</button>
              <button className="dg-toolbar-button" disabled={!canFragmentPaths} title={canFragmentPaths?"Fragment — split two selected closed vectors into independent closed PATH regions.":"Fragment currently requires exactly two closed visible unlocked vectors."} onClick={doFragment}>Fragment</button>
            </div>
          </>
        )}
        {canJoinPaths && (
          <>
            <div className="dg-designer-context-toolbar__separator" />
            <div className="dg-designer-context-toolbar__group">
              <button className="dg-toolbar-button" onClick={doJoinPaths}>Join Paths</button>
            </div>
          </>
        )}
      </>
    );
  };

  const renderArtboardToolbar = () => {
    return (
      <div className="dg-designer-context-toolbar__group">
        <span className="dg-designer-context-toolbar__label">{sourceArtboard.name}</span>
      </div>
    );
  };

  const renderPathToolbar = () => {
    const el = primary as PathDesignElement;
    if (!el) return null;
    const isEditing = pathEditMode?.active;
    const selectedNodes = isEditing && pathEditMode?.selectedNodeIds.length ? pathEditMode.selectedNodeIds : [];
    
    const setNodeMode = (nodeMode: 'CORNER'|'SMOOTH'|'SYMMETRIC') => {
      if (!selectedNodes.length) return;
      mutate(t => ({
        ...t, artboards: t.artboards.map(a => a.id === sourceArtboard.id ? {
          ...a, elements: a.elements.map(e => e.id === el.id
            ? { ...(e as PathDesignElement), geometry: setPathPointMode((e as PathDesignElement).geometry, selectedNodes, nodeMode) }
            : e)
        } : a)
      }));
    };

    const deleteSelectedNodes = () => {
      if (!selectedNodes.length) return;
      mutate(t => ({
        ...t, artboards: t.artboards.map(a => a.id === sourceArtboard.id ? {
          ...a, elements: a.elements.map(e => e.id === el.id
            ? { ...(e as PathDesignElement), geometry: deletePathPointsSafely((e as PathDesignElement).geometry, selectedNodes) }
            : e)
        } : a)
      }));
      setPathSelectedNodeIds?.([]);
    };

    const convertSegmentToLine = () => {
      const segmentId = pathSelectedSegmentIds?.[0];
      if (!segmentId) return;
      mutate(t => ({
        ...t, artboards: t.artboards.map(a => a.id === sourceArtboard.id ? {
          ...a, elements: a.elements.map(e => e.id === el.id
            ? { ...(e as PathDesignElement), geometry: convertPathSegmentToLine((e as PathDesignElement).geometry, segmentId) }
            : e)
        } : a)
      }));
    };

    const trimSegment = () => {
      const segId = pathSelectedSegmentIds?.[0];
      if (!segId) return;
      mutate(t => {
        return {
          ...t, artboards: t.artboards.map(a => a.id === sourceArtboard.id ? {
            ...a, elements: a.elements.map(e => {
              if (e.id !== el.id) return e;
              const pEl = e as PathDesignElement;
              return { ...pEl, geometry: trimPathSegment(pEl.geometry, segId) };
            })
          } : a)
        };
      });
      if (setPathSelectedSegmentIds) setPathSelectedSegmentIds([]);
    };
    
    const applyToSelectedSegment = (fn: (geo: PathGeometry, segId: string) => PathGeometry) => {
      const segId = pathSelectedSegmentIds?.[0];
      if (!segId) return;
      mutate(t => {
        return {
          ...t, artboards: t.artboards.map(a => a.id === sourceArtboard.id ? {
            ...a, elements: a.elements.map(e => {
              if (e.id !== el.id) return e;
              const pEl = e as PathDesignElement;
              return { ...pEl, geometry: fn(pEl.geometry, segId) };
            })
          } : a)
        };
      });
    };

    const closePath = () => {
      mutate(t => {
        return {
          ...t, artboards: t.artboards.map(a => a.id === sourceArtboard.id ? {
            ...a, elements: a.elements.map(e => {
              if (e.id !== el.id) return e;
              const pEl = e as PathDesignElement;
              return { ...pEl, geometry: closePathGeometry(pEl.geometry) };
            })
          } : a)
        };
      });
    };

    return (
      <div className={`dg-path-toolbar ${isEditing ? 'dg-path-toolbar--editing' : ''}`} data-path-toolbar>
        {isEditing ? (
          <>
            <div className="dg-path-toolbar__section" data-path-node-selection>
              <span className="dg-path-toolbar__section-label">Nodes</span>
              <button className="dg-toolbar-button dg-toolbar-button--compact" title="Select all path nodes" onClick={() => setPathSelectedNodeIds?.(el.geometry.points.map(point => point.id))}>Select All</button>
              {!!selectedNodes.length && <button className="dg-toolbar-button dg-toolbar-button--compact" title="Clear node selection" onClick={() => setPathSelectedNodeIds?.([])}>Clear</button>}
              <span className="dg-path-toolbar__count" aria-label={`${selectedNodes.length} selected nodes`}>{selectedNodes.length}</span>
            </div>

            <div className="dg-path-toolbar__divider" />

            <div className="dg-path-toolbar__section" data-path-symmetry-controls>
              <span className="dg-path-toolbar__section-label">Symmetry</span>
              <div className="dg-path-toolbar__segmented" role="group" aria-label="Node movement symmetry">
                <button className={pathSymmetryMode==='OFF'?'active':''} title="Independent node movement" onClick={()=>setPathSymmetryMode?.('OFF')}>Off</button>
                <button className={pathSymmetryMode==='H'?'active':''} title="Mirror movement across the shape vertical centerline" onClick={()=>setPathSymmetryMode?.('H')}>H</button>
                <button className={pathSymmetryMode==='V'?'active':''} title="Mirror movement across the shape horizontal centerline" onClick={()=>setPathSymmetryMode?.('V')}>V</button>
              </div>
            </div>

            {selectedNodes.length > 0 && (
              <>
                <div className="dg-path-toolbar__divider" />
                <div className="dg-path-toolbar__section" data-path-node-type-controls>
                  <span className="dg-path-toolbar__section-label">Node Type</span>
                  <button className="dg-toolbar-button dg-toolbar-button--compact" onClick={() => setNodeMode('CORNER')}>Corner</button>
                  <button className="dg-toolbar-button dg-toolbar-button--compact" onClick={() => setNodeMode('SMOOTH')}>Smooth</button>
                  <button className="dg-toolbar-button dg-toolbar-button--compact" onClick={() => setNodeMode('SYMMETRIC')}>Symmetric</button>
                  <button className="dg-toolbar-button dg-toolbar-button--compact dg-toolbar-button--danger" onClick={deleteSelectedNodes}>Delete</button>
                </div>
              </>
            )}

            {pathSelectedSegmentIds?.length === 1 && (() => {
              const selectedSegment = el.geometry.segments.find(segment => segment.id === pathSelectedSegmentIds[0]);
              if (!selectedSegment) return null;
              const isLine = selectedSegment.type === 'LINE';
              const isCurve = selectedSegment.type === 'CUBIC_BEZIER';
              return (
                <>
                  <div className="dg-path-toolbar__divider" />
                  <div className="dg-path-toolbar__section" data-path-segment-controls>
                    <span className="dg-path-toolbar__section-label">Segment</span>
                    {isCurve && <button className="dg-toolbar-button dg-toolbar-button--compact" onClick={convertSegmentToLine}>Line</button>}
                    {isLine && <button className="dg-toolbar-button dg-toolbar-button--compact" onClick={() => applyToSelectedSegment(lineToCurve)}>Curve</button>}
                    {isLine && <button className="dg-toolbar-button dg-toolbar-button--compact" onClick={() => applyToSelectedSegment(lineToArc)}>Arc</button>}
                    {isCurve && <button className="dg-toolbar-button dg-toolbar-button--compact" onClick={() => applyToSelectedSegment(flipArc)}>Flip Arc</button>}
                    <button className="dg-toolbar-button dg-toolbar-button--compact dg-toolbar-button--danger" onClick={trimSegment}>Trim</button>
                  </div>
                </>
              );
            })()}

            <div className="dg-path-toolbar__divider" />
            <div className="dg-path-toolbar__section dg-path-toolbar__section--tools" data-path-edit-tools>
              <span className="dg-path-toolbar__section-label">Tools</span>
              {interactionMode === 'SCISSORS' ? (
                <button className="dg-toolbar-button dg-toolbar-button--compact active" onClick={() => setInteractionMode?.('EDIT_PATH')}>Exit Scissors</button>
              ) : (
                <button className="dg-toolbar-button dg-toolbar-button--compact" onClick={() => setInteractionMode?.('SCISSORS')}>Scissors</button>
              )}
              {!el.geometry.closed && getPathEndpoints(el.geometry).length === 2 && (
                <button className="dg-toolbar-button dg-toolbar-button--compact" onClick={closePath}>Close Path</button>
              )}
              <button className="dg-toolbar-button dg-toolbar-button--compact dg-toolbar-button--primary-soft" onClick={() => { setPathSelectedNodeIds?.([]); setPathSelectedSegmentIds?.([]); setInteractionMode?.('SELECT'); }}>Done</button>
            </div>
          </>
        ) : (
          <>
            <div className="dg-path-toolbar__section">
              <button className="dg-toolbar-button dg-toolbar-button--compact dg-toolbar-button--primary-soft" onClick={() => setInteractionMode?.('EDIT_PATH')}>Edit Path</button>
              <span className="dg-designer-context-toolbar__label">Double-click also works</span>
            </div>
            <div className="dg-path-toolbar__divider" />
            <div className="dg-path-toolbar__section" data-path-opacity-control>
              <span className="dg-path-toolbar__section-label">Opacity</span>
              <input aria-label="Path opacity" type="range" min="0" max="100" value={Math.round(el.opacity * 100)} onChange={event => update(current => ({ ...current, opacity: Number(event.target.value) / 100 }))} />
              <span className="dg-path-toolbar__count">{Math.round(el.opacity * 100)}%</span>
            </div>
          </>
        )}
      </div>
    );
  };

  const mirror=(axis:'HORIZONTAL'|'VERTICAL')=>{
    const ids=sourceElements.filter(element=>!element.locked).map(element=>element.id);
    if(ids.length){mutate(template=>mirrorElementsAcrossArtboard(template,sourceArtboard.id,ids,axis));onMirrorInvoked?.(axis);}
  };

  return (
    <div className="dg-designer-context-toolbar" role="toolbar">
      {sourceElements.length>0 && !(mode === 'PATH' && pathEditMode?.active) && <><div className="dg-designer-context-toolbar__group" data-page-center-mirror-tools><button className="dg-toolbar-button" title="Mirror Across Page Horizontal Center" onClick={()=>mirror('HORIZONTAL')}>↕ Mirror H</button><button className="dg-toolbar-button" title="Mirror Across Page Vertical Center" onClick={()=>mirror('VERTICAL')}>↔ Mirror V</button></div><div className="dg-designer-context-toolbar__separator" /></>}
      {sourceElements.length>0 && !(mode === 'PATH' && pathEditMode?.active) && <><div className="dg-designer-context-toolbar__group" data-reference-line-mirror-tools><button className="dg-toolbar-button" title="CAD Mirror Copy: pick two points for the reference axis" onClick={()=>onReferenceMirrorRequested?.('COPY')} onDoubleClick={()=>onReferenceMirrorRequested?.('COPY')}>⌁ Line Copy</button><button className="dg-toolbar-button" title="CAD Mirror Move: pick two points for the reference axis" onClick={()=>onReferenceMirrorRequested?.('MOVE')} onDoubleClick={()=>onReferenceMirrorRequested?.('MOVE')}>⌁ Line Move</button></div><div className="dg-designer-context-toolbar__separator" /></>}\n      {sourceElements.length===1 && (mode==='SHAPE'||mode==='PATH') && !(mode === 'PATH' && pathEditMode?.active) && <><div className="dg-designer-context-toolbar__group" data-reference-edge-align-tools><button className={`dg-toolbar-button ${interactionMode==='REFERENCE_ALIGN'?'active':''}`} title="Pick one edge on the selected vector, then click a Ray/XLINE/Line reference to rotate + move the edge onto it" onClick={()=>onReferenceAlignRequested?.()}>⌁ Align Edge</button></div><div className="dg-designer-context-toolbar__separator" /></>}
      {mode === 'TEXT' && renderTextToolbar()}
      {mode === 'IMAGE' && renderImageToolbar()}
      {mode === 'SVG' && renderSvgToolbar()}
      {mode === 'SHAPE' && renderShapeToolbar()}
      {mode === 'PATH' && renderPathToolbar()}
      {mode === 'MULTI' && renderMultiToolbar()}
      {mode === 'ARTBOARD' && renderArtboardToolbar()}
    </div>
  );
};
