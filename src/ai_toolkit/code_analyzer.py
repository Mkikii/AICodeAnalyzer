import ast
import difflib
from typing import Dict, List, Optional
from pathlib import Path
import radon.complexity as cc
from transformers import pipeline
from .bug_patterns import AIBugPatterns

class AICodeAnalyzer:
    def __init__(self):
        self.classifier = pipeline("text-classification", model="bert-base-uncased")
        self.common_patterns = self._load_ai_patterns()

    def analyze_file(self, file_path: Path) -> Dict:
        with open(file_path, 'r') as f:
            content = f.read()
        return {
            'ai_probability': self._detect_ai_code(content),
            'potential_bugs': self._find_potential_bugs(content),
            'complexity_score': self._analyze_complexity(content),
            'suggested_fixes': self._suggest_fixes(content)
        }

    def _detect_ai_code(self, code: str) -> float:
        """Run HF classifier and return top score."""
        markers = [
            'generic variable names',
            'repetitive patterns',
            'common AI templates',
            'standardized comments'
        ]
        preds = self.classifier(code)
        # pipeline returns [{ 'label': ..., 'score': ... }, …]
        return float(preds[0].get('score', 0.0))

    def _find_potential_bugs(self, code: str) -> List[Dict]:
        bugs = []
        tree = ast.parse(code)
        patterns = {
            'error_handling': AIBugPatterns.check_error_handling,
            'api_misuse': AIBugPatterns.check_api_misuse,
            'security_issue': AIBugPatterns.check_security_patterns
        }
        for checker in patterns.values():
            bugs.extend(checker(tree))
        return bugs

    def _suggest_fixes(self, code: str) -> List[Dict]:
        bugs = self._find_potential_bugs(code)
        suggestions: List[Dict] = []
        for bug in bugs:
            t = bug.get('type')
            if t == 'security_issue':
                suggestions.append({
                    'type': t,
                    'fix': 'Avoid eval; use safe parsers or sanitize inputs.'
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
        return {
            'cyclomatic_complexity': cc.analyze(code).average_complexity,
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
        print("Usage: ai-toolkit <file.py>")
        sys.exit(1)
    path = Path(sys.argv[1])
    res = AICodeAnalyzer().analyze_file(path)
    print(json.dumps(res))
