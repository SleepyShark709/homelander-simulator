import { expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../src/', import.meta.url));
const files = readdirSync(root, { recursive: true }).map(String)
    .filter(file => file.endsWith('.ts')).map(file => resolve(root, file));
const graph = new Map(files.map(file => {
    const source = readFileSync(file, 'utf8');
    // Static imports and re-exports; explicit type-only dependencies are erased
    // by the compiler and do not participate in module initialization cycles.
    const edges = [...source.matchAll(/^(?:import|export)\s+(?!type\b)([^;]+?)\s+from\s+['"]([^'"]+)['"]/gm)]
        .filter(([, clause, spec]) => spec.startsWith('.') && !(
            clause.trim().startsWith('{') && clause.replace(/[{}]/g, '').split(',')
                .filter(s => s.trim()).every(s => s.trim().startsWith('type '))))
        .map(([, , spec]) => resolve(dirname(file), `${spec}.ts`));
    return [file, edges] as const;
}));

it('foundation and character modules do not depend on application or world implementations', () => {
    for (const [file, edges] of graph) {
        for (const dependency of edges) {
            expect(graph.has(dependency), `Missing local module: ${dependency}`).toBe(true);
            if (file.startsWith(resolve(root, 'core') + '/'))
                expect(dependency.startsWith(resolve(root, 'core') + '/'), `${file} → ${dependency}`).toBe(true);
            if (file.startsWith(resolve(root, 'characters') + '/'))
                expect(['core', 'characters'].some(folder => dependency.startsWith(resolve(root, folder) + '/')), `${file} → ${dependency}`).toBe(true);
        }
    }
});

it('runtime imports remain free of initialization cycles', () => {
    const complete = new Set<string>();
    const visit = (file: string, path: string[]) => {
        expect(path.includes(file), `Runtime import cycle: ${[...path, file].join(' → ')}`).toBe(false);
        if (complete.has(file)) return;
        for (const dependency of graph.get(file) ?? []) visit(dependency, [...path, file]);
        complete.add(file);
    };
    for (const file of files) visit(file, []);
});
