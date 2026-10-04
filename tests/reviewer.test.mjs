import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {compile,createProject,parseDelimited,parseProject,MAX_TOTAL} from '../src/core.mjs';
import {exportsFor,projectJSON} from '../src/export.mjs';
import {Session,tableText} from '../src/state.mjs';
import {sample} from '../src/examples.mjs';
import {createDOM} from './dom-stub.mjs';

const clone=structuredClone;
const tableWithIds=()=>({columns:['id','A','B','weight'],rows:Array.from({length:301},(_,i)=>[`row${i}`,'x','y','1'])});
const asCSV=table=>[table.columns,...table.rows].map(row=>row.map(s=>'"'+s.replaceAll('"','""')+'"').join(',')).join('\r\n');

test('review: high-cardinality identifier columns can be staged before roles are assigned',()=>{
  const session=new Session(sample),old=clone(session.result),table=tableWithIds();
  session.changeSource(asCSV(table));session.stage();
  assert.equal(session.sourceDirty,false);assert.equal(session.dirty,true);assert.deepEqual(session.result,old);
  session.edit(p=>p.mapping={stages:[1,2],id:0,weight:3});session.apply();
  assert.equal(session.result.nodes.length,2);assert.equal(session.result.retainedWeight,301);
  assert.equal(session.result.contributions.length,301);assert.equal(session.result.paths.at(-1).itemId,'row300');
  const invalid=new Session(sample);invalid.changeSource(asCSV(table));invalid.stage();assert.throws(()=>invalid.apply(),/300/);
  assert.deepEqual(invalid.result,old);assert.equal(invalid.dirty,true);
});

test('review: public input boundaries reject accessors before evaluation or normalization',()=>{
  let calls=0;const p=clone(sample);Object.defineProperty(p,'missing',{enumerable:true,get(){calls++;return 'sentinel';}});
  assert.throws(()=>compile(p));assert.equal(calls,0);
  for(const kind of ['rows','cell','prototype']){
    const t={columns:['A','B'],rows:[['x','y']]};
    if(kind==='rows')Object.defineProperty(t,'rows',{enumerable:true,get(){calls++;return [['x','y']];}});
    if(kind==='cell')Object.defineProperty(t.rows[0],'0',{enumerable:true,get(){calls++;return 'x';}});
    if(kind==='prototype')Object.setPrototypeOf(t,{custom:true});
    assert.throws(()=>createProject(t),kind);assert.equal(calls,0);
  }
});

test('review: BOM-like first header characters survive source regeneration and staging',()=>{
  for(const prefix of ['\ufeff','\ufeff\ufeff'])for(const format of ['csv','tsv']){
    const p=clone(sample);p.table.columns[0]=prefix+'identifier';
    assert.deepEqual(parseDelimited(tableText(p,format),format==='csv'?',':'\t'),p.table);
    const session=new Session(p);session.setFormat(format);session.revert();session.stage();
    assert.deepEqual(session.draft.table,p.table);
  }
});

test('review: malformed container-heavy JSON is bounded before low-heap exhaustion',()=>{
  const code=`import {parseProject} from './src/core.mjs';const source='['+'{},'.repeat(900000)+'{}]';try{parseProject(source);process.exit(2)}catch(e){if(e.name!=='ValidationError')throw e;console.log(e.message)}`;
  const run=spawnSync(process.execPath,['--max-old-space-size=128','--input-type=module','-e',code],{encoding:'utf8',timeout:8000,maxBuffer:1024*1024});
  assert.equal(run.error,undefined,run.error?.message);assert.equal(run.status,0,run.stderr);assert.match(run.stdout,/limit|exceed|budget|entries|values/i);
});

test('review: maximum table and Unicode fields remain valid after parser resource caps',()=>{
  const p={schema:'pathspool.project.v1',title:'漢'.repeat(120),table:{columns:Array.from({length:8},(_,i)=>String(i)+'漢'.repeat(159)),rows:Array.from({length:5000},()=>[...Array(7).fill('漢'.repeat(160)),'0'.repeat(159)+'1'])},mapping:{stages:[5,4,3,2,1,0],id:6,weight:7},missing:'sentinel'};
  const raw=projectJSON(p);assert.ok(Buffer.byteLength(raw)>16*1024*1024);assert.deepEqual(parseProject(raw),p);
  const r=compile(p);assert.equal(r.nodes.length,6);assert.deepEqual(r.boundaryTotals,Array(5).fill(5000));assert.equal(r.contributions.length,25000);
});

