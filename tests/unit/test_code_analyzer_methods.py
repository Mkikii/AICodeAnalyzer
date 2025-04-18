import pytest
from ai_toolkit.code_analyzer import AICodeAnalyzer

def test_detect_ai_code_confidence(monkeypatch):
    analyzer = AICodeAnalyzer()
    monkeypatch.setattr(analyzer, 'classifier', lambda x: [{'label':'AI','score':0.85}])
    score = analyzer._detect_ai_code("dummy code")
    assert isinstance(score, float)
    assert 0 <= score <= 1
    assert score == pytest.approx(0.85)

def test_suggest_fixes_for_security_issue(monkeypatch):
    analyzer = AICodeAnalyzer()
    monkeypatch.setattr(analyzer, '_find_potential_bugs', lambda c: [{'type':'security_issue','description':'dang'}])
    fixes = analyzer._suggest_fixes("dummy code")
    assert any(f['type']=='security_issue' and 'eval' in f['fix'] for f in fixes)

def test_cognitive_complexity_heuristic():
    analyzer = AICodeAnalyzer()
    code = "\n".join("line" for _ in range(50))
    comp = analyzer._calculate_cognitive_complexity(code)
    assert comp == pytest.approx(50/10)
