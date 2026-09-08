export interface CadPointMm { xMm:number; yMm:number }

export function normalizeCadAngleDeg(deg:number):number{
  return ((deg%360)+360)%360;
}

/** Resolve an exact CAD endpoint from an origin, length and angle. */
export function resolveCadDynamicEndpoint(origin:CadPointMm,lengthMm:number,angleDeg:number):CadPointMm{
  if(!Number.isFinite(lengthMm)||lengthMm<=0) throw new Error('CAD length must be greater than zero');
  if(!Number.isFinite(angleDeg)) throw new Error('CAD angle must be finite');
  const radians=normalizeCadAngleDeg(angleDeg)*Math.PI/180;
  return {xMm:origin.xMm+Math.cos(radians)*lengthMm,yMm:origin.yMm+Math.sin(radians)*lengthMm};
}
