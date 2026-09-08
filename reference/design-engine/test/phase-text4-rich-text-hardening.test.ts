import { describe,it,expect } from 'vitest';
import { applyTextStyleRun, buildRichTextSegments, clearTextStyleRuns, rebaseTextStyleRunsOnEdit, remapTextStyleRunsForTemplate } from '../src/richText.js';

describe('TEXT4 rich text hardening',()=>{
  it('applies formatting to a selected range only',()=>{
    const text='Hello World';
    const runs=applyTextStyleRun(text,[],6,11,{fontWeight:700,color:'#ff0000'},'r1');
    const segments=buildRichTextSegments(text,runs);
    expect(segments.map(s=>s.text)).toEqual(['Hello ','World']);
    expect(segments[1]?.style.fontWeight).toBe(700);
    expect(segments[0]?.style.fontWeight).toBeUndefined();
  });

  it('supports superscript/subscript run metadata',()=>{
    const text='H2O';
    const runs=applyTextStyleRun(text,[],1,2,{baselineShift:'SUBSCRIPT'},'r1');
    expect(buildRichTextSegments(text,runs)[1]?.style.baselineShift).toBe('SUBSCRIPT');
  });

  it('clears only the selected rich style range',()=>{
    const text='ABCDE';
    const runs=applyTextStyleRun(text,[],1,4,{italic:true},'r1');
    const cleared=clearTextStyleRuns(text,runs,2,3);
    expect(cleared).toHaveLength(2);
    expect(cleared[0]).toMatchObject({start:1,end:2});
    expect(cleared[1]).toMatchObject({start:3,end:4});
  });

  it('rebases runs when text is inserted before the run',()=>{
    const runs=[{id:'r',start:6,end:11,style:{fontWeight:700}}];
    const rebased=rebaseTextStyleRunsOnEdit('Hello World','Say Hello World',runs);
    expect(rebased[0]).toMatchObject({start:10,end:15});
  });

  it('remaps a styled dynamic token to its resolved runtime value',()=>{
    const source='Hi {{name}}!';
    const tokenStart=3,tokenEnd=11;
    const runs=[{id:'r',start:tokenStart,end:tokenEnd,style:{color:'#7c3aed'}}];
    const resolved='Hi Akash!';
    const remapped=remapTextStyleRunsForTemplate(source,resolved,runs,path=>path==='name'?'Akash':'');
    expect(remapped[0]).toMatchObject({start:3,end:8});
  });

  it('survives JSON persistence',()=>{
    const value={text:'AB',style:{runs:[{id:'r',start:0,end:1,style:{underline:true}}]}};
    expect(JSON.parse(JSON.stringify(value))).toEqual(value);
  });
});
