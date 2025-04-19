import * as vscode from 'vscode';
import { AICodeAnalyzer, AnalysisResult } from './analyzer';
import { ResultsProvider } from './resultsProvider';

const decoType = vscode.window.createTextEditorDecorationType({ backgroundColor: 'rgba(255,200,0,0.2)' });
const diagCol = vscode.languages.createDiagnosticCollection('ai-detective');
const resultCache = new Map<string, AnalysisResult>();

export function activate(context: vscode.ExtensionContext) {
  const analyzer = new AICodeAnalyzer();
  const resultsProvider = new ResultsProvider();

  // status bar
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.text = '$(search) AI Detective';
  statusBar.show();

  // tree view
  vscode.window.registerTreeDataProvider('aiCodeAnalysis', resultsProvider);

  // toggleAutoScan command
  context.subscriptions.push(
    vscode.commands.registerCommand('ai-code-detective.toggleAutoScan', async () => {
      const cfg = vscode.workspace.getConfiguration('aiCodeDetective');
      const current = cfg.get<boolean>('scanOnSave', true);
      await cfg.update('scanOnSave', !current, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(`AI Detect scanOnSave: ${!current}`);
    })
  );

  context.subscriptions.push(diagCol);

  const cfg = vscode.workspace.getConfiguration('aiCodeDetective');
  const probThresh = cfg.get<number>('probabilityThreshold', 0.5);
  const compThresh = cfg.get<number>('complexityThreshold', 10);

  async function analyzeFile(uri: vscode.Uri) {
    const key = uri.toString();
    let res = resultCache.get(key);
    if (!res) {
      res = await analyzer.analyze(uri.fsPath);
      resultCache.set(key, res);
    }
    if (res.ai_probability < probThresh) return;
    if (res.complexity_score.cyclomatic_complexity > compThresh) {
      // optionally warn or decorate
    }

    resultsProvider.setResults(res);
    resultsProvider.refresh();

    const doc = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(doc);
    const diagnostics: vscode.Diagnostic[] = [];

    res.potential_bugs.forEach(b => {
      if (b.line != null) {
        const r = new vscode.Range(b.line - 1, 0, b.line - 1, Number.MAX_VALUE);
        diagnostics.push(new vscode.Diagnostic(r, b.description, vscode.DiagnosticSeverity.Warning));
        editor.setDecorations(decoType, [r]);
      }
    });

    diagCol.set(uri, diagnostics);
  }

  // dry quick‑fix helper
  function makeFixAction(d: vscode.Diagnostic): vscode.CodeAction {
    const fix = new vscode.CodeAction('Replace with ast.literal_eval', vscode.CodeActionKind.QuickFix);
    fix.edit = new vscode.WorkspaceEdit();
    fix.edit.replace(d.rangeUri, d.range, 'ast.literal_eval');
    fix.diagnostics = [d];
    return fix;
  }

  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(['python','javascript'], {
      provideCodeActions(_doc, _range, ctx) {
        return ctx.diagnostics
          .filter(d => d.message.includes('eval'))
          .map(makeFixAction);
      }
    }, { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] })
  );

  // analyze command
  context.subscriptions.push(
    vscode.commands.registerCommand('ai-code-detective.analyze', async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        await analyzeFile(editor.document.uri);
      }
    })
  );

  // expose for E2E
  context.subscriptions.push(
    vscode.commands.registerCommand('ai-code-detective.getAnalysisResults', () =>
      resultsProvider.getAnalysisResults()
    )
  );

  // scanWorkspace command
  context.subscriptions.push(
    vscode.commands.registerCommand('ai-code-detective.scanWorkspace', async () => {
      const uris = await vscode.workspace.findFiles('**/*.{py,js,ts}');
      for (const u of uris) {
        await analyzeFile(u);
      }
      vscode.window.showInformationMessage(`Scanned ${uris.length} files`);
    })
  );

  // new: scan only git-staged files
  context.subscriptions.push(
    vscode.commands.registerCommand('ai-code-detective.scanStaged', async () => {
      const root = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
      const { exec } = require('child_process');
      exec('git diff --name-only --staged', { cwd: root }, async (err: any, stdout: string) => {
        if (err) {
          vscode.window.showErrorMessage(err.message);
          return;
        }
        const files = stdout.split(/\r?\n/).filter(f => /\.(py|js|ts)$/.test(f));
        for (const f of files) {
          const uri = vscode.Uri.file(require('path').join(root, f));
          await analyzeFile(uri);
        }
        vscode.window.showInformationMessage(`Scanned ${files.length} staged files`);
      });
    })
  );

  vscode.window.onDidChangeTextEditorSelection(e => {
    // TODO: scan visible range & highlight AI‐generated spans with decoType
  });

  // watch on save
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.{py,js,ts}');
  watcher.onDidSave(async (uri) => {
    if (vscode.workspace.getConfiguration('aiCodeDetective').get('scanOnSave')) {
      await analyzeFile(uri);
    }
  });

  context.subscriptions.push(statusBar, watcher);
}
