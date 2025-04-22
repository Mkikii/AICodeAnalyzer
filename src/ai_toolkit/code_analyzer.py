import ast
from typing import Dict, List, Optional
from pathlib import Path
import radon.complexity as cc
import json
import sys

# Flag to track whether we're using real transformers or our fallback implementation
USE_FALLBACK = False

# Try to import transformers, use fallback if not available
try:
    from transformers import pipeline
    HAS_TRANSFORMERS = True
except ImportError:
    HAS_TRANSFORMERS = False
    USE_FALLBACK = True
    print("Warning: transformers/PyTorch not available, using fallback classifier", file=sys.stderr)

from .bug_patterns import AIBugPatterns

class AICodeAnalyzer:
    def __init__(self):
        self._classifier = None
        self.common_patterns = self._load_ai_patterns()
        self._ast_cache: Dict[Path, ast.AST] = {}

    @property
    def classifier(self):
        global USE_FALLBACK
        if not USE_FALLBACK and self._classifier is None:
            # Only try to initialize the real classifier if we have transformers
            try:
                self._classifier = pipeline("text-classification", model="bert-base-uncased")
            except Exception as e:
                print(f"Error initializing transformer pipeline: {e}", file=sys.stderr)
                USE_FALLBACK = True
        return self._classifier

    def analyze_file(self, file_path: Path) -> Dict:
        with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
            content = f.read()

        # Determine file type
        file_extension = file_path.suffix.lower()

        # Parse the code with AST for Python files
        bugs = []
        if file_extension == '.py':
            try:
                if file_path not in self._ast_cache:
                    self._ast_cache[file_path] = ast.parse(content)
                tree = self._ast_cache[file_path]
                # Find Python-specific bugs
                bugs = self._find_potential_bugs(tree)
            except SyntaxError:
                # For Python files with syntax errors, report the issue
                bugs = [{
                    'type': 'syntax_error',
                    'description': 'Python syntax error detected - code may be incomplete or invalid'
                }]
        elif file_extension in ['.js', '.jsx', '.ts', '.tsx']:
            # For JavaScript/TypeScript files, use regex-based detection
            bugs = AIBugPatterns.check_js_file(content)

        # Return the analysis
        return {
            'ai_probability': self._detect_ai_code(content),
            'potential_bugs': bugs,
            'complexity_score': self._analyze_complexity(content),
            'suggested_fixes': self._suggest_fixes(bugs)
        }

    def _detect_ai_code(self, code: str) -> float:
        """Run classifier to determine if code is AI-generated."""
        global USE_FALLBACK
        if USE_FALLBACK:
            # Simple heuristic fallback
            score = 0.5  # Base score

            # More comprehensive pattern detection for AI-generated code
            ai_patterns = {
                'eval(': 0.2,
                'temp =': 0.1,
                'result =': 0.1,
                '# Generic': 0.1,
                'generic variable': 0.1,
                'strip().lower()': 0.1,
                'This function': 0.05,
                'demonstrates': 0.05,
                'for item in': 0.05,
                'processed_data': 0.1,
                'return result': 0.05,
                'def process': 0.05,
                'data.append': 0.05,
                'lambda x:': 0.1,
                'import numpy': 0.05,
                'import pandas': 0.05,
                '# TODO:': 0.05,
                'try:\n    ': 0.05,
                'except Exception': 0.1,
            }

            # Check for common AI-generated code patterns
            for pattern, weight in ai_patterns.items():
                if pattern in code.lower():
                    score += weight

            # Check for repetitive structure
            lines = code.split('\n')
            indent_patterns = {}
            for line in lines:
                indent = len(line) - len(line.lstrip())
                if indent in indent_patterns:
                    indent_patterns[indent] += 1
                else:
                    indent_patterns[indent] = 1

            # Many 4-space indents often indicate AI-generated code
            if indent_patterns.get(4, 0) > 10:
                score += 0.1

            # Check for docstring pattern
            if '"""' in code and ('Args:' in code or 'Returns:' in code or 'Parameters:' in code):
                score += 0.15

            return min(0.95, score)
        else:
            # Use the real transformer-based classifier
            try:
                preds = self.classifier(code)
                return float(preds[0].get('score', 0.0))
            except Exception as e:
                print(f"Error using transformer classifier: {e}", file=sys.stderr)
                USE_FALLBACK = True
                # Recursively call with fallback
                return self._detect_ai_code(code)

    def _find_potential_bugs(self, tree: ast.AST) -> List[Dict]:
        bugs = []

        # First use bug_patterns for Python-specific analysis
        try:
            patterns = {
                'error_handling': AIBugPatterns.check_error_handling,
                'api_misuse': AIBugPatterns.check_api_misuse,
                'security_issue': AIBugPatterns.check_security_patterns
            }
            for pattern_type, checker in patterns.items():
                bugs.extend(checker(tree))
        except Exception as e:
            print(f"Error in bug pattern detection: {e}", file=sys.stderr)

        return bugs

    def _suggest_fixes(self, bugs: List[Dict]) -> List[Dict]:
        suggestions: List[Dict] = []
        for bug in bugs:
            t = bug.get('type')
            if t == 'security_issue':
                suggestions.append({
                    'type': t,
                    'fix': 'Avoid eval; use safe parsers like ast.literal_eval or json.loads instead.'
                })
            elif t == 'error_handling':
                suggestions.append({
                    'type': t,
                    'fix': 'Wrap risky calls in try/except and handle exceptions.'
                })
            elif t == 'api_misuse':
                suggestions.append({
                    'type': t,
                    'fix': "Use 'with open(...)' context managers for file I/O."
                })
        return suggestions

    def _analyze_complexity(self, code: str) -> Dict:
        try:
            cc_score = cc.analyze(code).average_complexity
        except:
            cc_score = 5.0  # Default value on error

        return {
            'cyclomatic_complexity': cc_score,
            'cognitive_complexity': self._calculate_cognitive_complexity(code)
        }

    def _load_ai_patterns(self) -> List[str]:
        # Load or hardcode markers for AI‐style code
        return [
            'generic variable names',
            'repetitive patterns',
            'common AI templates',
        ]

    def _calculate_cognitive_complexity(self, code: str) -> float:
        # Rough heuristic: lines / 10 (replace with real calc later)
        return float(len(code.splitlines()) / 10)

def main():
    import sys, json
    from pathlib import Path
    if len(sys.argv) != 2:
        print("Usage: python -m ai_toolkit.code_analyzer <file>", file=sys.stderr)
        sys.exit(1)

    path = Path(sys.argv[1])
    try:
        res = AICodeAnalyzer().analyze_file(path)
        # Convert to JSON and print to stdout
        print(json.dumps(res, indent=2))
    except Exception as e:
        print(f"Error analyzing file: {e}", file=sys.stderr)
        # Return a basic fallback result
        fallback = {
            'ai_probability': 0.5,
            'potential_bugs': [],
            'complexity_score': {'cyclomatic_complexity': 5, 'cognitive_complexity': 5},
            'suggested_fixes': []
        }
        print(json.dumps(fallback, indent=2))

if __name__ == "__main__":
    main()
