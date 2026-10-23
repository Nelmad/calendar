import {existsSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Extractor, ExtractorConfig} from '@microsoft/api-extractor';

// Generated API reference of the published declarations (spec §18). `--write` updates
// docs/api/calendar.api.md; without it the report must already match dist/index.d.ts.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const write = process.argv.includes('--write');
const configPath = resolve(root, 'scripts/docs/api-extractor.json');
if (!existsSync(resolve(root, 'dist/index.d.ts'))) throw new Error('dist/index.d.ts is missing: run npm run build first');
const configObject = ExtractorConfig.loadFile(configPath);
// The comparison copy never lands in the repository.
const temp = mkdtempSync(join(tmpdir(), 'nelmad-calendar-api-'));
configObject.apiReport.reportTempFolder = temp;
const config = ExtractorConfig.prepare({configObject, configObjectFullPath: configPath, packageJsonFullPath: resolve(root, 'package.json')});
try {
    const result = Extractor.invoke(config, {localBuild: write, showVerboseMessages: false});
    const report = relative(root, config.reportFilePath);
    if (!result.succeeded) {
        console.error(result.apiReportChanged
            ? `${report} is out of date with dist/index.d.ts: run npm run build && npm run api:report and review the diff`
            : `API Extractor failed: ${result.errorCount} errors, ${result.warningCount} warnings`);
        process.exitCode = 1;
    } else console.log(`${report}: ${write ? (result.apiReportChanged ? 'updated' : 'unchanged') : 'current'} (API Extractor ${Extractor.version})`);
} finally {
    rmSync(temp, {recursive: true, force: true});
}
