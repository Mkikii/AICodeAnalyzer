import pytest
from ai_toolkit.code_analyzer import AICodeAnalyzer
from pathlib import Path

def test_ai_code_detection():
    analyzer = AICodeAnalyzer()
    test_code = """
    def generate_response(prompt):
        # This is a typical AI-generated function
        response = ''
        tokens = prompt.split()
        for token in tokens:
            response += process_token(token)
        return response
    """

    result = analyzer._detect_ai_code(test_code)
    assert isinstance(result, float)
    assert 0 <= result <= 1

def test_bug_pattern_detection():
    analyzer = AICodeAnalyzer()
    test_code = """
    def unsafe_api_call(user_input):
        return eval(user_input)  # Common AI security mistake
    """

    bugs = analyzer._find_potential_bugs(test_code)
    assert len(bugs) > 0
    assert any(bug['type'] == 'security_issue' for bug in bugs)
