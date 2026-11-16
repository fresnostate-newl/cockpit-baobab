#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import esbuild from 'esbuild';
import { sassPlugin } from 'esbuild-sass-plugin';
import { cockpitPoEsbuildPlugin } from './pkg/lib/cockpit-po-plugin.js';
import { cockpitRsyncEsbuildPlugin } from './pkg/lib/cockpit-rsync-plugin.js';

const production = process.env.NODE_ENV === 'production';
const useWasm = process.env.ESBUILD_WASM === '1';

const args = process.argv.slice(2);
const watch = args.includes('--watch') || args.includes('-w');

const outdir = './dist';

function cleanDist() {
    fs.rmSync(outdir, { recursive: true, force: true });
}

function copyStaticPlugin() {
    return {
        name: 'copy-static',
        setup(build) {
            build.onEnd(() => {
                fs.mkdirSync(outdir, { recursive: true });
                fs.copyFileSync('src/index.html', path.join(outdir, 'index.html'));
                fs.copyFileSync('src/manifest.json', path.join(outdir, 'manifest.json'));
            });
        },
    };
}

function writeRuntimeModulesPlugin() {
    return {
        name: 'runtime-npm-modules',
        setup(build) {
            build.onEnd((result) => {
                if (!result.metafile) return;
                const modules = new Set();
                for (const input of Object.keys(result.metafile.inputs)) {
                    const match = input.match(/node_modules\/(@[^/]+\/[^/]+|[^/]+)\//);
                    if (match) modules.add(match[1]);
                }
                const lines = [];
                for (const mod of [...modules].sort()) {
                    try {
                        const pkg = JSON.parse(fs.readFileSync(path.join('node_modules', mod, 'package.json'), 'utf8'));
                        lines.push(`${mod} ${pkg.version}`);
                    } catch {
                        // ignore virtual or sub-packages without package.json
                    }
                }
                fs.writeFileSync('runtime-npm-modules.txt', lines.join('\n') + (lines.length ? '\n' : ''));
            });
        },
    };
}

cleanDist();

const context = await esbuild.context({
    entryPoints: ['src/index.tsx'],
    bundle: true,
    outdir,
    entryNames: 'index',
    format: 'esm',
    target: ['es2020'],
    minify: production,
    sourcemap: !production,
    metafile: true,
    external: ['cockpit', '../base1/cockpit.js'],
    loader: {
        '.woff': 'file',
        '.woff2': 'file',
        '.ttf': 'file',
        '.svg': 'file',
        '.png': 'file',
    },
    plugins: [
        sassPlugin({
            loadPaths: ['node_modules', 'pkg/lib'],
            quietDeps: true,
        }),
        cockpitPoEsbuildPlugin(),
        copyStaticPlugin(),
        writeRuntimeModulesPlugin(),
        ...(watch ? [cockpitRsyncEsbuildPlugin({ source: outdir })] : []),
    ],
});

if (watch) {
    await context.watch();
    console.log('Watching for changes...');
} else {
    const result = await context.rebuild();
    if (result.metafile) {
        fs.writeFileSync('metafile.json', JSON.stringify(result.metafile, null, 2));
    }
    await context.dispose();
}
