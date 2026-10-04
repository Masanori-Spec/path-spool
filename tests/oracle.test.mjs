import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compile, validateProject, validateTable, parseProject, parseDelimited, createProject, MAX_TOTAL } from '../src/core.mjs';
import { sample, adversarial } from '../src/examples.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
function runOracle(cases, shouldPass = true) {
  const run = spawnSync('python3', [fileURLToPath(new URL('./path_oracle.py', import.meta.url))], {
    input: JSON.stringify(cases), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(run.error, undefined, run.error?.message);
  assert.equal(run.stderr, '', run.stderr);
  const result = JSON.parse(run.stdout);
  if (shouldPass) {
    const failed = result.filter(item => item.errors.length);
    assert.deepEqual(failed, [], JSON.stringify(failed.slice(0, 5), null, 2));
    assert.equal(run.status, 0);
  } else {
    assert.equal(run.status, 1);
    assert.ok(result.every(item => item.errors.length > 0), 'all intentional corruptions must fail independently');
  }
  return result;
}
function caseFor(project, policy, name) { return { name, project, policy, actual: compile(project, policy) }; }
function fixture(rows = [['A', 'B'], ['A', 'C']], weights = null, ids = null) {
  const stageCount = rows[0].length;
  const columns = Array.from({ length: stageCount }, (_, i) => `Stage ${i}`);
  if (ids !== null) columns.push('Item ID');
  if (weights !== null) columns.push('Weight');
  return {
    schema: 'pathspool.project.v1', title: 'Independent tuple oracle',
    table: { columns, rows: rows.map((row, i) => [...row, ...(ids === null ? [] : [ids[i]]), ...(weights === null ? [] : [weights[i]])]) },
    mapping: { stages: Array.from({ length: stageCount }, (_, i) => i), id: ids === null ? null : stageCount, weight: weights === null ? null : stageCount + Number(ids !== null) },
    missing: 'sentinel',
  };
}
function* words(alphabet, length, prefix = []) {
  if (length === 0) { yield prefix; return; }
  for (const value of alphabet) yield* words(alphabet, length - 1, [...prefix, value]);
}
function random(seed) { let state = seed >>> 0; return n => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) % n; }; }

test('committed synthetic fixtures conserve sentinel 10 and excluded 6 weight with exact provenance', () => {
  assert.equal(compile(sample, 'sentinel').retainedWeight, 10);
  assert.equal(compile(sample, 'exclude').retainedWeight, 6);
  assert.equal(compile(sample, 'exclude').excludedWeight, 4);
  assert.deepEqual(compile(sample, 'sentinel').boundaryTotals, [10, 10]);
  assert.deepEqual(compile(sample, 'exclude').boundaryTotals, [6, 6]);
  runOracle([sample, adversarial].flatMap((project, i) => ['sentinel', 'exclude'].map(policy => caseFor(project, policy, `fixture-${i}-${policy}`))));
});

test('exhaustive one/two-row two/three-stage patterns preserve null/string and stage identities', () => {
  const cases = [];
  for (const rowCount of [1, 2]) for (const stageCount of [2, 3]) {
    for (const flat of words(['', 'A', '(missing)'], rowCount * stageCount)) {
      const rows = Array.from({ length: rowCount }, (_, i) => flat.slice(i * stageCount, (i + 1) * stageCount));
      const project = fixture(rows, Array.from({ length: rowCount }, (_, i) => String(i + 1)), Array(rowCount).fill('duplicate ID'));
      for (const policy of ['sentinel', 'exclude']) cases.push(caseFor(project, policy, `exhaustive-${rowCount}-${stageCount}-${cases.length}`));
    }
  }
  assert.equal(cases.length, 1692);
  runOracle(cases);
});

