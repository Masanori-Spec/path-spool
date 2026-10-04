import {ValidationError,parseStrictJSON,MAX_INPUT_BYTES} from './json.mjs';
export {ValidationError,MAX_INPUT_BYTES};
export const MAX_TOTAL=Number.MAX_SAFE_INTEGER;
const fail=m=>{throw new ValidationError(m);};
const exact=(x,keys,where)=>{if(!x||typeof x!=='object'||Array.isArray(x)||![Object.prototype,null].includes(Object.getPrototypeOf(x))||Reflect.ownKeys(x).length!==keys.length||Object.keys(x).sort().join('|')!==[...keys].sort().join('|'))fail(`${where}: unexpected or missing fields`);for(const k of keys)if(!Object.hasOwn(Object.getOwnPropertyDescriptor(x,k),'value'))fail(`${where}: accessor properties are not accepted`);};
const array=(x,min,max,where)=>{if(!Array.isArray(x)||Object.getPrototypeOf(x)!==Array.prototype||x.length<min||x.length>max)fail(`${where}: expected ${min}–${max} entries`);for(let i=0;i<x.length;i++)if(!Object.hasOwn(x,i))fail(`${where}: sparse arrays are not accepted`);else if(!Object.hasOwn(Object.getOwnPropertyDescriptor(x,String(i)),'value'))fail(`${where}: accessor entries are not accepted`);if(Reflect.ownKeys(x).length!==x.length+1)fail(`${where}: extra array properties are not accepted`);};
export function text(x,where,max=160,empty=true){
  if(typeof x!=='string'||x.length>max||(!empty&&x.length===0))fail(`${where}: expected ${empty?'0':'1'}–${max} characters`);
  if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069\ufffe\uffff]/u.test(x))fail(`${where}: unsupported control character`);
  for(let i=0;i<x.length;i++){const c=x.charCodeAt(i);if(c>=0xd800&&c<=0xdbff){const d=x.charCodeAt(++i);if(!(d>=0xdc00&&d<=0xdfff))fail(`${where}: unpaired surrogate`);}else if(c>=0xdc00&&c<=0xdfff)fail(`${where}: unpaired surrogate`);}
  return x;
}
/** Strict, bounded CSV/TSV; quoted newlines are data, never record boundaries. */
export function parseDelimited(input,delimiter=','){
  if(typeof input!=='string'||new TextEncoder().encode(input).length>MAX_INPUT_BYTES)fail('Input exceeds 32 MiB');
  if(![',','\t'].includes(delimiter))fail('Delimiter must be comma or tab');
  if(input.startsWith('\ufeff'))input=input.slice(1);
  if(input==='')fail('Input is empty');
  const records=[];let row=[],field='',state='start',ended=false;
  const cell=()=>{text(field,`Record ${records.length+1}, column ${row.length+1}`);row.push(field);if(row.length>8)fail('At most 8 columns are supported');field='';state='start';};
  const record=()=>{cell();records.push(row);row=[];if(records.length>5001)fail('At most 5,000 data rows are supported');ended=true;};
  for(let i=0;i<input.length;i++){
    const c=input[i];ended=false;
    if(state==='quoted'){if(c==='"'){if(input[i+1]==='"'){field+='"';i++;}else state='closed';}else field+=c;}
    else if(c===delimiter){cell();}
    else if(c==='\n'||c==='\r'){if(c==='\r'){if(input[i+1]!=='\n')fail('Bare CR outside a quoted field is not accepted');i++;}record();}
    else if(state==='closed')fail('Unexpected character after a closing quote');
    else if(c==='"'){if(state!=='start')fail('Quote inside an unquoted field');state='quoted';}
    else{field+=c;state='plain';}
    if(field.length>160)fail('A field exceeds 160 characters');
  }
  if(state==='quoted')fail('Unclosed quoted field');
  if(!ended)record();
  const [columns,...rows]=records;validateTable({columns,rows});return {columns,rows};
}
export function validateTable(table){
  exact(table,['columns','rows'],'Table');array(table.columns,2,8,'Columns');
  table.columns.forEach((s,i)=>text(s,`Column ${i+1}`,160,false));
  if(new Set(table.columns).size!==table.columns.length)fail('Column names must be distinct (exact text)');
  array(table.rows,1,5000,'Rows');table.rows.forEach((row,i)=>{array(row,table.columns.length,table.columns.length,`Row ${i+1}`);row.forEach((v,j)=>text(v,`Row ${i+1}, column ${j+1}`));});return table;
}
export function validateProject(p){
  exact(p,['schema','title','table','mapping','missing',...(p&&Object.hasOwn(p,'displayLabels')?['displayLabels']:[])],'Project');if(p.schema!=='pathspool.project.v1')fail('Unsupported project schema');text(p.title,'Title',120,false);validateTable(p.table);
  exact(p.mapping,['stages','id','weight'],'Mapping');array(p.mapping.stages,2,6,'Stages');
  const indices=[...p.mapping.stages,...[p.mapping.id,p.mapping.weight].filter(x=>x!==null)];
  if(indices.some(i=>!Number.isInteger(i)||Object.is(i,-0)||i<0||i>=p.table.columns.length))fail('Mapping contains an invalid column index');
  if(new Set(indices).size!==indices.length)fail('Each mapped column must have one role');
  if(!['sentinel','exclude'].includes(p.missing))fail('Unknown missing-value policy');
  let total=0n;const identities=new Set();
  p.table.rows.forEach((row,i)=>{
    const raw=p.mapping.weight===null?'1':row[p.mapping.weight];if(!/^[0-9]+$/.test(raw))fail(`Row ${i+1}: weight must contain only decimal digits (zero is allowed)`);
    const w=BigInt(raw);total+=w;if(total>BigInt(MAX_TOTAL))fail(`Total input weight exceeds ${MAX_TOTAL}`);
    p.mapping.stages.forEach((column,stage)=>identities.add(JSON.stringify([stage,row[column]===''?null:row[column]])));
  });
  if(identities.size>300)fail('At most 300 stage-specific nodes are supported (including missing nodes)');
  if(Object.hasOwn(p,'displayLabels')){array(p.displayLabels,0,300,'Display labels');const seen=new Set();for(const entry of p.displayLabels){exact(entry,['stage','label','display'],'Display label');if(!Number.isInteger(entry.stage)||Object.is(entry.stage,-0)||entry.stage<0||entry.stage>=p.mapping.stages.length)fail('Display label: invalid stage');if(entry.label!==null)text(entry.label,'Display label source',160,false);text(entry.display,'Display label text',160,false);const key=JSON.stringify([entry.stage,entry.label]);if(!identities.has(key))fail('Display label: source identity is absent');if(seen.has(key))fail('Display label: duplicate source identity');seen.add(key);}}
  return p;
}
export function parseProject(input){return structuredClone(validateProject(parseStrictJSON(typeof input==='string'&&input.startsWith('\ufeff')?input.slice(1):input)));}
/** Stage a valid table with provisional roles; compile-level limits wait for the user's mapping. */
export function createProject(table){validateTable(table);return {schema:'pathspool.project.v1',title:'Untitled paths',table:structuredClone(table),mapping:{stages:Array.from({length:Math.min(6,table.columns.length)},(_,i)=>i),id:null,weight:null},missing:'sentinel'};}
/** Tuple identity uses stage and null/string, never display-label concatenation. */
export function compile(input,policy){
  const p=validateProject(input);if(policy===undefined)policy=p.missing;if(!['sentinel','exclude'].includes(policy))fail('Unknown missing-value policy');
  const stageMaps=p.mapping.stages.map(()=>new Map()),paths=[],exclusions=[];let inputWeight=0,retainedWeight=0;
  for(const [i,row] of p.table.rows.entries()){
    const weight=Number(BigInt(p.mapping.weight===null?'1':row[p.mapping.weight])),itemId=p.mapping.id===null?null:row[p.mapping.id];inputWeight+=weight;
    const labels=p.mapping.stages.map(c=>row[c]===''?null:row[c]),missingStages=labels.flatMap((v,s)=>v===null?[s]:[]);
    if(policy==='exclude'&&missingStages.length){exclusions.push({row:i+1,itemId,weight,missingStages});continue;}
    retainedWeight+=weight;
    const nodeIds=labels.map((label,stage)=>{const map=stageMaps[stage];if(!map.has(label))map.set(label,{id:`s${stage+1}n${map.size+1}`,stage,label,missing:label===null});return map.get(label).id;});
    paths.push({row:i+1,itemId,weight,nodeIds});
  }
  const aliases=new Map((p.displayLabels??[]).map(x=>[JSON.stringify([x.stage,x.label]),x.display]));
  const nodes=stageMaps.flatMap(m=>[...m.values()]).map((n,index)=>({...n,index,displayLabel:aliases.get(JSON.stringify([n.stage,n.label]))??null})),nodeIndex=new Map(nodes.map(n=>[n.id,n.index])),linkMap=new Map();
  for(const path of paths)for(let boundary=0;boundary<path.nodeIds.length-1;boundary++){
    const source=path.nodeIds[boundary],target=path.nodeIds[boundary+1],key=JSON.stringify([source,target]);
    if(!linkMap.has(key))linkMap.set(key,{source,target,boundary,value:0,rows:[]});
    const link=linkMap.get(key);link.value+=path.weight;link.rows.push(path.row);
  }
  const links=[...linkMap.values()].sort((a,b)=>a.boundary-b.boundary||nodeIndex.get(a.source)-nodeIndex.get(b.source)||nodeIndex.get(a.target)-nodeIndex.get(b.target)).map((l,i)=>({id:`l${i+1}`,...l}));
  const byRow=new Map(paths.map(p=>[p.row,p]));
  const contributions=links.flatMap(l=>l.rows.map(row=>({linkId:l.id,row,itemId:byRow.get(row).itemId,weight:byRow.get(row).weight})));
  const boundaryTotals=p.mapping.stages.slice(1).map((_,i)=>links.filter(l=>l.boundary===i).reduce((s,l)=>s+l.value,0));
  return {schema:'pathspool.compiled.v1',title:p.title,policy,stages:p.mapping.stages.map(c=>p.table.columns[c]),inputRows:p.table.rows.length,inputWeight,retainedRows:paths.length,retainedWeight,excludedWeight:inputWeight-retainedWeight,nodes,links,paths,exclusions,contributions,boundaryTotals};
}
