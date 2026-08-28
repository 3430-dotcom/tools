import os

from academic_graph_generator.cli import main


def test_cli_end_to_end(tmp_path):
    csv_path = tmp_path / "data.csv"
    csv_path.write_text("x,y,y_err\n0,1.0,0.1\n1,2.0,0.1\n2,3.1,0.1\n")
    out_stem = str(tmp_path / "graph")

    exit_code = main([str(csv_path), "--style", "apa", "--kind", "line",
                       "--trendline", "--output", out_stem])

    assert exit_code == 0
    assert os.path.exists(out_stem + ".svg")
    assert os.path.exists(out_stem + ".png")


def test_cli_reports_error_for_missing_file(tmp_path, capsys):
    exit_code = main([str(tmp_path / "missing.csv")])
    assert exit_code == 1
    assert "오류" in capsys.readouterr().err