test('seeded adversarial tables agree with tuple oracle under both missing policies', () => {
  const draw = random(0x5A17C0DE), cases = [];
  const labels = ['', '(missing)', 'A', ' A', 'A ', 'a|b', 'a:b', '[null,"x"]', '0', '=SUM(1,2)', 'x\ny', 'x\ry', '\t', '<script>x</script>', '日本語', 'e\u0301', 'é', '🔌', 'constructor', '__proto__'];
  for (let i = 0; i < 240; i++) {
    const n = 1 + draw(25), stages = 2 + draw(5);
    const rows = Array.from({ length: n }, () => Array.from({ length: stages }, () => labels[draw(labels.length)]));
    const weights = i % 4 ? rows.map(() => String(draw(12)).padStart(1 + draw(6), '0')) : null;
    const ids = i % 3 ? rows.map(() => ['same', '', '=id', 'a,b', 'id\nline'][draw(5)]) : null;
    const project = fixture(rows, weights, ids);
    project.title = `Seed ${i}`;
    for (let j = project.mapping.stages.length - 1; j > 0; j--) { const k = draw(j + 1); [project.mapping.stages[j], project.mapping.stages[k]] = [project.mapping.stages[k], project.mapping.stages[j]]; }
    for (const policy of ['sentinel', 'exclude']) cases.push(caseFor(project, policy, `seed-${i}-${policy}`));
  }
  runOracle(cases);
});

test('zero weights retain row provenance and all-excluded input produces an empty graph', () => {
  const zero = fixture([['A', 'B', 'C'], ['A', 'B', 'D'], ['', 'B', 'D']], ['0', '000', '0']);
  const sentinel = compile(zero);
  assert.ok(sentinel.links.length > 0);
  assert.ok(sentinel.links.every(link => link.value === 0));
  assert.equal(sentinel.paths.length, 3);
  const excluded = fixture([['', 'A', 'B'], ['A', '', 'B'], ['A', 'B', '']], ['1', '2', '3']);
  const empty = compile(excluded, 'exclude');
  assert.deepEqual(empty.nodes, []); assert.deepEqual(empty.links, []); assert.deepEqual(empty.paths, []);
  assert.deepEqual(empty.boundaryTotals, [0, 0]);
  runOracle([caseFor(zero, 'sentinel', 'zero sentinel'), caseFor(zero, 'exclude', 'zero exclude'), caseFor(excluded, 'exclude', 'all excluded')]);
});

test('adjacency alone does not claim full path association; source paths and contributions retain it', () => {
  const left = fixture([['A', 'X', 'C'], ['B', 'X', 'D']]);
  const right = fixture([['A', 'X', 'D'], ['B', 'X', 'C']]);
  const a = compile(left), b = compile(right);
  function edges(compiled) {
    const nodes = new Map(compiled.nodes.map(n => [n.id, [n.stage, n.label]]));
    return compiled.links.map(l => JSON.stringify([nodes.get(l.source), nodes.get(l.target), l.value])).sort();
  }
  assert.deepEqual(edges(a), edges(b));
  function resolvedPaths(compiled) {
    const labels = new Map(compiled.nodes.map(n => [n.id, [n.stage, n.label]]));
    return compiled.paths.map(path => [path.row, path.nodeIds.map(id => labels.get(id))]);
  }
  function resolvedContributions(compiled) {
    const labels = new Map(compiled.nodes.map(n => [n.id, [n.stage, n.label]]));
    const edges = new Map(compiled.links.map(link => [link.id, [labels.get(link.source), labels.get(link.target)]]));
    return compiled.contributions.map(item => JSON.stringify([item.row, edges.get(item.linkId), item.weight])).sort();
  }
  assert.notDeepEqual(resolvedPaths(a), resolvedPaths(b));
  assert.notDeepEqual(resolvedContributions(a), resolvedContributions(b));
  runOracle([caseFor(left, 'sentinel', 'path correlation A'), caseFor(right, 'sentinel', 'path correlation B')]);
});

test('safe-integer maximum and leading-zero weights stay exact throughout aggregation', () => {
  const project = fixture([['A', 'B', 'C'], ['A', 'B', 'C'], ['A', 'D', 'C']], [String(MAX_TOTAL - 10), '0000000007', '3']);
  assert.equal(compile(project).inputWeight, MAX_TOTAL);
  assert.deepEqual(compile(project).boundaryTotals, [MAX_TOTAL, MAX_TOTAL]);
  runOracle(['sentinel', 'exclude'].map(policy => caseFor(project, policy, `max integer ${policy}`)));
});

test('compiler is deterministic and preserves caller input for policy overrides', () => {
  const source = clone(adversarial), before = clone(source);
  for (const policy of ['sentinel', 'exclude']) assert.deepEqual(compile(source, policy), compile(clone(source), policy));
  assert.deepEqual(source, before);
  assert.deepEqual(compile(parseProject(JSON.stringify(source))), compile(source));
});

