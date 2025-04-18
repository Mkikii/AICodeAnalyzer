# src/ai_toolkit/core.py

from typing import Dict, List, Any
import numpy as np
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import cross_val_score

class AIBugDetector:
    def __init__(self):
        self.known_patterns = {
            'data_leakage': self._check_data_leakage,
            'model_drift': self._check_model_drift,
            'bias_detection': self._check_bias,
            'overfit_detection': self._check_overfitting
        }

    def analyze_model(self, model: Any, train_data: np.ndarray, test_data: np.ndarray) -> Dict[str, List[str]]:
        """
        Analyzes an AI model for common bugs and issues
        """
        issues = {}
        for pattern_name, check_func in self.known_patterns.items():
            issues[pattern_name] = check_func(model, train_data, test_data)
        return issues

    def _check_data_leakage(self, model: Any, train_data: np.ndarray, test_data: np.ndarray) -> List[str]:
        issues = []

        # Check for feature overlap between train and test
        train_features = set(str(x) for x in train_data.flatten())
        test_features = set(str(x) for x in test_data.flatten())
        overlap = train_features.intersection(test_features)

        if len(overlap) / len(train_features) > 0.9:
            issues.append("Potential data leakage: High feature overlap between train and test sets")

        # Check for suspicious perfect performance
        try:
            train_score = model.score(train_data, model.predict(train_data))
            test_score = model.score(test_data, model.predict(test_data))

            if train_score > 0.99 and test_score > 0.99:
                issues.append("Potential data leakage: Suspiciously high performance on both train and test sets")
        except:
            pass

        return issues

    def _check_model_drift(self, model: Any, train_data: np.ndarray, test_data: np.ndarray) -> List[str]:
        issues = []

        # Check for distribution shift
        train_mean = np.mean(train_data, axis=0)
        test_mean = np.mean(test_data, axis=0)

        drift_threshold = 0.5
        mean_diff = np.abs(train_mean - test_mean)

        if np.any(mean_diff > drift_threshold):
            issues.append(f"Model drift detected: Feature distribution shift exceeds threshold of {drift_threshold}")

        # Check for performance degradation
        try:
            train_scores = cross_val_score(model, train_data, model.predict(train_data), cv=5)
            test_scores = cross_val_score(model, test_data, model.predict(test_data), cv=5)

            if np.mean(test_scores) < np.mean(train_scores) * 0.8:
                issues.append("Model drift: Significant performance degradation on test data")
        except:
            pass

        return issues

    def _check_bias(self, model: Any, train_data: np.ndarray, test_data: np.ndarray) -> List[str]:
        issues = []

        # Check for class imbalance
        try:
            predictions = model.predict(test_data)
            unique, counts = np.unique(predictions, return_counts=True)
            class_dist = counts / len(predictions)

            if np.any(class_dist > 0.8):
                issues.append("Potential bias: Severe class imbalance in predictions")

            # Check for demographic parity if possible
            if train_data.shape[1] > 1:  # If we have multiple features
                sensitive_attr = train_data[:, 0]  # Assuming first column could be sensitive
                pred_by_group = {}
                for val in np.unique(sensitive_attr):
                    mask = sensitive_attr == val
                    pred_by_group[val] = np.mean(predictions[mask])

                if max(pred_by_group.values()) - min(pred_by_group.values()) > 0.2:
                    issues.append("Potential bias: Different prediction rates across groups")
        except:
            pass

        return issues

    def _check_overfitting(self, model: Any, train_data: np.ndarray, test_data: np.ndarray) -> List[str]:
        issues = []

        try:
            # Compare train and test performance
            train_score = model.score(train_data, model.predict(train_data))
            test_score = model.score(test_data, model.predict(test_data))

            if train_score > 0.95 and (train_score - test_score) > 0.2:
                issues.append(f"Potential overfitting: Train accuracy ({train_score:.2f}) much higher than test accuracy ({test_score:.2f})")

            # Check for high variance in predictions
            test_preds = model.predict(test_data)
            if np.std(test_preds) > 2 * np.std(model.predict(train_data)):
                issues.append("Potential overfitting: High variance in test predictions")
        except:
            pass

        return issues