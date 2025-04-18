import * as cp from 'child_process';

export class AICodeAnalyzer {
  async analyze(filePath: string): Promise<any> {
    return new Promise((resolve, reject) => {
      cp.execFile(
        'python',
        ['-m', 'ai_toolkit.code_analyzer', filePath],
        { timeout: 30_000 },
        (err, stdout, stderr) => {
          if (err) return reject(err);
          try {
            resolve(JSON.parse(stdout));
          } catch (e) {
            reject(new Error(`Invalid JSON from analyzer: ${e}`));
          }
        }
      );
    });
  }
}
