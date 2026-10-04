import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {sample} from '../../src/examples.mjs';
import {compile} from '../../src/core.mjs';
import {exportsFor} from '../../src/export.mjs';

export const PLOTLY_VERSION='3.1.0';
const simple=(title,rows,missing='sentinel')=>({schema:'pathspool.project.v1',title,table:{columns:['Before','After','Weight'],rows},mapping:{stages:[0,1],id:null,weight:2},missing});
export function consumerFixtures(){
  const hostile=simple(`Literal <b>title</b> & text "quoted" 'single'`,[
    ['<img src=x onerror="window.__plotlyInjected=1">','<i>end</i>','2'],
    ['ordinary','<i>end</i>','1']
  ]);
  hostile.displayLabels=[{stage:0,label:hostile.table.rows[0][0],display:'<b>Alias</b> & "text"'},{stage:1,label:'<i>end</i>',display:'<i>End</i>'},{stage:0,label:'ordinary',display:`'single' &quot; &#39;`}];
  return [
    {name:'sample',project:structuredClone(sample)},
    {name:'mixed-zero',project:simple('One visible link, one zero record',[['A','B','3'],['C','D','0']])},
    {name:'all-zero',project:simple('Zero weights remain evidence',[['A','B','0'],['C','D','0']])},
    {name:'all-excluded',project:simple('All rows excluded',[['A','','4'],['','B','2']],'exclude')},
    {name:'hostile-display',project:hostile}
  ];
}

