import {compile,createProject,parseDelimited,parseProject,validateProject,MAX_INPUT_BYTES} from './core.mjs';
import {csv} from './export.mjs';
export const tableText=(p,format)=>format==='project'?JSON.stringify(p,null,2):format==='csv'?csv([p.table.columns,...p.table.rows]):[p.table.columns,...p.table.rows].map(row=>row.map(s=>(/["\t\r\n]/.test(s)||s.startsWith('\ufeff'))?'"'+s.replaceAll('"','""')+'"':s).join('\t')).join('\n')+'\n';
export class Session{
  constructor(project){this.generation=0;this.replace(project);}
  replace(project){validateProject(project);this.project=structuredClone(project);this.result=compile(project);this.draft=structuredClone(project);this.format='csv';this.source=tableText(project,'csv');this.dirty=false;this.sourceDirty=false;this.saved=false;this.generation++;}
  changeSource(value){this.source=value;this.sourceDirty=true;this.dirty=true;this.generation++;}
  setFormat(value){if(!['csv','tsv','project'].includes(value))throw new Error('Unknown input format');this.format=value;this.generation++;}
  stage(){const p=this.format==='project'?parseProject(this.source):createProject(parseDelimited(this.source,this.format==='csv'?',':'\t'));this.draft=structuredClone(p);this.sourceDirty=false;this.dirty=true;this.generation++;return p;}
  edit(fn){fn(this.draft);this.dirty=true;this.generation++;}
  apply(){if(this.sourceDirty)throw new Error('Read the edited input before compiling');const next=structuredClone(validateProject(this.draft));const result=compile(next);this.project=next;this.result=result;this.dirty=false;this.saved=false;this.generation++;}
  revert(){this.draft=structuredClone(this.project);this.source=tableText(this.project,this.format);this.dirty=false;this.sourceDirty=false;this.generation++;}
  async readFile(file){const token=++this.generation;if(file.size>MAX_INPUT_BYTES)throw new Error('File exceeds 32 MiB');let buffer;try{buffer=await file.arrayBuffer();}catch(error){if(token!==this.generation)return false;throw error;}if(token!==this.generation)return false;if(buffer.byteLength>MAX_INPUT_BYTES)throw new Error('File exceeds 32 MiB');let value;try{value=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(buffer);}catch{throw new Error('File is not valid UTF-8');}this.changeSource(value);return true;}
}
