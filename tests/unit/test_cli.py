import sys, json
from pathlib import Path
import pytest
from ai_toolkit.code_analyzer import main

def test_cli_no_args(capsys):
    with pytest.raises(SystemExit):
        main()
    out, _ = capsys.readouterr()
    assert "Usage: ai-toolkit <file.py>" in out

def test_cli_outputs_json(tmp_path, capsys, monkeypatch):
    p = tmp_path/"t.py"
    p.write_text("def f(): pass")
    monkeypatch.setattr(sys, 'argv', ["ai-toolkit", str(p)])
    main()
    out, _ = capsys.readouterr()
    data = json.loads(out)
    assert 'ai_probability' in data
    assert 'potential_bugs' in data
    assert 'complexity_score' in data
    assert 'suggested_fixes' in data