/** Real consumer execution, isolated to synthetic test fixtures and the pinned local npm bundle. */
export async function verifyPlotlyConsumer(context,out){
  const fixtures=consumerFixtures(),results=[];
  const manifest=JSON.parse(await readFile('node_modules/plotly.js-dist-min/package.json','utf8'));
  assert.equal(manifest.version,PLOTLY_VERSION);
  for(const {name,project} of fixtures){
    const expected=compile(project),exported=exportsFor(project).find(file=>file.key==='plotly').content;
    // The first fixture consumes the actual earlier UI download; remaining ones
    // use the identical serialized export boundary and are saved for inspection.
    const raw=name==='sample'?await readFile(`${out}/plotly-figure.json`,'utf8'):exported;
    assert.equal(raw,exported,`Consumer ${name}: exported file drifted`);
    const figure=JSON.parse(raw);
    await writeFile(`${out}/consumer-${name}-figure.json`,raw);
    const page=await context.newPage(),uncaught=[],requests=[],consoleErrors=[];
    page.on('pageerror',error=>uncaught.push(error.message));
    page.on('request',request=>requests.push(request.url()));
    page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
    let entry;
    try{
      await page.setViewportSize({width:1100,height:760});
      await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>PathSpool consumer fixture ${name}</title><style>body{margin:24px;font:14px Arial,sans-serif;color:#213b33;background:#f5f5ee}h1{font-size:18px;margin:0 0 8px}p{margin:0 0 12px}#plot{width:1000px;height:640px;background:white;border:1px solid #d6e1d3}</style></head><body><h1>PathSpool → Plotly ${PLOTLY_VERSION} / ${name}</h1><p>Synthetic exported figure. Evidence includes zero and excluded records separately from visible geometry.</p><div id="plot"></div></body></html>`);
      await page.addScriptTag({path:resolve('node_modules/plotly.js-dist-min/plotly.min.js')});
      const observed=await page.evaluate(async figure=>{
        const validation=window.Plotly.validate(figure.data,figure.layout)??[];
        const plot=document.getElementById('plot');
        await window.Plotly.newPlot(plot,figure.data,figure.layout,{staticPlot:true,responsive:false,displayModeBar:false});
        await document.fonts.ready;
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        const geometry=selector=>[...plot.querySelectorAll(selector)].map(element=>{
          const rect=element.getBoundingClientRect(),style=getComputedStyle(element),d=element.getAttribute('d')??'';
          return {width:rect.width,height:rect.height,visible:rect.width>0&&rect.height>0&&style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)>0,invalidGeometry:/NaN|Infinity/.test(d)};
        });
        return {version:window.Plotly.version,validation,nodeGeometry:geometry('.sankey-node rect'),linkGeometry:geometry('.sankey-link'),text:plot.textContent,labels:[...plot.querySelectorAll('.node-label')].map(el=>el.textContent),injected:window.__plotlyInjected??null,executableSourceElements:plot.querySelectorAll('img,script,foreignObject,[onerror],[onload]').length,storedValues:plot.data?.[0]?.link?.value??[],storedRawLabels:plot.data?.[0]?.node?.customdata??[],storedMeta:plot.layout?.meta??null};
      },figure);
      const positiveLinks=expected.links.filter(link=>link.value>0),positiveNodes=new Set(positiveLinks.flatMap(link=>[link.source,link.target]));
      entry={name,version:observed.version,inputRows:project.table.rows.length,retainedRows:expected.retainedRows,retainedWeight:expected.retainedWeight,excludedWeight:expected.excludedWeight,exportedNodes:expected.nodes.length,exportedLinks:expected.links.length,positiveLinks:positiveLinks.length,schemaAccepted:observed.validation.length===0,validation:observed.validation,visibleNodeRectangles:observed.nodeGeometry.filter(x=>x.visible).length,visibleLinkBands:observed.linkGeometry.filter(x=>x.visible).length,observation:positiveLinks.length?'Positive flows must render; zero-only links may be omitted.':'Zero/empty evidence is not a visible flow; record actual consumer behavior.',observed,uncaught,consoleErrors,requests};
      results.push(entry);
      await page.screenshot({path:`${out}/consumer-${name}.png`,fullPage:true});
      assert.equal(observed.version,PLOTLY_VERSION);
      assert.deepEqual(uncaught,[],`${name}: uncaught consumer errors`);
      assert.deepEqual(requests,[],`${name}: unexpected network request`);
      assert.equal(observed.injected,null,`${name}: source text executed`);
      assert.equal(observed.executableSourceElements,0,`${name}: source markup became executable elements`);
      assert.ok([...observed.nodeGeometry,...observed.linkGeometry].every(x=>!x.invalidGeometry),`${name}: non-finite geometry`);
      assert.deepEqual(observed.storedValues,figure.data[0].link.value,`${name}: consumer lost raw weight evidence`);
      assert.deepEqual(observed.storedRawLabels,figure.data[0].node.customdata,`${name}: consumer lost original labels`);
      assert.deepEqual(observed.storedMeta,figure.layout.meta,`${name}: consumer lost metadata`);
      if(positiveLinks.length){
        assert.deepEqual(observed.validation,[],`${name}: schema validation`);
        assert.equal(entry.visibleLinkBands,positiveLinks.length,`${name}: rendered positive link count`);
        assert.equal(entry.visibleNodeRectangles,positiveNodes.size,`${name}: rendered positive node count`);
      }else{
        assert.equal(entry.visibleLinkBands,0,`${name}: zero/empty input must not create positive bands`);
      }
      if(name==='hostile-display'){
        assert.ok(observed.labels.some(label=>label.includes('<b>Alias</b> & "text"')),JSON.stringify(observed.labels));
        assert.ok(observed.labels.some(label=>label.includes('<i>End</i>')),JSON.stringify(observed.labels));
        assert.ok(observed.text.includes('Literal <b>title</b> & text'));
        assert.ok(observed.labels.some(label=>label.includes("'single' &quot; &#39;")),JSON.stringify(observed.labels));
        assert.ok(observed.text.includes("Literal <b>title</b> & text \"quoted\" 'single'"));
      }
    }catch(error){
      await page.screenshot({path:`${out}/consumer-${name}-failure.png`,fullPage:true}).catch(()=>{});
      await writeFile(`${out}/plotly-consumer-results.json`,JSON.stringify({status:'failed',version:PLOTLY_VERSION,fixtures:results,error:String(error),uncaught,consoleErrors,requests},null,2));
      throw error;
    }finally{
      await page.close();
    }
  }
  await writeFile(`${out}/plotly-consumer-results.json`,JSON.stringify({status:'passed',version:PLOTLY_VERSION,fixtureCount:results.length,scope:'Synthetic exported figures rendered by pinned official Plotly npm bundle. No Flourish account or import. Schema acceptance is recorded separately from visible zero/empty behavior.',fixtures:results},null,2));
}
