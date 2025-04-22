from typing import List, Dict
import ast
import re

class AIBugPatterns:
    @staticmethod
    def check_error_handling(node: ast.AST) -> List[Dict]:
        issues: List[Dict] = []
        for func in [n for n in ast.walk(node) if isinstance(n, ast.FunctionDef)]:
            has_try = any(isinstance(n2, ast.Try) for n2 in ast.walk(func))
            if not has_try:
                issues.append({
                    'type': 'error_handling',
                    'description': f"No try/except in function '{func.name}'"
                })
        return issues

    @staticmethod
    def check_api_misuse(node: ast.AST) -> List[Dict]:
        issues: List[Dict] = []
        for call in [n for n in ast.walk(node) if isinstance(n, ast.Call)]:
            if isinstance(call.func, ast.Name) and call.func.id == 'open':
                issues.append({
                    'type': 'api_misuse',
                    'description': "Use 'with open(...)' context manager for file operations"
                })
        return issues

    @staticmethod
    def check_security_patterns(node: ast.AST) -> List[Dict]:
        issues: List[Dict] = []
        for call in [n for n in ast.walk(node) if isinstance(n, ast.Call)]:
            if isinstance(call.func, ast.Name) and call.func.id == 'eval':
                issues.append({
                    'type': 'security_issue',
                    'description': "Use of 'eval' detected; this is a security risk",
                    'line': call.lineno
                })
        return issues

    @staticmethod
    def check_js_file(content: str) -> List[Dict]:
        """
        Analyze JavaScript/TypeScript files for common issues using regex patterns.
        """
        issues: List[Dict] = []

        # Find line numbers
        lines = content.split('\n')

        # Check for eval usage
        eval_pattern = re.compile(r'eval\s*\(')
        for i, line in enumerate(lines):
            if eval_pattern.search(line):
                issues.append({
                    'type': 'security_issue',
                    'description': "Use of 'eval' detected; this is a security risk",
                    'line': i + 1
                })

        # Check for inadequate error handling in promises
        if '.then(' in content and '.catch(' not in content:
            issues.append({
                'type': 'error_handling',
                'description': "Promise without error handling (missing .catch())",
                'line': next((i + 1 for i, line in enumerate(lines) if '.then(' in line), None)
            })

        # Check for setTimeout with string parameter (anti-pattern similar to eval)
        setTimeout_pattern = re.compile(r'setTimeout\s*\(\s*[\'"]')
        for i, line in enumerate(lines):
            if setTimeout_pattern.search(line):
                issues.append({
                    'type': 'security_issue',
                    'description': "setTimeout with string parameter acts like eval and is a security risk",
                    'line': i + 1
                })

        # Check for document.write (XSS vulnerability)
        if 'document.write(' in content:
            issues.append({
                'type': 'security_issue',
                'description': "document.write() is vulnerable to XSS attacks",
                'line': next((i + 1 for i, line in enumerate(lines) if 'document.write(' in line), None)
            })

        # Check for innerHtml assignment (potential XSS)
        innerHTML_pattern = re.compile(r'\.innerHTML\s*=')
        for i, line in enumerate(lines):
            if innerHTML_pattern.search(line):
                issues.append({
                    'type': 'security_issue',
                    'description': "Assigning to innerHTML can lead to XSS vulnerabilities",
                    'line': i + 1
                })

        return issues
