import pytest
import numpy as np
from sklearn.linear_model import LogisticRegression
from ai_toolkit.core import AIBugDetector
from ai_toolkit.code_analyzer import AICodeAnalyzer
from pathlib import Path

def create_test_model_and_data():
    # Create synthetic data with known issues
    np.random.seed(42)
    X_train = np.random.randn(100, 5)
    y_train = (X_train[:, 0] > 0).astype(int)  # Biased towards first feature

    # Create test data with drift
    X_test = np.random.randn(50, 5) + 0.5  # Add shift
    y_test = (X_test[:, 0] > 0).astype(int)

    model = LogisticRegression().fit(X_train, y_train)
    return model, X_train, X_test

def test_full_analysis_workflow():
    # Test the complete workflow from code analysis to bug detection
    analyzer = AICodeAnalyzer()
    detector = AIBugDetector()

    # Test code analysis
    test_file = Path('test-fixtures/ai_generated.py')
    analysis_results = analyzer.analyze_file(test_file)

    assert 'ai_probability' in analysis_results
    assert 'potential_bugs' in analysis_results
    assert 'complexity_score' in analysis_results

    # Test AI bug detection
    model, train_data, test_data = create_test_model_and_data()
    bug_results = detector.analyze_model(model, train_data, test_data)

    assert isinstance(bug_results, dict)
    assert 'data_leakage' in bug_results
    assert 'model_drift' in bug_results
    assert 'bias_detection' in bug_results
    assert 'overfit_detection' in bug_results

    # Verify detection of injected issues
    drift_issues = bug_results['model_drift']
    assert any('drift' in issue.lower() for issue in drift_issues), "Should detect model drift"

    bias_issues = bug_results['bias_detection']
    assert len(bias_issues) > 0, "Should detect bias towards first feature"

@pytest.mark.parametrize("test_case", [
    ("data_leakage", lambda m, t, v: (t, t)),  # Same data for train and test
    ("model_drift", lambda m, t, v: (t, t + 2)),  # Large shift in test data
    ("bias_detection", lambda m, t, v: (t, v[v[:, 0] > 1])),  # Biased subset
])
def test_specific_bug_patterns(test_case):
    pattern_name, data_modifier = test_case
    detector = AIBugDetector()

    # Create base data
    X = np.random.randn(200, 5)
    model = LogisticRegression().fit(X[:100], (X[:100, 0] > 0).astype(int))

    # Modify data to inject specific issue
    train_data, test_data = data_modifier(model, X[:100], X[100:])

    results = detector.analyze_model(model, train_data, test_data)
    assert len(results[pattern_name]) > 0, f"Should detect {pattern_name}"