const invalidCases = [
  ['unknown schema', p => { p.schema = 'pathspool.project.v2'; }],
  ['missing field', p => { delete p.title; }],
  ['unknown project field', p => { p.extra = true; }],
  ['unknown table field', p => { p.table.extra = true; }],
  ['unknown mapping field', p => { p.mapping.extra = true; }],
  ['empty title', p => { p.title = ''; }],
  ['long title', p => { p.title = 'x'.repeat(121); }],
  ['one column', p => { p.table.columns = ['only']; p.table.rows = [['x']]; }],
  ['nine columns', p => { p.table.columns = Array.from({ length: 9 }, (_, i) => `c${i}`); p.table.rows = [Array(9).fill('x')]; }],
  ['duplicate columns', p => { p.table.columns[1] = p.table.columns[0]; }],
  ['empty column name', p => { p.table.columns[0] = ''; }],
  ['long column name', p => { p.table.columns[0] = 'x'.repeat(161); }],
  ['no data rows', p => { p.table.rows = []; }],
  ['5001 data rows', p => { p.table.rows = Array.from({ length: 5001 }, () => [...p.table.rows[0]]); }],
  ['short row', p => { p.table.rows[0].pop(); }],
  ['long row', p => { p.table.rows[0].push('x'); }],
  ['non-string cell', p => { p.table.rows[0][0] = 7; }],
  ['null cell', p => { p.table.rows[0][0] = null; }],
  ['long cell', p => { p.table.rows[0][0] = 'x'.repeat(161); }],
  ['NUL cell', p => { p.table.rows[0][0] = '\u0000'; }],
  ['bidi override cell', p => { p.table.rows[0][0] = '\u202e'; }],
  ['unpaired high surrogate', p => { p.table.rows[0][0] = '\ud800'; }],
  ['unpaired low surrogate', p => { p.table.rows[0][0] = '\udfff'; }],
  ['sparse rows', p => { delete p.table.rows[0]; }],
  ['sparse row values', p => { delete p.table.rows[0][0]; }],
  ['one stage', p => { p.mapping.stages = [0]; }],
  ['too many stages', p => { p.mapping.stages = [0, 1, 2, 3, 4, 5, 6]; }],
  ['repeated stage', p => { p.mapping.stages = [0, 0]; }],
  ['stage-ID role collision', p => { p.mapping.id = 0; }],
  ['stage-weight role collision', p => { p.mapping.weight = 0; }],
  ['ID-weight role collision', p => { p.mapping.id = p.mapping.weight; }],
  ['negative stage index', p => { p.mapping.stages[0] = -1; }],
  ['out-of-range stage index', p => { p.mapping.stages[0] = 9; }],
  ['fractional stage index', p => { p.mapping.stages[0] = 0.5; }],
  ['string stage index', p => { p.mapping.stages[0] = '0'; }],
  ['missing policy', p => { p.missing = 'other'; }],
  ['negative weight', p => { p.table.rows[0][p.mapping.weight] = '-1'; }],
  ['signed weight', p => { p.table.rows[0][p.mapping.weight] = '+1'; }],
  ['decimal weight', p => { p.table.rows[0][p.mapping.weight] = '1.0'; }],
  ['exponent weight', p => { p.table.rows[0][p.mapping.weight] = '1e2'; }],
  ['blank weight', p => { p.table.rows[0][p.mapping.weight] = ''; }],
  ['space-padded weight', p => { p.table.rows[0][p.mapping.weight] = ' 1'; }],
  ['non-ASCII weight', p => { p.table.rows[0][p.mapping.weight] = '１'; }],
  ['unsafe weight', p => { p.table.rows[0][p.mapping.weight] = '9007199254740992'; }],
  ['unsafe total weight', p => { p.table.rows[0][p.mapping.weight] = String(MAX_TOTAL); p.table.rows[1][p.mapping.weight] = '1'; }],
];
for (const [name, mutate] of invalidCases) {
  test(`strict input boundary: rejects ${name}`, () => {
    const project = fixture([['A', 'B'], ['A', 'C']], ['2', '3'], ['id1', 'id2']); mutate(project);
    assert.throws(() => validateProject(project)); assert.throws(() => compile(project));
  });
}

