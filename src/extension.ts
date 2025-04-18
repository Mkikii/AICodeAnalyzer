import * as vscode from 'vscode';
import { AICodeAnalyzer } from './analyzer';
import { ResultsProvider } from './resultsProvider';

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

  // diagnostics for quick fixes
  const diagCol = vscode.languages.createDiagnosticCollection('ai-detective');
  context.subscriptions.push(diagCol);

  // analyze command
  const analyzeFile = async (uri: vscode.Uri) => {
    try {
      const res = await analyzer.analyze(uri.fsPath);
      resultsProvider.setResults(res);
      resultsProvider.refresh();

      // apply diagnostics & decorations
      const doc = await vscode.workspace.openTextDocument(uri);
      const diagnostics: vscode.Diagnostic[] = [];
      const editor = await vscode.window.showTextDocument(doc);
      res.potential_bugs.forEach(b => {
        if (b.line != null) {
          const range = new vscode.Range(b.line - 1, 0, b.line - 1, Number.MAX_VALUE);
          diagnostics.push(new vscode.Diagnostic(range, b.description, vscode.DiagnosticSeverity.Warning));
          // inline decoration
          editor.setDecorations(decoType, [range]);
        }
      });
      diagCol.set(uri, diagnostics);
    } catch (e: any) {
      vscode.window.showErrorMessage(`AI Detective failed: ${e.message}`);
    }
  };

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

  // Inline decoration stub
  const decoType = vscode.window.createTextEditorDecorationType({ backgroundColor: 'rgba(255,200,0,0.2)' });
  vscode.window.onDidChangeTextEditorSelection(e => {
    // TODO: scan visible range & highlight AI‐generated spans with decoType
  });

  // Code action provider stub
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(['python','javascript'], {
      provideCodeActions(doc, rng, ctx) {
        return ctx.diagnostics
          .filter(d => d.source === undefined && d.message.includes('eval'))
          .map(d => {
            const fix = new vscode.CodeAction('Replace with ast.literal_eval', vscode.CodeActionKind.QuickFix);
            fix.edit = new vscode.WorkspaceEdit();
            fix.edit.replace(doc.uri, d.range, 'ast.literal_eval');
            fix.diagnostics = [d];
            return fix;
          });
      }
    }, { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] })
  );

  // watch on save
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.{py,js,ts}');
  watcher.onDidSave(async (uri) => {
    if (vscode.workspace.getConfiguration('aiCodeDetective').get('scanOnSave')) {
      await analyzeFile(uri);
    }
  });

  context.subscriptions.push(statusBar, watcher);
}
