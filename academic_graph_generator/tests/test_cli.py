import os

import pytest

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


def test_cli_accepts_figsize_legend_and_colors(tmp_path):
    csv_path = tmp_path / "data.csv"
    csv_path.write_text("x,a,b\n0,1.0,2.0\n1,2.0,3.0\n2,3.1,4.5\n")
    out_stem = str(tmp_path / "graph")

    exit_code = main([
        str(csv_path), "--style", "matplotlib", "--kind", "line",
        "--figsize", "5x5", "--legend", "on", "--legend-loc", "upper left",
        "--colors", "red", "green", "--output", out_stem,
    ])

    assert exit_code == 0
    assert os.path.exists(out_stem + ".png")


def test_cli_rejects_malformed_figsize(tmp_path, capsys):
    csv_path = tmp_path / "data.csv"
    csv_path.write_text("x,y\n0,1.0\n1,2.0\n")

    # argparse는 잘못된 type 변환 시 자체적으로 SystemExit(2)를 발생시킨다.
    with pytest.raises(SystemExit) as exc_info:
        main([str(csv_path), "--figsize", "not-a-size"])

    assert exc_info.value.code == 2
    assert "너비x높이" in capsys.readouterr().err