test('maximum row and stage counts and exactly 300 identities are accepted; 301 are rejected', () => {
  const maximumRows = fixture(Array.from({ length: 5000 }, (_, i) => ['A', i % 2 ? 'B' : 'C']));
  const sixStages = fixture([['A', 'B', 'C', 'D', 'E', 'F']], ['1'], ['id']);
  const atCap = fixture(Array.from({ length: 150 }, (_, i) => [`A${i}`, `B${i}`]));
  assert.equal(compile(atCap).nodes.length, 300);
  runOracle([caseFor(maximumRows, 'sentinel', '5000 rows'), caseFor(sixStages, 'sentinel', 'six stages'), caseFor(atCap, 'sentinel', '300 nodes')]);
  atCap.table.rows.push(['extra', 'B0']);
  assert.throws(() => compile(atCap));
  atCap.missing = 'exclude'; assert.throws(() => compile(atCap));
});

test('oracle mutation self-check detects identity, aggregation, path, exclusion, and provenance corruption', () => {
  const mutations = [
    ['wrong retained weight', output => { output.retainedWeight++; }],
    ['wrong stage label', output => { output.stages[0] += 'changed'; }],
    ['wrong node stage', output => { output.nodes[0].stage = 1; }],
    ['null becomes display sentinel', output => { const node = output.nodes.find(n => n.missing); node.label = '(missing)'; node.missing = false; }],
    ['duplicated node', output => { output.nodes.push({ ...output.nodes[0], id: 'duplicate', index: output.nodes.length }); }],
    ['wrong adjacency value', output => { output.links[0].value++; }],
    ['duplicated link', output => { output.links.push({ ...output.links[0], id: 'duplicate' }); }],
    ['duplicated provenance row', output => { output.links[0].rows.push(output.links[0].rows[0]); }],
    ['swapped full path identity', output => { [output.paths[0].nodeIds[0], output.paths[1].nodeIds[0]] = [output.paths[1].nodeIds[0], output.paths[0].nodeIds[0]]; }],
    ['missing retained row', output => { output.paths.pop(); }],
    ['wrong row ID', output => { output.paths[0].itemId = 'wrong'; }],
    ['missing contribution', output => { output.contributions.pop(); }],
    ['duplicated contribution', output => { output.contributions.push(clone(output.contributions[0])); }],
    ['unknown contribution link', output => { output.contributions[0].linkId = 'unknown'; }],
    ['wrong contribution weight', output => { output.contributions[0].weight++; }],
    ['wrong boundary total', output => { output.boundaryTotals[0]++; }],
  ];
  const cases = mutations.map(([name, mutate]) => { const item = caseFor(sample, 'sentinel', name); mutate(item.actual); return item; });
  const excluded = caseFor(sample, 'exclude', 'wrong exclusion stage'); excluded.actual.exclusions[0].missingStages = [0]; cases.push(excluded);
  runOracle(cases, false);
});

function quoteTable(table, delimiter = ',') {
  return [table.columns, ...table.rows].map(row => row.map(cell => '"' + cell.replaceAll('"', '""') + '"').join(delimiter)).join('\r\n') + '\r\n';
}

test('CSV and TSV parsing preserve commas, tabs, escaped quotes, CR/LF, Unicode and exact whitespace', () => {
  const table = {
    columns: ['First, header', 'Second\theader', 'Third "header"'],
    rows: [
      ['comma,value', 'tab\tvalue', 'quote"value'],
      ['line\nfeed', 'carriage\rreturn', 'CRLF\r\nvalue'],
      ['', ' ', '  keep spaces  '],
      ['(missing)', '日本語🔌', 'e\u0301'],
      ['=SUM(1,2)', '\ufeffembedded', 'é'],
    ],
  };
  for (const delimiter of [',', '\t']) {
    assert.deepEqual(parseDelimited(quoteTable(table, delimiter), delimiter), table);
    assert.deepEqual(parseDelimited('\ufeff' + quoteTable(table, delimiter), delimiter), table);
    assert.deepEqual(parseDelimited(quoteTable(table, delimiter).slice(0, -2), delimiter), table);
  }
  const project = createProject(table);
  runOracle(['sentinel', 'exclude'].map(policy => caseFor(project, policy, `escaped CSV ${policy}`)));
});

test('exhaustive delimiter quoting combinations round-trip independently written records', () => {
  const cases = ['', 'A', 'a,b', 'x\ty', '"', '\n', '\r', '  ', '<script>'];
  for (const delimiter of [',', '\t']) for (const left of cases) for (const right of cases) {
    const table = { columns: ['A', 'B'], rows: [[left, right]] };
    assert.deepEqual(parseDelimited(quoteTable(table, delimiter), delimiter), table);
  }
});