let serial=0;
async function app(){
  const dom=createDOM();globalThis.document=dom.document;globalThis.window=dom.window;dom.window.confirm=()=>true;
  await import(`../src/app.mjs?independent=${serial++}`);
  const get=id=>dom.document.getElementById(id);
  return {...dom,get,async change(id,value,type='change'){const el=get(id);el.value=value;await el.emit(type);},async click(selector){const el=dom.document.querySelector(selector);assert.ok(el,selector);await el.emit('click');await get('app').emit('click',{target:el});}};
}

test('review: actual handlers allow provisional table mapping and keep exports stale until apply',async()=>{
  const a=await app();await a.change('source',asCSV(tableWithIds()),'input');await a.click('#read');
  assert.equal(a.get('mapping').disabled,false);assert.equal(a.get('apply').disabled,false);assert.equal(a.get('retained-weight').textContent,'10');
  assert.equal(a.document.querySelector('[data-export="project"]').disabled,true);
  await a.change('stage-count','2');
  for(const [stage,column]of [[0,1],[1,2]]){const el=a.document.querySelector(`[data-stage="${stage}"]`);el.value=String(column);await el.emit('change');}
  await a.change('id-column','0');await a.change('weight-column','3');await a.click('#apply');
  assert.equal(a.get('retained-weight').textContent,'301');assert.equal(a.get('dirty').hidden,true);assert.equal(a.document.querySelector('[data-export="project"]').disabled,false);
});

test('review: display overrides cannot be applied to a newly staged source using old node IDs',async()=>{
  const a=await app();await a.change('display-text','Same visible name','input');await a.click('#apply-display');
  assert.ok(a.get('flow').textContent.includes('Same visible'));
  await a.change('source','A,B\nnew,other','input');assert.equal(a.get('display-editor').disabled,true);
  await a.click('#read');assert.equal(a.get('display-editor').disabled,true);assert.equal(a.document.querySelector('[data-export="nodes"]').disabled,true);
  await a.click('#apply');assert.equal(a.get('display-editor').disabled,false);assert.equal(a.get('display-text').value,'');assert.ok(!a.get('flow').textContent.includes('Same visible'));
});

