import {describe,expect,it} from 'vitest';
import type {AssetReference,DesignTemplate,SvgDesignElement} from '@document-tool/contracts';
import {assetRenderKind,createBlankArtboard,fingerprintAssetContent,normalizeSvgSource,prepareAssetImport,replaceElementAsset,sanitizeSvgSource} from '../src/index.js';

const dataUrl=(svg:string)=>`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const baseSvg='<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><path fill="currentColor" d="M0 0h10v10z"/></svg>';

describe('Phase 6.2 SVG asset hardening',()=>{
  it('removes executable elements and event-handler attributes',()=>{
    const sanitized=sanitizeSvgSource('<svg xmlns="http://www.w3.org/2000/svg" onload="bad()"><script>alert(1)</script><path onclick="bad()" d="M0 0"/></svg>');
    expect(sanitized).not.toMatch(/script|onload|onclick/i);
  });

  it('blocks unsafe links and preserves safe internal references',()=>{
    const sanitized=sanitizeSvgSource('<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:bad()"/><image href="https://example.com/a.png"/><use xlink:href="#safe"/></svg>');
    expect(sanitized).not.toContain('javascript:');
    expect(sanitized).not.toContain('https://');
    expect(sanitized).toContain('href="#safe"');
  });

  it('normalizes missing viewBox and resolves intrinsic dimensions and aspect ratio',()=>{
    const normalized=normalizeSvgSource(baseSvg);
    expect(normalized.viewBox).toBe('0 0 200 100');
    expect(normalized.width).toBe(200);
    expect(normalized.height).toBe(100);
    expect(normalized.aspectRatio).toBe(2);
    expect(normalized.source).toContain('preserveAspectRatio="xMidYMid meet"');
  });

  it('detects safe recoloring without flattening multicolor artwork',()=>{
    expect(normalizeSvgSource(baseSvg).recolorable).toBe(true);
    const multi=normalizeSvgSource('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path fill="#f00"/><path fill="#00f"/></svg>');
    expect(multi.recolorable).toBe(false);
    expect(multi.source).toContain('#f00');
    expect(multi.source).toContain('#00f');
  });

  it('creates deterministic fingerprints and detects exact duplicate imports',()=>{
    expect(fingerprintAssetContent('same')).toBe(fingerprintAssetContent('same'));
    const first=prepareAssetImport({id:'asset-1',name:'Icon',fileName:'icon.svg',mimeType:'image/svg+xml',source:dataUrl(baseSvg),sizeBytes:baseSvg.length});
    const duplicate=prepareAssetImport({id:'asset-2',name:'Renamed',fileName:'other.svg',mimeType:'image/svg+xml',source:dataUrl(baseSvg),sizeBytes:baseSvg.length,existing:[first.asset]});
    expect(duplicate.duplicate?.id).toBe('asset-1');
    expect(duplicate.asset.id).toBe('asset-1');
  });

  it('replaces an asset while preserving element geometry and style',()=>{
    const element:SvgDesignElement={id:'svg',type:'SVG',name:'Logo',assetId:'old',position:{xMm:7,yMm:8},size:{widthMm:30,heightMm:20},rotationDeg:12,opacity:.6,visible:true,locked:false,zIndex:4,groupId:'group',preserveVector:true,tintColor:'#123456'};
    const template:DesignTemplate={kind:'CARD_DESIGN',schemaVersion:1,id:'template',name:'Template',version:1,status:'DRAFT',sharedAssets:[],artboards:[{...createBlankArtboard({id:'front',name:'Front',order:0,widthMm:90,heightMm:50}),groups:[{id:'group',name:'Group',elementIds:['svg']}],elements:[element]}]};
    const replaced=replaceElementAsset(template,'front','svg','new').artboards[0]!.elements[0] as SvgDesignElement;
    expect(replaced).toEqual({...element,assetId:'new'});
  });

  it('classifies missing and unsupported assets without throwing',()=>{
    const unsupported:AssetReference={id:'bad',name:'Bad',kind:'OTHER',sourceType:'EMBEDDED',source:'invalid'};
    expect(()=>assetRenderKind(undefined)).not.toThrow();
    expect(assetRenderKind(undefined)).toBe('MISSING');
    expect(assetRenderKind(unsupported)).toBe('UNSUPPORTED');
  });
});