const malformedDelimited = [
  ['empty', ''], ['header only', 'A,B'], ['duplicate headers', 'A,A\nx,y'], ['empty header', 'A,\nx,y'],
  ['one column', 'A\nx'], ['short row', 'A,B\nx'], ['long row', 'A,B\nx,y,z'],
  ['unclosed quote', 'A,B\n"x,y'], ['mid-field quote', 'A,B\na"b,c'], ['text after quote', 'A,B\n"x"bad,y'],
  ['space after quote', 'A,B\n"x" ,y'], ['bare CR', 'A,B\rx,y'], ['extra blank record', 'A,B\nx,y\n\n'],
  ['NUL', 'A,B\nx,\u0000'], ['overlong quoted value', 'A,B\n"' + 'x'.repeat(161) + '",y'],
];
for (const [name, source] of malformedDelimited) {
  test(`strict delimited grammar: rejects ${name}`, () => assert.throws(() => parseDelimited(source)));
}

test('JSON duplicate keys, escaped aliases, trailing content, and hostile prototypes are rejected or inert', () => {
  const source = JSON.stringify(sample);
  assert.throws(() => parseProject(source.replace('"title":', '"schema":"duplicate","title":')));
  assert.throws(() => parseProject(source.replace('"title":', '"\\u0073chema":"duplicate","title":')));
  assert.throws(() => parseProject(source + '{}'));
  assert.throws(() => parseProject(source.replace('"title":', '"__proto__":{},"title":')));
  const inert = fixture([['__proto__', 'constructor'], ['toString', 'prototype']]);
  runOracle([caseFor(parseProject(JSON.stringify(inert)), 'sentinel', 'prototype-looking labels')]);
});

test('missing is exclusively the empty string; display tokens and whitespace remain distinct', () => {
  const project = fixture([['', 'A'], ['(missing)', 'A'], [' ', 'A'], ['\t', 'A'], ['null', 'A'], ['undefined', 'A']]);
  const sentinel = compile(project), excluded = compile(project, 'exclude');
  assert.equal(sentinel.nodes.filter(node => node.stage === 0).length, 6);
  assert.equal(excluded.retainedRows, 5); assert.deepEqual(excluded.exclusions.map(row => row.row), [1]);
  runOracle([caseFor(project, 'sentinel', 'exact missing sentinel'), caseFor(project, 'exclude', 'exact missing exclude')]);
});

test('delimiter-like labels cannot collapse tuple identities or create false adjacency', () => {
  const project = fixture([['a|b', 'c'], ['a', 'b|c'], ['a:b', 'c'], ['a', 'b:c'], ['[0,null]', 'null'], ['[0,"null"]', 'null'], ['A', 'A']]);
  const output = compile(project);
  assert.equal(output.links.length, 7);
  runOracle([caseFor(project, 'sentinel', 'tuple delimiter collisions')]);
});

test('source-only ID columns never replace one-based row provenance, even with duplicate or blank IDs', () => {
  const project = fixture([['A', 'B'], ['A', 'B'], ['A', 'B']], ['2', '3', '0'], ['', 'same', 'same']);
  const output = compile(project);
  assert.deepEqual(output.links[0].rows, [1, 2, 3]);
  assert.deepEqual(output.contributions.map(item => [item.row, item.itemId, item.weight]), [[1, '', 2], [2, 'same', 3], [3, 'same', 0]]);
  runOracle([caseFor(project, 'sentinel', 'duplicate item IDs')]);
});

test('input caps count all rows including rows removed by exclusion policy', () => {
  const project = fixture([['', 'A'], ['', 'B']], [String(MAX_TOTAL), '1']);
  project.missing = 'exclude'; assert.throws(() => compile(project));
  const tooManyNodes = fixture(Array.from({ length: 300 }, (_, i) => ['', `node-${i}`]));
  tooManyNodes.missing = 'exclude'; assert.throws(() => compile(tooManyNodes));
});

test('unknown parser delimiters and compile policies fail explicitly', () => {
  for (const delimiter of ['', ';', '|', '\n']) assert.throws(() => parseDelimited('A,B\nx,y', delimiter));
  for (const policy of ['', 'drop', '__proto__', null]) assert.throws(() => compile(sample, policy));
});
