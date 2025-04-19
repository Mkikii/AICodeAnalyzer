import * as cp from 'child_process';

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
        (err, stdout) => {
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
}