// Inverse witness checker: independently parse delivered CSV/JSON, reconstruct
// every edge from source records, then resolve exported IDs/indices back to
// stage + exact label. It does not import the production compiler or its oracle.
const oracle=String.raw`
import sys,json,csv,io,collections,re,html
cases=json.load(sys.stdin)
for case in cases:
 p=case['project']; r=case['actual']; files={f['key']:f['content'] for f in case['files']}; safe={f['key']:f['content'] for f in case['safe']}
 rows=p['table']['rows']; stages=p['mapping']['stages']; ident=p['mapping']['id']; weight=p['mapping']['weight']
 weights=[int(row[weight]) if weight is not None else 1 for row in rows]
 labels=[[row[i] if row[i]!='' else None for i in stages] for row in rows]
 retained=[i for i,x in enumerate(labels) if p['missing']=='sentinel' or None not in x]; excluded=[i for i in range(len(rows)) if i not in retained]
 item=lambda i:None if ident is None else rows[i][ident]
 assert r['inputWeight']==sum(weights) and r['retainedWeight']==sum(weights[i] for i in retained)
 assert r['excludedWeight']==sum(weights[i] for i in excluded)
 assert r['boundaryTotals']==[sum(weights[i] for i in retained)]*(len(stages)-1)
 assert r['inputRows']==len(rows) and r['retainedRows']==len(retained)
 nodes={n['id']:n for n in r['nodes']};assert len(nodes)==len(r['nodes'])
 identities={(s,labels[i][s]) for i in retained for s in range(len(stages))}
 assert {(n['stage'],n['label']) for n in nodes.values()}==identities and len(nodes)==len(identities)
 assert [n['index'] for n in r['nodes']]==list(range(len(nodes)))
 assert [n['stage'] for n in r['nodes']]==sorted(n['stage'] for n in r['nodes'])
 aliases={(x['stage'],x['label']):x['display'] for x in p.get('displayLabels',[])}
 for n in nodes.values():
  assert n['missing']==(n['label'] is None);assert n['displayLabel']==aliases.get((n['stage'],n['label']))
  assert re.fullmatch('[a-z0-9]+',n['id'])
 assert len({re.sub('[^a-z0-9]','',n.lower()) for n in nodes})==len(nodes)
 links={l['id']:l for l in r['links']};assert len(links)==len(r['links'])
 observed={}; expected={}
 for i in retained:
  for s in range(len(stages)-1):expected.setdefault((s,labels[i][s],labels[i][s+1]),[]).append(i+1)
 for l in links.values():
  a,b=nodes[l['source']],nodes[l['target']];assert b['stage']==a['stage']+1==l['boundary']+1
  k=(a['stage'],a['label'],b['label']);assert k not in observed;observed[k]=l['rows'];assert l['value']==sum(weights[i-1] for i in expected[k])
 assert observed==expected
 assert [x['row'] for x in r['paths']]==[i+1 for i in retained]
 for path,i in zip(r['paths'],retained):
  assert path['itemId']==item(i) and path['weight']==weights[i]
  assert [(nodes[n]['stage'],nodes[n]['label']) for n in path['nodeIds']]==list(enumerate(labels[i]))
 assert r['exclusions']==[dict(row=i+1,itemId=item(i),weight=weights[i],missingStages=[s for s,x in enumerate(labels[i]) if x is None]) for i in excluded]
 expected_contrib=collections.Counter((lid,row,item(row-1),weights[row-1]) for lid,l in links.items() for row in l['rows'])
 assert collections.Counter((c['linkId'],c['row'],c['itemId'],c['weight']) for c in r['contributions'])==expected_contrib
 for stage in range(1,len(stages)-1):
  for n in (n for n in nodes.values() if n['stage']==stage):
   assert sum(l['value'] for l in links.values() if l['target']==n['id'])==sum(l['value'] for l in links.values() if l['source']==n['id'])
 parsecsv=lambda text:list(csv.DictReader(io.StringIO(text,newline='')))
 fr=parsecsv(files['flourish']);assert len(fr)==len(links)
 for row in fr:
  l=links[row['Link ID']];a,b=nodes[l['source']],nodes[l['target']]
  assert (row['Source'],row['Target'],int(row['Value']),int(row['Step from']),int(row['Step to']))==(l['source'],l['target'],l['value'],l['boundary']+1,l['boundary']+2)
  assert row['Source label']==(a['label'] or '') and row['Target label']==(b['label'] or '')
  assert row['Source missing']==str(a['missing']).lower() and row['Target missing']==str(b['missing']).lower()
  assert row['Source display label']==(a['displayLabel'] or '') and row['Target display label']==(b['displayLabel'] or '')
 nr=parsecsv(files['nodes']);assert len(nr)==len(nodes)
 for row in nr:
  n=nodes[row['ID']];assert (int(row['Index']),int(row['Stage']),row['Stage name'],row['Label'],row['Display label'])==(n['index'],n['stage']+1,p['table']['columns'][stages[n['stage']]],n['label'] or '',n['displayLabel'] or '')
 cr=parsecsv(files['contributions']);assert collections.Counter((c['Link ID'],int(c['Row']),c['Item ID'] if c['Item ID present']=='true' else None,int(c['Weight'])) for c in cr)==expected_contrib
 fig=json.loads(files['plotly']);tr=fig['data'][0];assert tr['type']=='sankey';assert fig['layout']['meta']['policy']==p['missing']
 assert len(tr['node']['label'])==len(nodes)
 for n,label,raw in zip(r['nodes'],tr['node']['label'],tr['node']['customdata']):
  assert raw==dict(id=n['id'],stage=n['stage']+1,label=n['label'],displayLabel=n['displayLabel'],missing=n['missing'])
  expected_label=n['id']+' · '+(n['displayLabel'] if n['displayLabel'] is not None else ('∅ missing' if n['missing'] else n['label']))
  assert html.unescape(label)==expected_label and '<' not in label and '>' not in label
 for i,l in enumerate(r['links']):
  assert r['nodes'][tr['link']['source'][i]]['id']==l['source'];assert r['nodes'][tr['link']['target'][i]]['id']==l['target'];assert tr['link']['value'][i]==l['value'];assert tr['link']['customdata'][i]['rows']==l['rows']
 assert json.loads(files['project'])==p
 assert json.loads(files['paths'])['paths']==r['paths'];assert json.loads(files['paths'])['nodes']==r['nodes']
 assert json.loads(files['contributions-json'])['contributions']==r['contributions'];assert json.loads(files['exclusions'])['exclusions']==r['exclusions']
 for key in files:
  if key not in ['flourish','nodes','contributions']:assert safe[key]==files[key]
  else:
   a=list(csv.reader(io.StringIO(files[key],newline='')));b=list(csv.reader(io.StringIO(safe[key],newline='')));assert len(a)==len(b)
   for left,right in zip(a,b):
    assert len(left)==len(right)
    for raw,actual in zip(left,right):assert actual==("'"+raw if re.match(r'^[\s\ufeff]*[=+@-]|^[\t\r\n]',raw) else raw)
print(json.dumps({'cases':len(cases),'ok':True}))
`;

