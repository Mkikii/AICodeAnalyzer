import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface AnalysisResult {
  ai_probability: number;
  potential_bugs: { type: string; description: string; line?: number }[];
  complexity_score: { cyclomatic_complexity: number; cognitive_complexity: number };
  suggested_fixes: { type: string; fix: string }[];
}

export class AICodeAnalyzer {
  private cache = new Map<string, AnalysisResult>();

  async analyze(filePath: string): Promise<AnalysisResult> {
    if (this.cache.has(filePath)) {
      return this.cache.get(filePath)!;
    }
    const res = await new Promise<AnalysisResult>((resolve, reject) => {
      cp.execFile(
        'python',
        ['-m', 'ai_toolkit.code_analyzer', filePath],
        { timeout: 30_000 },
        (err, stdout, stderr) => {
          // Handle PyTorch import error gracefully
          if (err && stderr && (stderr.includes('torch._C') || stderr.includes('DLL load failed'))) {
            console.warn('PyTorch error detected, using fallback analysis');

            // Perform more advanced fallback analysis
            const fallbackResult = this.performFallbackAnalysis(filePath);
            resolve(fallbackResult);
            return;
          }

          if (err) return reject(err);

          try {
            const obj = JSON.parse(stdout) as AnalysisResult;
            resolve(obj);
          } catch (e) {
            reject(new Error(`Invalid JSON: ${e}`));
          }
        }
      );
    });
    this.cache.set(filePath, res);
    return res;
  }

