import * as vscode from 'vscode';
import { AICodeAnalyzer, AnalysisResult } from './analyzer';
import { ResultsProvider } from './resultsProvider';

const decoTypeAI = vscode.window.createTextEditorDecorationType({
  backgroundColor: 'rgba(255,200,0,0.2)',
  after: {
    contentText: ' 🤖',
    color: 'rgba(255,100,0,0.8)'
  }
});

const decoTypeSecurity = vscode.window.createTextEditorDecorationType({
  backgroundColor: 'rgba(255,0,0,0.2)',
  isWholeLine: true,
  overviewRulerColor: new vscode.ThemeColor('errorForeground'),
  overviewRulerLane: vscode.OverviewRulerLane.Right
});

const decoTypeWarning = vscode.window.createTextEditorDecorationType({
  backgroundColor: 'rgba(255,255,0,0.1)',
  isWholeLine: true,
  overviewRulerColor: new vscode.ThemeColor('editorWarning.foreground'),
  overviewRulerLane: vscode.OverviewRulerLane.Right
});

const diagCol = vscode.languages.createDiagnosticCollection('ai-detective');
const resultCache = new Map<string, AnalysisResult>();

export function activate(context: vscode.ExtensionContext) {
  const analyzer = new AICodeAnalyzer();
  const resultsProvider = new ResultsProvider();

  // status bar with icon
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.text = '$(search) AI Detective';
  statusBar.tooltip = 'AI Code Detective: Analyze your code for AI-generated patterns';
  statusBar.command = 'ai-code-detective.analyze';
  statusBar.show();

  // tree view
  vscode.window.registerTreeDataProvider('aiCodeAnalysis', resultsProvider);

  // toggleAutoScan command
  context.subscriptions.push(
    vscode.commands.registerCommand('ai-code-detective.toggleAutoScan', async () => {
      const cfg = vscode.workspace.getConfiguration('aiCodeDetective');
      const current = cfg.get<boolean>('scanOnSave', true);
      await cfg.update('scanOnSave', !current, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(`AI Detect scanOnSave: ${!current ? 'Enabled' : 'Disabled'}`);

      // Update status bar
      updateStatusBar(!current);
    })
  );

  function updateStatusBar(scanOnSave: boolean) {
    if (scanOnSave) {
      statusBar.text = '$(eye) AI Detective';
      statusBar.tooltip = 'AI Code Detective: Auto-scan enabled';
    } else {
      statusBar.text = '$(search) AI Detective';
      statusBar.tooltip = 'AI Code Detective: Click to analyze';
    }
  }

  // Initialize status bar based on current setting
  updateStatusBar(vscode.workspace.getConfiguration('aiCodeDetective').get<boolean>('scanOnSave', true));

  context.subscriptions.push(diagCol);

  const cfg = vscode.workspace.getConfiguration('aiCodeDetective');
  const probThresh = cfg.get<number>('probabilityThreshold', 0.5);
  const compThresh = cfg.get<number>('complexityThreshold', 10);

  // Go to line command (for tree view navigation)
  context.subscriptions.push(
    vscode.commands.registerCommand('ai-code-detective.goToLine', async (filePath: string, line: number) => {
      if (!filePath || line === undefined) {
        return;
      }

      const doc = await vscode.workspace.openTextDocument(filePath);
      const editor = await vscode.window.showTextDocument(doc);

      const linePos = new vscode.Position(line - 1, 0);
      editor.selection = new vscode.Selection(linePos, linePos);
      editor.revealRange(
        new vscode.Range(linePos, linePos),
        vscode.TextEditorRevealType.InCenter
      );
    })
  );

  // New command to fix all issues in a file
  context.subscriptions.push(
    vscode.commands.registerCommand('ai-code-detective.fixAllIssues', async (filePath?: string) => {
      // Check if filePath was provided (e.g., when called from tree view)
      let uri: vscode.Uri | undefined;
      let editor = vscode.window.activeTextEditor;

      if (filePath) {
        // If a file path was provided, open that document
        try {
          const document = await vscode.workspace.openTextDocument(filePath);
          editor = await vscode.window.showTextDocument(document);
          uri = document.uri;
        } catch (err) {
          vscode.window.showErrorMessage(`Failed to open file: ${err}`);
          return;
        }
      } else if (editor) {
        // Use the active editor if available
        uri = editor.document.uri;
      } else {
        // No file path provided and no active editor
        // Try to use the last analyzed file if we have results
        const lastFilePath = resultsProvider.getLastFilePath();
        if (lastFilePath) {
          try {
            const document = await vscode.workspace.openTextDocument(lastFilePath);
            editor = await vscode.window.showTextDocument(document);
            uri = document.uri;
          } catch (err) {
            vscode.window.showErrorMessage(`Failed to open last analyzed file: ${err}`);
            return;
          }
        } else {
          vscode.window.showInformationMessage('No active editor or analyzed file to fix issues in.');
          return;
        }
      }

      if (!uri || !editor) {
        vscode.window.showInformationMessage('No file to fix issues in.');
        return;
      }

      const key = uri.toString();
      const res = resultCache.get(key);

      if (!res || res.potential_bugs.length === 0) {
        vscode.window.showInformationMessage('No issues to fix in this file.');
        return;
      }

      // Show progress indicator
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'AI Code Detective: Fixing issues',
          cancellable: false
        },
        async (progress) => {
          progress.report({ message: 'Analyzing issues...' });

          // Group issues by type for better handling
          const issuesByType = new Map<string, Array<{ bug: any, fix: any }>>();

          // Match bugs with fixes
          res.potential_bugs.forEach(bug => {
            const fixes = res.suggested_fixes.filter(fix => fix.type === bug.type);
            if (fixes.length > 0) {
              if (!issuesByType.has(bug.type)) {
                issuesByType.set(bug.type, []);
              }
              issuesByType.get(bug.type)!.push({ bug, fix: fixes[0] });
            }
          });

          // Create a workspace edit
          const edit = new vscode.WorkspaceEdit();
          const document = editor.document;

          // Process each issue type
          let fixCount = 0;

          progress.report({ message: 'Applying fixes...', increment: 20 });

          // Handle security issues (like eval)
          if (issuesByType.has('security') || issuesByType.has('security_issue')) {
            const securityIssues = issuesByType.get('security') || issuesByType.get('security_issue') || [];

            for (const { bug } of securityIssues) {
              if (bug.line && bug.description.includes('eval')) {
                // Fix eval issues
                const line = document.lineAt(bug.line - 1);
                const lineText = line.text;
                const evalIndex = lineText.indexOf('eval(');

                if (evalIndex >= 0) {
                  const replacement = document.languageId === 'python'
                    ? 'ast.literal_eval('
                    : 'JSON.parse(';

                  // Replace eval with safer alternative
                  edit.replace(
                    document.uri,
                    new vscode.Range(
                      new vscode.Position(bug.line - 1, evalIndex),
                      new vscode.Position(bug.line - 1, evalIndex + 4)
                    ),
                    replacement
                  );

                  // Add required import for Python
                  if (document.languageId === 'python') {
                    // Check if ast is already imported
                    const allText = document.getText();
                    if (!allText.includes('import ast') && !allText.includes('from ast import')) {
                      edit.insert(document.uri, new vscode.Position(0, 0), 'import ast\n');
                    }
                  }

                  fixCount++;
                }
              } else if (bug.line && bug.description.includes('innerHTML')) {
                // Fix innerHTML issues
                const line = document.lineAt(bug.line - 1);
                const lineText = line.text;
                const innerHTMLIndex = lineText.indexOf('innerHTML');

                if (innerHTMLIndex >= 0) {
                  // Replace innerHTML with textContent
                  edit.replace(
                    document.uri,
                    new vscode.Range(
                      new vscode.Position(bug.line - 1, innerHTMLIndex),
                      new vscode.Position(bug.line - 1, innerHTMLIndex + 9)
                    ),
                    'textContent'
                  );

                  fixCount++;
                }
              } else if (bug.line && bug.description.includes('document.write')) {
                // Fix document.write issues
                const line = document.lineAt(bug.line - 1);
                const lineText = line.text;
                const writeIndex = lineText.indexOf('document.write(');

                if (writeIndex >= 0) {
                  // Get the content being written
                  const startParen = lineText.indexOf('(', writeIndex);
                  const endParen = findMatchingClosingParen(lineText, startParen);
                  const content = lineText.substring(startParen + 1, endParen);

                  // Replace with safer alternative
                  edit.replace(
                    document.uri,
                    new vscode.Range(
                      new vscode.Position(bug.line - 1, 0),
                      new vscode.Position(bug.line - 1, line.text.length)
                    ),
                    `document.getElementById('output').textContent = ${content};`
                  );

                  fixCount++;
                }
              }
            }
          }

          // Handle error handling issues
          if (issuesByType.has('error_handling')) {
            const errorHandlingIssues = issuesByType.get('error_handling') || [];

            for (const { bug } of errorHandlingIssues) {
              if (bug.line && bug.description.includes('try/except')) {
                // Add try/except blocks for Python
                if (document.languageId === 'python') {
                  const line = document.lineAt(bug.line - 1);
                  const indentation = line.text.match(/^\s*/)?.[0] || '';

                  // Wrap the line in try/except
                  edit.replace(
                    document.uri,
                    line.range,
                    `${indentation}try:\n${indentation}    ${line.text.trim()}\n${indentation}except Exception as e:\n${indentation}    print(f"Error: {e}")`
                  );

                  fixCount++;
                }
              } else if (bug.line && bug.description.includes('Promise') && bug.description.includes('.catch')) {
                // Add .catch() to Promises in JS/TS
                const line = document.lineAt(bug.line - 1);
                const lineText = line.text;
                const thenIndex = lineText.lastIndexOf('.then(');

                if (thenIndex >= 0) {
                  // Find where the .then() ends
                  let endLine = bug.line - 1;
                  let endChar = line.text.length;
                  let foundEnd = false;
                  let openParens = 1; // Starting with one open paren from .then(

                  // Search for the end of the .then() call
                  for (let i = bug.line - 1; i < document.lineCount && !foundEnd; i++) {
                    const checkLine = document.lineAt(i).text;
                    const startOffset = i === bug.line - 1 ? lineText.indexOf('(', thenIndex) + 1 : 0;

                    for (let j = startOffset; j < checkLine.length; j++) {
                      if (checkLine[j] === '(') {
                        openParens++;
                      } else if (checkLine[j] === ')') {
                        openParens--;
                        if (openParens === 0) {
                          endLine = i;
                          endChar = j + 1;
                          foundEnd = true;
                          break;
                        }
                      }
                    }
                  }

                  if (foundEnd) {
                    // Add .catch() handler
                    edit.insert(
                      document.uri,
                      new vscode.Position(endLine, endChar),
                      '.catch(error => console.error("Error:", error))'
                    );

                    fixCount++;
                  }
                }
              }
            }
          }

          // Handle comparison issues
          if (issuesByType.has('comparison')) {
            const comparisonIssues = issuesByType.get('comparison') || [];

            for (const { bug } of comparisonIssues) {
              if (bug.line && bug.description.includes('==')) {
                // Replace loose equality with strict equality
                const line = document.lineAt(bug.line - 1);
                const lineText = line.text;

                // Replace all instances of == with === (except !==)
                let newText = lineText;
                const eqIndices = [];
                let idx = lineText.indexOf('==');

                while (idx >= 0) {
                  // Make sure it's not already === and not !==
                  if (lineText[idx-1] !== '=' && lineText[idx-1] !== '!') {
                    eqIndices.push(idx);
                  }
                  idx = lineText.indexOf('==', idx + 2);
                }

                // Apply replacements from end to start to avoid position shifts
                for (let i = eqIndices.length - 1; i >= 0; i--) {
                  const idx = eqIndices[i];
                  edit.replace(
                    document.uri,
                    new vscode.Range(
                      new vscode.Position(bug.line - 1, idx),
                      new vscode.Position(bug.line - 1, idx + 2)
                    ),
                    '==='
                  );

                  fixCount++;
                }
              }
            }
          }

          // Handle API misuse issues
          if (issuesByType.has('api_misuse')) {
            const apiMisuseIssues = issuesByType.get('api_misuse') || [];

            for (const { bug } of apiMisuseIssues) {
              if (bug.line && bug.description.includes('open')) {
                // Convert to context manager for Python
                if (document.languageId === 'python') {
                  const line = document.lineAt(bug.line - 1);
                  const lineText = line.text;
                  const openIndex = lineText.indexOf('open(');

                  if (openIndex >= 0) {
                    // Parse the open parameters
                    const startParen = lineText.indexOf('(', openIndex);
                    const endParen = findMatchingClosingParen(lineText, startParen);
                    const params = lineText.substring(startParen + 1, endParen);

                    // Extract variable name
                    const assignmentMatch = lineText.match(/(\w+)\s*=\s*open/);
                    if (assignmentMatch) {
                      const varName = assignmentMatch[1];

                      // Look for where the file is used and closed
                      let fileUseLines = '';
                      let closeLine = -1;

                      for (let i = bug.line; i < document.lineCount; i++) {
                        const checkLine = document.lineAt(i).text;
                        if (checkLine.includes(`${varName}.close()`)) {
                          closeLine = i;
                          break;
                        }
                        if (checkLine.includes(varName) && !checkLine.includes(`${varName} =`)) {
                          fileUseLines += checkLine + '\n';
                        }
                      }

                      // Replace both the open and close lines with context manager
                      if (closeLine >= 0) {
                        const indentation = line.text.match(/^\s*/)?.[0] || '';
                        const newCode = `${indentation}with open(${params}) as ${varName}:\n${indentation}    ${fileUseLines.trim().replace(/\n/g, `\n${indentation}    `)}`;

                        // Replace from the open line to the close line
                        edit.replace(
                          document.uri,
                          new vscode.Range(
                            new vscode.Position(bug.line - 1, 0),
                            new vscode.Position(closeLine + 1, 0)
                          ),
                          newCode
                        );

                        fixCount++;
                      }
                    }
                  }
                }
              }
            }
          }

          // Apply the edits
          progress.report({ message: `Applying ${fixCount} fixes...`, increment: 60 });

          if (fixCount > 0) {
            await vscode.workspace.applyEdit(edit);
            vscode.window.showInformationMessage(`AI Code Detective: Fixed ${fixCount} issues in the file.`);

            // Force document save to trigger re-analysis
            await document.save();
          } else {
            vscode.window.showInformationMessage('AI Code Detective: No fixable issues found.');
          }

          // Final progress update
          progress.report({ message: 'Done!', increment: 20 });
        }
      );
    })
  );

  // Helper function to find matching closing parenthesis
  function findMatchingClosingParen(text: string, openIndex: number): number {
    let parenCount = 1;
    for (let i = openIndex + 1; i < text.length; i++) {
      if (text[i] === '(') {
        parenCount++;
      } else if (text[i] === ')') {
        parenCount--;
        if (parenCount === 0) {
          return i;
        }
      }
    }
    return text.length - 1; // Fallback
  }

  async function analyzeFile(uri: vscode.Uri) {
    const key = uri.toString();
    let res = resultCache.get(key);
    if (!res) {
      try {
        // Show a status message during analysis
        const statusMsg = vscode.window.setStatusBarMessage('$(sync~spin) AI Code Detective: Analyzing...');

        res = await analyzer.analyze(uri.fsPath);
        resultCache.set(key, res);

        // Clear the status message
        statusMsg.dispose();
      } catch (err) {
        vscode.window.showErrorMessage(`AI Code Detective: Analysis failed: ${err}`);
        return;
      }
    }

    // Filter based on threshold
    if (res.ai_probability < probThresh) {
      // Only show info message if user explicitly triggered the analysis
      if (vscode.window.activeTextEditor?.document.uri.toString() === key) {
        vscode.window.setStatusBarMessage(`AI Code Detective: Low AI probability (${res.ai_probability.toFixed(2)})`, 3000);
      }
      return;
    }

    // Update the tree view
    resultsProvider.setResults(res, uri.fsPath);
    resultsProvider.refresh();

    // Apply decorations and diagnostics
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc);
      const diagnostics: vscode.Diagnostic[] = [];

      // Different decoration types for different issues
      const securityDecorations: vscode.DecorationOptions[] = [];
      const warningDecorations: vscode.DecorationOptions[] = [];
      const aiDecorations: vscode.DecorationOptions[] = [];

      // Process each bug
      res.potential_bugs.forEach(b => {
        if (b.line != null) {
          const linePos = new vscode.Position(b.line - 1, 0);
          const lineEndPos = new vscode.Position(b.line - 1, Number.MAX_VALUE);
          const range = new vscode.Range(linePos, lineEndPos);

          // Add diagnostic
          const diag = new vscode.Diagnostic(
            range,
            b.description,
            b.type === 'security_issue'
              ? vscode.DiagnosticSeverity.Error
              : vscode.DiagnosticSeverity.Warning
          );
          diag.source = 'AI Detective';
          diagnostics.push(diag);

          // Add decoration based on type
          const decoration = {
            range,
            hoverMessage: `${b.type}: ${b.description}`
          };

          if (b.type === 'security_issue') {
            securityDecorations.push(decoration);
          } else {
            warningDecorations.push(decoration);
          }
        }
      });

      // Apply decorations
      editor.setDecorations(decoTypeSecurity, securityDecorations);
      editor.setDecorations(decoTypeWarning, warningDecorations);

      // High AI probability decoration for the entire document
      if (res.ai_probability > 0.8) {
        vscode.window.showWarningMessage(
          `AI Code Detective: This file is likely AI-generated (${res.ai_probability.toFixed(2)})`,
          'Show Analysis'
        ).then(selection => {
          if (selection === 'Show Analysis') {
            vscode.commands.executeCommand('ai-code-detective.focusResultsView');
          }
        });
      }

      // Set diagnostics
      diagCol.set(uri, diagnostics);

      // Show the results view if there are issues
      if (diagnostics.length > 0 || res.ai_probability > 0.8) {
        vscode.commands.executeCommand('ai-code-detective.focusResultsView');
      }
    } catch (err) {
      console.error('Error applying decorations:', err);
    }
  }

  // Registry code actions for quick fixes
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      ['python', 'javascript', 'typescript'],
      {
        provideCodeActions(document, range, context) {
          const actions: vscode.CodeAction[] = [];

          context.diagnostics
            .filter(d => d.source === 'AI Detective')
            .forEach(diag => {
              if (diag.message.includes('eval')) {
                // Python fix
                if (document.languageId === 'python') {
                  const pyFix = new vscode.CodeAction(
                    'Replace with ast.literal_eval()',
                    vscode.CodeActionKind.QuickFix
                  );
                  pyFix.edit = new vscode.WorkspaceEdit();

                  // Find the 'eval(' part and replace just that
                  const line = document.lineAt(diag.range.start.line).text;
                  const evalIndex = line.indexOf('eval(');
                  if (evalIndex !== -1) {
                    const replaceRange = new vscode.Range(
                      new vscode.Position(diag.range.start.line, evalIndex),
                      new vscode.Position(diag.range.start.line, evalIndex + 4)
                    );
                    pyFix.edit.replace(document.uri, replaceRange, 'ast.literal_eval(');

                    // Add import if needed
                    const textBeforeCurrentLine = document.getText(
                      new vscode.Range(
                        new vscode.Position(0, 0),
                        new vscode.Position(diag.range.start.line, 0)
                      )
                    );

                    if (!textBeforeCurrentLine.includes('import ast')) {
                      pyFix.edit.insert(
                        document.uri,
                        new vscode.Position(0, 0),
                        'import ast\n'
                      );
                    }
                  }

                  pyFix.diagnostics = [diag];
                  pyFix.isPreferred = true;
                  actions.push(pyFix);
                }
                // JavaScript/TypeScript fix
                else if (['javascript', 'typescript'].includes(document.languageId)) {
                  const jsFix = new vscode.CodeAction(
                    'Replace with JSON.parse()',
                    vscode.CodeActionKind.QuickFix
                  );
                  jsFix.edit = new vscode.WorkspaceEdit();

                  // Find the 'eval(' part and replace just that
                  const line = document.lineAt(diag.range.start.line).text;
                  const evalIndex = line.indexOf('eval(');
                  if (evalIndex !== -1) {
                    const replaceRange = new vscode.Range(
                      new vscode.Position(diag.range.start.line, evalIndex),
                      new vscode.Position(diag.range.start.line, evalIndex + 4)
                    );
                    jsFix.edit.replace(document.uri, replaceRange, 'JSON.parse(');
                  }

                  jsFix.diagnostics = [diag];
                  jsFix.isPreferred = true;
                  actions.push(jsFix);
                }
              } else if (diag.message.includes('try/except')) {
                // Add try-except wrapper fix for Python
                if (document.languageId === 'python') {
                  const tryFix = new vscode.CodeAction(
                    'Add try-except block',
                    vscode.CodeActionKind.QuickFix
                  );
                  tryFix.edit = new vscode.WorkspaceEdit();

                  const line = document.lineAt(diag.range.start.line);
                  const indentation = line.text.match(/^\s*/)?.[0] || '';

                  // Replace the line with a try-except block
                  tryFix.edit.replace(
                    document.uri,
                    line.range,
                    `${indentation}try:\n${indentation}    ${line.text.trim()}\n${indentation}except Exception as e:\n${indentation}    print(f"Error: {e}")`
                  );

                  tryFix.diagnostics = [diag];
                  actions.push(tryFix);
                }
              }
            });

          return actions;
        }
      },
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
    )
  );

  // Focus results view command
  context.subscriptions.push(
    vscode.commands.registerCommand('ai-code-detective.focusResultsView', () => {
      vscode.commands.executeCommand('workbench.view.extension.ai-code-detective');
    })
  );

  // analyze command
  context.subscriptions.push(
    vscode.commands.registerCommand('ai-code-detective.analyze', async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        await analyzeFile(editor.document.uri);
      } else {
        vscode.window.showInformationMessage('No active editor to analyze.');
      }
    })
  );

  // expose for E2E testing
  context.subscriptions.push(
    vscode.commands.registerCommand('ai-code-detective.getAnalysisResults', () =>
      resultsProvider.getAnalysisResults()
    )
  );

  // scanWorkspace command with progress
  context.subscriptions.push(
    vscode.commands.registerCommand('ai-code-detective.scanWorkspace', async () => {
      // Find files with progress indicator
      const files = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'AI Code Detective: Scanning workspace',
          cancellable: true
        },
        async (progress, token) => {
          progress.report({ message: 'Finding files...' });
          const uris = await vscode.workspace.findFiles('**/*.{py,js,ts,jsx,tsx}');

          // Filter out files in node_modules and similar
          const filteredUris = uris.filter(uri => {
            const path = uri.fsPath.toLowerCase();
            return !path.includes('node_modules') &&
                  !path.includes('.git') &&
                  !path.includes('__pycache__') &&
                  !path.includes('dist') &&
                  !path.includes('build');
          });

          progress.report({
            message: `Found ${filteredUris.length} files to analyze`,
            increment: 20
          });

          return filteredUris;
        }
      );

      if (!files.length) {
        vscode.window.showInformationMessage('No suitable files found for analysis.');
        return;
      }

      // Analyze files with progress
      let processedCount = 0;
      let issuesFound = 0;

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'AI Code Detective: Analyzing files',
          cancellable: true
        },
        async (progress, token) => {
          for (const uri of files) {
            if (token.isCancellationRequested) {
              break;
            }

            try {
              const res = await analyzer.analyze(uri.fsPath);
              resultCache.set(uri.toString(), res);

              // Count files with issues
              if (res.ai_probability >= probThresh ||
                  res.potential_bugs.length > 0 ||
                  res.complexity_score.cyclomatic_complexity > compThresh) {
                issuesFound++;
              }

              // Apply diagnostics
              const diagnostics: vscode.Diagnostic[] = [];

              res.potential_bugs.forEach(b => {
                if (b.line != null) {
                  const range = new vscode.Range(
                    new vscode.Position(b.line - 1, 0),
                    new vscode.Position(b.line - 1, Number.MAX_VALUE)
                  );

                  const diag = new vscode.Diagnostic(
                    range,
                    b.description,
                    b.type === 'security_issue'
                      ? vscode.DiagnosticSeverity.Error
                      : vscode.DiagnosticSeverity.Warning
                  );
                  diag.source = 'AI Detective';
                  diagnostics.push(diag);
                }
              });

              if (diagnostics.length > 0) {
                diagCol.set(uri, diagnostics);
              }
            } catch (err) {
              console.error(`Error analyzing ${uri.fsPath}:`, err);
            }

            processedCount++;
            const percent = Math.round((processedCount / files.length) * 100);
            progress.report({
              message: `Analyzed ${processedCount}/${files.length} files (${issuesFound} with issues)`,
              increment: 100 / files.length
            });
          }
        }
      );

      vscode.window.showInformationMessage(
        `AI Detective: Scanned ${processedCount} files, found ${issuesFound} with potential issues`,
        'Show Problems'
      ).then(selection => {
        if (selection === 'Show Problems') {
          vscode.commands.executeCommand('workbench.actions.view.problems');
        }
      });
    })
  );

  // watch on save using workspace event
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (doc) => {
      if (vscode.workspace.getConfiguration('aiCodeDetective').get('scanOnSave')) {
        await analyzeFile(doc.uri);
      }
    })
  );

  // Clear cache when files are deleted
  context.subscriptions.push(
    vscode.workspace.onDidDeleteFiles(e => {
      for (const uri of e.files) {
        resultCache.delete(uri.toString());
      }
    })
  );

  context.subscriptions.push(statusBar);
  context.subscriptions.push(decoTypeAI);
  context.subscriptions.push(decoTypeSecurity);
  context.subscriptions.push(decoTypeWarning);
}
```