test('review: independent inverse source witness validates 64 export kits under both policies',()=>{
  const alphabet=['','A','a','A!',' a ','é','e\u0301','\ufeffA','a,b','line\r\nbreak','<b>','__proto__','same','(missing)','=1+2','\t+cmd'];
  const cases=[];
  for(let code=0;code<64;code++){
    const count=2+code%5,stages=Array.from({length:count},(_,i)=>(i+code)%count).reverse();
    const p={schema:'pathspool.project.v1',title:'Independent export <witness>',table:{columns:Array.from({length:8},(_,i)=>'Field '+i),rows:Array.from({length:1+code%13},(_,i)=>[...Array.from({length:6},(_,j)=>alphabet[(i*7+j*3+code)%alphabet.length]),i%3?'same':'',String((i+code)%8).padStart(4,'0')])},mapping:{stages,id:code%4===0?null:6,weight:7},missing:code%2?'exclude':'sentinel'};
    p.displayLabels=stages.map((column,stage)=>({stage,label:p.table.rows[0][column]||null,display:stage%2?'same override':'<same & override>'}));
    const before=clone(p),actual=compile(p),files=exportsFor(p),safe=exportsFor(p,'spreadsheet');assert.deepEqual(p,before);
    cases.push({project:p,actual,files,safe});
  }
  const run=spawnSync('python3',['-c',oracle],{input:JSON.stringify(cases),encoding:'utf8',timeout:30000,maxBuffer:1024*1024});
  assert.equal(run.status,0,run.stdout+run.stderr);assert.deepEqual(JSON.parse(run.stdout),{cases:64,ok:true});
});

test('review: exact maximum sums and exclusion policy preserve all original numeric evidence',()=>{
  const p={schema:'pathspool.project.v1',title:'Exact maximum',table:{columns:['A','B','C','id','w'],rows:[['a','b','c','dup',String(MAX_TOTAL-9)],['a','','c','dup','0007'],['a','b','c','','0002'],['a','b','c','','0000']]},mapping:{stages:[2,0,1],id:3,weight:4},missing:'exclude'};
  const r=compile(p);assert.equal(r.inputWeight,MAX_TOTAL);assert.equal(r.retainedWeight,MAX_TOTAL-7);assert.equal(r.excludedWeight,7);assert.deepEqual(r.boundaryTotals,[MAX_TOTAL-7,MAX_TOTAL-7]);assert.equal(r.paths.length,3);assert.equal(r.paths.at(-1).weight,0);
  const f=exportsFor(p);assert.equal(JSON.parse(f.find(x=>x.key==='project').content).table.rows[1][4],'0007');
  const figure=JSON.parse(f.find(x=>x.key==='plotly').content);assert.deepEqual(figure.data[0].link.value,[MAX_TOTAL-7,MAX_TOTAL-7]);
  p.table.rows.at(-1)[4]='1';assert.throws(()=>compile(p),/Total input weight/);
});

test('review: inverse export witness rejects corrupt labels, indices, values and row evidence',()=>{
  const project=clone(sample),valid={project,actual:compile(project),files:exportsFor(project),safe:exportsFor(project,'spreadsheet')};
  const run=c=>spawnSync('python3',['-c',oracle],{input:JSON.stringify([c]),encoding:'utf8',timeout:10000,maxBuffer:1024*1024});
  assert.equal(run(valid).status,0);
  const changes=[
    c=>{c.actual.links[0].value++;},
    c=>{c.actual.contributions.pop();},
    c=>{c.files.find(f=>f.key==='flourish').content=c.files.find(f=>f.key==='flourish').content.replace('Newsletter','wrong raw label');},
    c=>{const f=c.files.find(f=>f.key==='plotly'),fig=JSON.parse(f.content);fig.data[0].link.source[0]=fig.data[0].link.target[0];f.content=JSON.stringify(fig);},
    c=>{const f=c.files.find(f=>f.key==='paths'),paths=JSON.parse(f.content);paths.paths[0].nodeIds.reverse();f.content=JSON.stringify(paths);},
  ];
  for(const change of changes){const corrupt=clone(valid);change(corrupt);const r=run(corrupt);assert.equal(r.status,1,r.stdout+r.stderr);assert.match(r.stderr,/AssertionError/);}
});

test('review: failed duplicate-key JSON staging preserves the applied and draft snapshots',()=>{
  const session=new Session(sample);session.edit(p=>p.title='Unapplied title');const draft=clone(session.draft),project=clone(session.project),result=clone(session.result);
  session.setFormat('project');session.changeSource(JSON.stringify(sample).replace('"title":','"\\u0073chema":"duplicate","title":'));
  assert.throws(()=>session.stage(),/duplicate key/);assert.deepEqual(session.draft,draft);assert.deepEqual(session.project,project);assert.deepEqual(session.result,result);assert.equal(session.sourceDirty,true);assert.equal(session.dirty,true);
  session.revert();assert.deepEqual(parseProject(session.source),sample);assert.equal(session.dirty,false);
});