  // New method for enhanced fallback analysis
  private performFallbackAnalysis(filePath: string): AnalysisResult {
    const fallbackResult: AnalysisResult = {
      ai_probability: 0.5, // Start with neutral probability
      potential_bugs: [],
      complexity_score: { cyclomatic_complexity: 5, cognitive_complexity: 5 },
      suggested_fixes: []
    };

    try {
      // Read the file
      const content = fs.readFileSync(filePath, 'utf8');
      const fileExt = path.extname(filePath).toLowerCase();
      const lines = content.split('\n');

      // Enhanced AI detection patterns
      const aiPatterns = {
        'eval(': { weight: 0.2, type: 'security', msg: 'Potentially unsafe use of eval() detected' },
        'document.write(': { weight: 0.15, type: 'security', msg: 'Potentially unsafe use of document.write() detected' },
        'innerHTML =': { weight: 0.15, type: 'security', msg: 'Potentially unsafe use of innerHTML detected' },
        'setTimeout(\'': { weight: 0.15, type: 'security', msg: 'Using strings with setTimeout is a security risk' },
        'setTimeout("': { weight: 0.15, type: 'security', msg: 'Using strings with setTimeout is a security risk' },
        '.then(': { weight: 0.05, type: 'error_handling', msg: 'Promise without proper error handling' },
        'function(': { weight: 0.05, type: 'structure', msg: 'Consider using arrow functions instead' },
        'try {': { weight: -0.05, type: 'positive', msg: 'Good practice: Using try/catch blocks' },
        'catch(': { weight: -0.05, type: 'positive', msg: 'Good practice: Error handling detected' },
        '//': { weight: 0.01, type: 'structure', msg: 'Comment detected' },
        '/* ': { weight: 0.01, type: 'structure', msg: 'Block comment detected' },
        'temp': { weight: 0.1, type: 'naming', msg: 'Generic variable name detected' },
        'result': { weight: 0.05, type: 'naming', msg: 'Generic variable name detected' },
        'data': { weight: 0.05, type: 'naming', msg: 'Generic variable name detected' },
        'TODO': { weight: 0.1, type: 'comment', msg: 'TODO comment detected' },
        'FIXME': { weight: 0.1, type: 'comment', msg: 'FIXME comment detected' },
        '"""': { weight: 0.1, type: 'docstring', msg: 'Docstring pattern detected' },
        'This function': { weight: 0.15, type: 'docstring', msg: 'Generic function description' },
        'import numpy': { weight: 0.15, type: 'imports', msg: 'Common data science import' },
        'import pandas': { weight: 0.15, type: 'imports', msg: 'Common data science import' },
      };

      // Detect AI patterns
      for (const [pattern, details] of Object.entries(aiPatterns)) {
        if (content.includes(pattern)) {
          fallbackResult.ai_probability += details.weight;

          // For security and error handling issues, add them to potential bugs
          if (details.type === 'security' || details.type === 'error_handling') {
            // Find the line number
            const lineIndex = content.split('\n').findIndex(line => line.includes(pattern));
            if (lineIndex >= 0) {
              fallbackResult.potential_bugs.push({
                type: details.type,
                description: details.msg,
                line: lineIndex + 1
              });

              // Add suggested fixes based on pattern
              if (pattern === 'eval(') {
                fallbackResult.suggested_fixes.push({
                  type: details.type,
                  fix: fileExt === '.py'
                    ? 'Replace eval() with ast.literal_eval()'
                    : 'Replace eval() with JSON.parse() for parsing JSON or safer alternatives'
                });
              } else if (pattern === 'document.write(') {
                fallbackResult.suggested_fixes.push({
                  type: details.type,
                  fix: 'Replace document.write() with safer DOM manipulation methods'
                });
              } else if (pattern === 'innerHTML =') {
                fallbackResult.suggested_fixes.push({
                  type: details.type,
                  fix: 'Use textContent or DOM methods instead of innerHTML to prevent XSS'
                });
              } else if (pattern === '.then(' && !content.includes('.catch(')) {
                fallbackResult.suggested_fixes.push({
                  type: details.type,
                  fix: 'Add .catch() handler to properly handle Promise rejections'
                });
              }
            }
          }
        }
      }

      // Check for repetitive code patterns
      const linePatterns = new Map<string, number>();
      lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed.length > 10) { // Only consider non-trivial lines
          linePatterns.set(trimmed, (linePatterns.get(trimmed) || 0) + 1);
        }
      });

      // Count repetitive patterns
      let repetitiveLines = 0;
      linePatterns.forEach((count, line) => {
        if (count > 1) {
          repetitiveLines += count;
        }
      });

      // If more than 10% of code is repetitive, increase AI probability
      if (repetitiveLines / lines.length > 0.1) {
        fallbackResult.ai_probability += 0.2;
      }

      // Apply custom logic based on file type
      if (fileExt === '.py') {
        this.analyzePythonSpecific(content, fallbackResult);
      } else if (['.js', '.ts', '.jsx', '.tsx'].includes(fileExt)) {
        this.analyzeJavaScriptSpecific(content, fallbackResult);
      }

      // Cap probability between 0.05 and 0.95
      fallbackResult.ai_probability = Math.max(0.05, Math.min(0.95, fallbackResult.ai_probability));

      // Calculate complexity based on code structure
      fallbackResult.complexity_score.cognitive_complexity = Math.min(20, lines.length / 10);
      fallbackResult.complexity_score.cyclomatic_complexity = this.estimateCyclomaticComplexity(content);

    } catch (e) {
      console.error('Error in fallback analysis:', e);
    }

    return fallbackResult;
  }

  private analyzePythonSpecific(content: string, result: AnalysisResult): void {
    // Python-specific patterns
    if (content.includes('except Exception as e:') || content.includes('except Exception:')) {
      result.potential_bugs.push({
        type: 'error_handling',
        description: 'Overly broad exception handling detected',
        line: content.split('\n').findIndex(line =>
          line.includes('except Exception as e:') || line.includes('except Exception:')
        ) + 1
      });

      result.suggested_fixes.push({
        type: 'error_handling',
        fix: 'Use more specific exception types instead of catching all exceptions'
      });
    }

    if (content.includes('import *')) {
      result.potential_bugs.push({
        type: 'imports',
        description: 'Wildcard import detected, which may cause namespace pollution',
        line: content.split('\n').findIndex(line => line.includes('import *')) + 1
      });

      result.suggested_fixes.push({
        type: 'imports',
        fix: 'Import only needed modules or use explicit imports'
      });
    }
  }

  private analyzeJavaScriptSpecific(content: string, result: AnalysisResult): void {
    // JavaScript/TypeScript specific patterns
    if (content.includes('==') && !content.includes('===')) {
      result.potential_bugs.push({
        type: 'comparison',
        description: 'Non-strict equality comparison (==) detected',
        line: content.split('\n').findIndex(line => line.includes('==') && !line.includes('===')) + 1
      });

      result.suggested_fixes.push({
        type: 'comparison',
        fix: 'Use strict equality (===) instead of loose equality (==)'
      });
    }

    // Check for object mutation
    if (content.match(/const\s+\w+\s*=\s*{[^}]*};/)) {
      const matches = [...content.matchAll(/(\w+\s*=\s*[^;]*;)/g)];
      for (const match of matches) {
        const line = content.substring(0, match.index || 0).split('\n').length;
        result.ai_probability += 0.05; // AI often generated mutable objects
      }
    }
  }

  private estimateCyclomaticComplexity(content: string): number {
    // Basic estimation of cyclomatic complexity
    let complexity = 1; // Start with 1

    // Count branch points
    const patterns = [
      /if\s*\(/g,
      /else\s*{/g,
      /}\s*else\s+if/g,
      /for\s*\(/g,
      /while\s*\(/g,
      /case\s+/g,
      /catch\s*\(/g,
      /\?\s*:/g // Ternary operators
    ];

    patterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    });

    return complexity;
  }
}
