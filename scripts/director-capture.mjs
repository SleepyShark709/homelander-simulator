import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

// Use the installed QA skill's inspector with this project's proven Chrome/Metal
// launcher, rather than downloading a second browser or accepting SwiftShader.
const root = process.env.THREEJS_SKILL_ROOT ?? path.join(os.homedir(), '.codex/skills');
const { readManifestCaptures, inspectPage, summarize } = await import(pathToFileURL(
    path.join(root, 'threejs-qa-release/scripts/inspect-threejs-canvas.mjs')));
const manifestPath = process.argv[2] ?? '.artifacts/director-round/evidence.json';
const captures = readManifestCaptures(JSON.parse(fs.readFileSync(manifestPath, 'utf8')));
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] });
try {
    for (const capture of captures) {
        if (capture.mobile) throw new Error('This project targets desktop keyboard/mouse');
        const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
        try {
            const report = await inspectPage(await context.newPage(), {
                ...capture, url: process.env.GAME_URL ?? 'http://127.0.0.1:4173/?qa=1', wait: 0,
            });
            fs.mkdirSync(path.dirname(capture.reportPath), { recursive: true });
            fs.writeFileSync(capture.reportPath, JSON.stringify(report, null, 2));
            console.log(summarize(report, capture.reportPath));
            if (!report.result?.ok || report.pageErrorCount || report.consoleErrorCount || report.gpu?.softwareRendered)
                process.exitCode = 1;
        } finally { await context.close(); }
    }
} finally { await browser.close(); }
