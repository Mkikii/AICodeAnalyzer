import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Starting AI Code Detective tests');

  test('Extension should be activated', async () => {
    const ext = vscode.extensions.getExtension('ai-code-detective');
    assert.ok(ext, 'Extension should be available');

    // Wait for activation if not already activated
    if (!ext.isActive) {
      await ext.activate();
    }
    assert.ok(ext.isActive, 'Extension should be activated');
  });

  test('Analyzer command should be registered', () => {
    return vscode.commands.getCommands(true).then(commands => {
      assert.ok(commands.includes('ai-code-detective.analyze'),
        'The analyze command should be registered');
    });
  });

  test('Toggle auto scan command should be registered', () => {
    return vscode.commands.getCommands(true).then(commands => {
      assert.ok(commands.includes('ai-code-detective.toggleAutoScan'),
        'The toggleAutoScan command should be registered');
    });
  });
});