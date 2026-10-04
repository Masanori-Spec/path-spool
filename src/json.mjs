export const MAX_INPUT_BYTES=33_554_432;
// A maximum project has fewer than 47,000 values, 5,000 entries in any array,
// seven fields in any object and 160 UTF-16 units in any string.
export const JSON_BUDGET={values:60_000,arrayEntries:5_000,objectMembers:32,stringUnits:160};
export class ValidationError extends Error {constructor(message){super(message);this.name='ValidationError';}}
const fail=message=>{throw new ValidationError(message);};
/** Strict JSON parser: duplicate object keys (including escaped spellings) are errors. */
export function parseStrictJSON(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_INPUT_BYTES) fail('JSON: file exceeds 33,554,432 bytes');
  let i = 0, values = 0;
  const ws = () => { while (/[\t\n\r ]/.test(text[i] ?? '\uffff')) i++; };
  const str = () => {
    const start = i++;
    while (i < text.length) {
      if(i-start>JSON_BUDGET.stringUnits*6+1)fail('JSON: encoded string exceeds project limit');
      if (text[i] === '\\') { i += 2; continue; }
      if (text[i++] === '"') { let result;try { result=JSON.parse(text.slice(start,i)); } catch { fail(`JSON: invalid string near character ${start + 1}`); }if(result.length>JSON_BUDGET.stringUnits)fail('JSON: string exceeds 160 UTF-16 units');return result; }
    }
    fail('JSON: unterminated string');
  };
  const value = depth => {
    if(++values>JSON_BUDGET.values)fail('JSON: parsed-value budget exceeded');
    if (depth > 20) fail('JSON: nesting exceeds 20 levels');
    ws(); const c = text[i];
    if (c === '"') return str();
    if (c === '{') {
      i++; ws(); const out = Object.create(null); const seen = new Set();
      if (text[i] === '}') { i++; return out; }
      while (true) {
        if(seen.size>=JSON_BUDGET.objectMembers)fail('JSON: object member budget exceeded');
        ws(); if (text[i] !== '"') fail(`JSON: expected a key near character ${i+1}`);
        const k = str(); if (seen.has(k)) fail(`JSON: duplicate key ${k}`); seen.add(k);
        ws(); if (text[i++] !== ':') fail('JSON: expected colon'); out[k] = value(depth+1); ws();
        if (text[i] === '}') { i++; return out; } if (text[i++] !== ',') fail('JSON: expected comma');
      }
    }
    if (c === '[') {
      i++; ws(); const out = []; if (text[i] === ']') { i++; return out; }
      while (true) { if(out.length>=JSON_BUDGET.arrayEntries)fail('JSON: array entry budget exceeded');out.push(value(depth+1)); ws(); if (text[i] === ']') { i++; return out; } if (text[i++] !== ',') fail('JSON: expected comma'); }
    }
    const token = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(i));
    if (!token) fail(`JSON: invalid value near character ${i+1}`);
    if(token[0].length>64)fail('JSON: numeric token exceeds project limit');i += token[0].length; const parsed = JSON.parse(token[0]); if (typeof parsed === 'number' && !Number.isFinite(parsed)) fail('JSON: non-finite number'); return parsed;
  };
  const result = value(0); ws(); if (i !== text.length) fail(`JSON: trailing content near character ${i+1}`); return result;
}
