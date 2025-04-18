import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';

suite('AI Code Detective Extension E2E Test Suite', () => {
    test('Extension should activate', async () => {
        const ext = vscode.extensions.getExtension('ai-code-detective');
        await ext?.activate();
        assert.strictEqual(ext?.isActive, true);
    });

    test('Should analyze AI-generated code', async () => {
        const testFilePath = path.join(__dirname, '../../test-fixtures/ai_generated.py');
        const document = await vscode.workspace.openTextDocument(testFilePath);
        await vscode.window.showTextDocument(document);

        await vscode.commands.executeCommand('ai-code-detective.analyze');
        // allow time for Python call and tree refresh
        await new Promise(r => setTimeout(r, 500));
        const items = await vscode.commands.executeCommand<any[]>('ai-code-detective.getAnalysisResults');
        assert.ok(Array.isArray(items) && items.length > 0, 'Tree should show >0 results');
    });

    test('Should return results via getAnalysisResults', async () => {
        await vscode.commands.executeCommand('ai-code-detective.analyze');
        await new Promise(r => setTimeout(r, 500));
        const items = await vscode.commands.executeCommand<any[]>('ai-code-detective.getAnalysisResults');
        assert.ok(items?.length > 0, 'Expected some tree items');
    });

    test('Toggle AutoScan flips setting', async () => {
        const cfg = vscode.workspace.getConfiguration('aiCodeDetective');
        const before = cfg.get('scanOnSave');
        await vscode.commands.executeCommand('ai-code-detective.toggleAutoScan');
        const after = cfg.get('scanOnSave');
        assert.notStrictEqual(after, before);
    });
});
