import type { DesignFill, DesignGradientStop, DesignImageTransform, DesignStroke } from '@document-tool/contracts';

export type MixedValue<T> =
  | { mixed: false; value: T }
  | { mixed: true };

export type MixedValueEquality<T> = (a: T, b: T) => boolean;

export function resolveMixedValue<T, TSource>(
  sources: readonly TSource[],
  getter: (source: TSource) => T,
  equals: MixedValueEquality<T> = Object.is,
): MixedValue<T> {
  if (!sources.length) return { mixed: true };
  const first = getter(sources[0]!);
  for (let index = 1; index < sources.length; index += 1) {
    if (!equals(first, getter(sources[index]!))) return { mixed: true };
  }
  return { mixed: false, value: first };
}

const optionalNumberEqual = (a?: number, b?: number) => (a ?? 1) === (b ?? 1);
const stopEqual = (a: DesignGradientStop, b: DesignGradientStop) => a.offset === b.offset && a.color === b.color && optionalNumberEqual(a.opacity, b.opacity);
const stopsEqual=(a:DesignGradientStop[],b:DesignGradientStop[])=>a.length===b.length&&a.every((stop,index)=>stopEqual(stop,b[index]!));
const imageTransformEqual=(a?:DesignImageTransform,b?:DesignImageTransform)=>{
  const left=a??{scale:1,offsetX:0,offsetY:0,rotationDeg:0};
  const right=b??{scale:1,offsetX:0,offsetY:0,rotationDeg:0};
  return left.scale===right.scale&&left.offsetX===right.offsetX&&left.offsetY===right.offsetY&&left.rotationDeg===right.rotationDeg;
};

export function designFillEquals(a: DesignFill, b: DesignFill): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case 'NONE': return true;
    case 'SOLID': {
      const other = b as Extract<DesignFill, { type: 'SOLID' }>;
      return a.color === other.color && optionalNumberEqual(a.opacity, other.opacity);
    }
    case 'IMAGE': {
      const other = b as Extract<DesignFill, { type: 'IMAGE' }>;
      return a.assetId === other.assetId && a.fit === other.fit && optionalNumberEqual(a.opacity, other.opacity) && imageTransformEqual(a.transform,other.transform);
    }
    case 'LINEAR_GRADIENT': {
      const other = b as Extract<DesignFill, { type: 'LINEAR_GRADIENT' }>;
      return a.gradient.angleDeg === other.gradient.angleDeg && stopsEqual(a.gradient.stops,other.gradient.stops);
    }
    case 'RADIAL_GRADIENT': {
      const other=b as Extract<DesignFill,{type:'RADIAL_GRADIENT'}>;
      return a.gradient.centerX===other.gradient.centerX&&a.gradient.centerY===other.gradient.centerY&&a.gradient.radius===other.gradient.radius&&(a.gradient.focalX??a.gradient.centerX)===(other.gradient.focalX??other.gradient.centerX)&&(a.gradient.focalY??a.gradient.centerY)===(other.gradient.focalY??other.gradient.centerY)&&stopsEqual(a.gradient.stops,other.gradient.stops);
    }
    case 'PATTERN': {
      const other=b as Extract<DesignFill,{type:'PATTERN'}>;
      return a.pattern.kind===other.pattern.kind&&a.pattern.foreground===other.pattern.foreground&&a.pattern.background===other.pattern.background&&a.pattern.scale===other.pattern.scale&&a.pattern.rotationDeg===other.pattern.rotationDeg&&optionalNumberEqual(a.pattern.opacity,other.pattern.opacity);
    }
  }
}

export function designStrokeEquals(a: DesignStroke, b: DesignStroke): boolean {
  const dashA=a.dashArray??[],dashB=b.dashArray??[];
  return a.color === b.color
    && a.widthMm === b.widthMm
    && a.style === b.style
    && optionalNumberEqual(a.opacity, b.opacity)
    && (a.lineCap??'BUTT')===(b.lineCap??'BUTT')
    && (a.lineJoin??'MITER')===(b.lineJoin??'MITER')
    && (a.miterLimit??4)===(b.miterLimit??4)
    && (a.dashOffset??0)===(b.dashOffset??0)
    && dashA.length===dashB.length
    && dashA.every((value,index)=>value===dashB[index]);
}
