import ast
import pytest
from ai_toolkit.bug_patterns import AIBugPatterns

def test_error_handling_detects_missing_try():
    tree = ast.parse("def f():\n    x = 1")
    issues = AIBugPatterns.check_error_handling(tree)
    assert issues and issues[0]['type'] == 'error_handling'

def test_api_misuse_detects_open():
    tree = ast.parse("f = open('a.txt')\n f.read()")
    issues = AIBugPatterns.check_api_misuse(tree)
    assert issues and issues[0]['type'] == 'api_misuse'

def test_security_patterns_detects_eval():
    tree = ast.parse("result = eval('2+2')")
    issues = AIBugPatterns.check_security_patterns(tree)
    assert issues and issues[0]['type'] == 'security_issue'
