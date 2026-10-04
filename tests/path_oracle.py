"""Independent PathSpool oracle using Python tuples and arbitrary-precision ints.

Input: [{name, project, policy, actual}]. This module never imports production
code. JS graph identifiers are resolved back to (stage_index, null_or_text).
Every path, link, exclusion and contribution is compared with source-row facts.
"""
from collections import Counter, defaultdict
import json
import sys


def reference(project, policy):
    stages = project['mapping']['stages']
    id_column = project['mapping']['id']
    weight_column = project['mapping']['weight']
    paths, excluded = [], []
    nodes = set()
    edges = defaultdict(lambda: {'value': 0, 'rows': []})
    contributions = Counter()
    input_weight = 0
    retained_weight = 0
    for row_number, row in enumerate(project['table']['rows'], 1):
        weight = 1 if weight_column is None else int(row[weight_column], 10)
        item_id = None if id_column is None else row[id_column]
        labels = [None if row[index] == '' else row[index] for index in stages]
        missing = [index for index, label in enumerate(labels) if label is None]
        input_weight += weight
        if policy == 'exclude' and missing:
            excluded.append((row_number, item_id, weight, tuple(missing)))
            continue
        retained_weight += weight
        identities = tuple((stage, label) for stage, label in enumerate(labels))
        nodes.update(identities)
        paths.append((row_number, item_id, weight, identities))
        for boundary in range(len(stages) - 1):
            edge = (boundary, identities[boundary], identities[boundary + 1])
            edges[edge]['value'] += weight
            edges[edge]['rows'].append(row_number)
            contributions[(edge, row_number, item_id, weight)] += 1
    return {
        'nodes': nodes, 'paths': paths, 'excluded': excluded, 'edges': dict(edges),
        'contributions': contributions, 'inputWeight': input_weight,
        'retainedWeight': retained_weight,
    }


def verify(case):
    errors = []
    def require(condition, message):
        if not condition:
            errors.append(message)
    project, policy, actual = case['project'], case['policy'], case['actual']
    expected = reference(project, policy)
    stages = project['mapping']['stages']
    require(actual.get('schema') == 'pathspool.compiled.v1', 'wrong compiled schema')
    require(actual.get('title') == project['title'], 'title changed')
    require(actual.get('policy') == policy, 'policy changed')
    require(actual.get('stages') == [project['table']['columns'][index] for index in stages], 'stage order or labels changed')
    scalars = {
        'inputRows': len(project['table']['rows']),
        'inputWeight': expected['inputWeight'], 'retainedRows': len(expected['paths']),
        'retainedWeight': expected['retainedWeight'],
        'excludedWeight': expected['inputWeight'] - expected['retainedWeight'],
    }
    for key, value in scalars.items():
        require(type(actual.get(key)) is int and actual[key] == value, f'{key}: expected exact integer {value}, got {actual.get(key)!r}')
    node_lookup = {}
    identities = []
    for index, node in enumerate(actual['nodes']):
        identifier = node.get('id')
        require(isinstance(identifier, str) and bool(identifier) and identifier not in node_lookup, 'duplicate/invalid node ID')
        stage, label = node.get('stage'), node.get('label')
        require(type(stage) is int and 0 <= stage < len(stages), 'invalid node stage')
        require(label is None or isinstance(label, str), 'invalid node label type')
        require(node.get('missing') is (label is None), 'missing flag does not match null identity')
        require(node.get('index') == index, 'node index does not match array order')
        identity = (stage, label)
        identities.append(identity)
        node_lookup[identifier] = identity
    require(len(identities) == len(set(identities)), 'distinct nodes share one structured identity')
    require(set(identities) == expected['nodes'], 'stage-specific null/string node identities differ')
    actual_paths = []
    for path in actual['paths']:
        require(all(identifier in node_lookup for identifier in path['nodeIds']), 'path has an unknown node ID')
        resolved = tuple(node_lookup.get(identifier) for identifier in path['nodeIds'])
        actual_paths.append((path['row'], path['itemId'], path['weight'], resolved))
    require(actual_paths == expected['paths'], 'full source-row paths or item IDs/weights changed')
    actual_excluded = [(entry['row'], entry['itemId'], entry['weight'], tuple(entry['missingStages'])) for entry in actual['exclusions']]
    require(actual_excluded == expected['excluded'], 'exclusion rows, weights, IDs or missing stages differ')
    link_lookup, observed_edges = {}, {}
    for link in actual['links']:
        identifier = link.get('id')
        require(isinstance(identifier, str) and bool(identifier) and identifier not in link_lookup, 'duplicate/invalid link ID')
        require(link['source'] in node_lookup and link['target'] in node_lookup, 'link references unknown node')
        source, target = node_lookup.get(link['source']), node_lookup.get(link['target'])
        edge = (link['boundary'], source, target)
        link_lookup[identifier] = edge
        require(edge not in observed_edges, 'parallel duplicate links should have been aggregated')
        require(source is not None and target is not None and source[0] == link['boundary'] and target[0] == link['boundary'] + 1, 'edge is not between adjacent stages')
        require(type(link['value']) is int and link['value'] >= 0, 'non-exact or negative link weight')
        require(len(link['rows']) == len(set(link['rows'])), 'source row counted twice on a link')
        observed_edges[edge] = {'value': link['value'], 'rows': link['rows']}
    require(observed_edges == expected['edges'], 'adjacency values or exact row provenance differ')
    contributions = Counter()
    row_boundary_counts = Counter()
    for contribution in actual['contributions']:
        identifier = contribution['linkId']
        require(identifier in link_lookup, 'contribution references unknown link')
        edge = link_lookup.get(identifier)
        contributions[(edge, contribution['row'], contribution['itemId'], contribution['weight'])] += 1
        if edge is not None:
            row_boundary_counts[(contribution['row'], edge[0])] += 1
    require(contributions == expected['contributions'], 'per-link per-row contributions differ')
    desired_counts = Counter((path[0], boundary) for path in expected['paths'] for boundary in range(len(stages) - 1))
    require(row_boundary_counts == desired_counts, 'a retained row must contribute exactly once per boundary')
    desired_totals = [expected['retainedWeight']] * (len(stages) - 1)
    require(actual['boundaryTotals'] == desired_totals, 'boundary totals do not conserve retained weight')
    for boundary in range(len(stages) - 1):
        total = sum(link['value'] for link in actual['links'] if link['boundary'] == boundary)
        require(total == expected['retainedWeight'], f'boundary {boundary} has nonconserved links')
    return {'name': case.get('name'), 'rows': len(project['table']['rows']), 'paths': len(expected['paths']), 'errors': errors}


if __name__ == '__main__':
    cases = json.load(sys.stdin)
    results = []
    for case in cases:
        try:
            results.append(verify(case))
        except (KeyError, TypeError, ValueError, IndexError) as error:
            results.append({'name': case.get('name'), 'errors': [f'malformed compiled output: {type(error).__name__}: {error}']})
    json.dump(results, sys.stdout, ensure_ascii=True)
    sys.stdout.write('\n')
    sys.exit(1 if any(result['errors'] for result in results) else 0)
