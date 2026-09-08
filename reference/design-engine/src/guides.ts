import type { DesignTemplate, Guide, GuideOrientation } from '@document-tool/contracts';

function updateArtboard(template:DesignTemplate,artboardId:string,fn:(artboard:DesignTemplate['artboards'][number])=>DesignTemplate['artboards'][number]):DesignTemplate{
  let changed=false;
  const artboards=template.artboards.map(artboard=>{
    if(artboard.id!==artboardId)return artboard;
    const next=fn(artboard);changed=changed||next!==artboard;return next;
  });
  return changed?{...template,artboards}:template;
}

function clampPosition(orientation:GuideOrientation,positionMm:number,widthMm:number,heightMm:number):number{
  const max=orientation==='VERTICAL'?widthMm:heightMm;
  if(!Number.isFinite(positionMm))return 0;
  return Math.min(max,Math.max(0,positionMm));
}

export function addGuide(template:DesignTemplate,artboardId:string,guide:Guide):DesignTemplate{
  return updateArtboard(template,artboardId,artboard=>{
    if(artboard.guides.some(existing=>existing.id===guide.id))return artboard;
    const normalized:Guide={...guide,positionMm:clampPosition(guide.orientation,guide.positionMm,artboard.widthMm,artboard.heightMm),locked:Boolean(guide.locked)};
    return {...artboard,guides:[...artboard.guides,normalized]};
  });
}

export function moveGuide(template:DesignTemplate,artboardId:string,guideId:string,positionMm:number):DesignTemplate{
  return updateArtboard(template,artboardId,artboard=>{
    const guide=artboard.guides.find(item=>item.id===guideId);
    if(!guide||guide.locked)return artboard;
    const nextPosition=clampPosition(guide.orientation,positionMm,artboard.widthMm,artboard.heightMm);
    if(Math.abs(nextPosition-guide.positionMm)<1e-9)return artboard;
    return {...artboard,guides:artboard.guides.map(item=>item.id===guideId?{...item,positionMm:nextPosition}:item)};
  });
}

export function deleteGuide(template:DesignTemplate,artboardId:string,guideId:string):DesignTemplate{
  return updateArtboard(template,artboardId,artboard=>{
    const guide=artboard.guides.find(item=>item.id===guideId);
    if(!guide||guide.locked)return artboard;
    return {...artboard,guides:artboard.guides.filter(item=>item.id!==guideId)};
  });
}

export function setGuideLocked(template:DesignTemplate,artboardId:string,guideId:string,locked:boolean):DesignTemplate{
  return updateArtboard(template,artboardId,artboard=>{
    const guide=artboard.guides.find(item=>item.id===guideId);
    if(!guide||Boolean(guide.locked)===locked)return artboard;
    return {...artboard,guides:artboard.guides.map(item=>item.id===guideId?{...item,locked}:item)};
  });
}

export function setAllGuidesLocked(template:DesignTemplate,artboardId:string,locked:boolean):DesignTemplate{
  return updateArtboard(template,artboardId,artboard=>{
    if(!artboard.guides.length||artboard.guides.every(guide=>Boolean(guide.locked)===locked))return artboard;
    return {...artboard,guides:artboard.guides.map(guide=>({...guide,locked}))};
  });
}

export function clearGuides(template:DesignTemplate,artboardId:string,includeLocked=false):DesignTemplate{
  return updateArtboard(template,artboardId,artboard=>{
    if(!artboard.guides.length)return artboard;
    const guides=includeLocked?[]:artboard.guides.filter(guide=>guide.locked);
    return guides.length===artboard.guides.length?artboard:{...artboard,guides};
  });
}
