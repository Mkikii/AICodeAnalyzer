import * as path from 'path';
import * as cp from 'child_process';

import {
  downloadAndUnzipVSCode,
  resolveCliArgsFromVSCodeExecutablePath,
  runTests
} from '@vscode/test-electron';

async function main() {
  try {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');

    // The path to the extension test runner script
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(__dirname, './suite/index');

    // Download VS Code, unzip it and run the integration test
    const vscodeExecutablePath = await downloadAndUnzipVSCode('stable');
    const [cli, ...args] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);

    // Use cp.spawn / cp.exec for custom setup before tests
    // Run Python tests to make sure they're ready
    console.log('Setting up Python environment before running VS Code tests');
    cp.spawnSync('python', ['-m', 'pytest', '--collect-only'], { cwd: extensionDevelopmentPath, encoding: 'utf-8' });

    await runTests({ vscodeExecutablePath, extensionDevelopmentPath, extensionTestsPath });
  } catch (err) {
    console.error('Failed to run tests:', err);
    process.exit(1);
  }
}

main();