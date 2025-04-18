from typing import List, Dict
import ast

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
