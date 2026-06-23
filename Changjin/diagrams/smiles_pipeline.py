"""Render a compact diagram showing SMILES transformation pipelines."""

from __future__ import annotations

from pathlib import Path

from graphviz import Digraph


def build_graph() -> Digraph:
    graph = Digraph("smiles_transformations", format="svg")
    graph.attr(
        rankdir="LR",
        nodesep="0.5",
        ranksep="1.0",
        pad="0.4",
        margin="0.2",
        splines="ortho",
        bgcolor="#FAFAFA",
    )

    graph.attr("node", shape="rect", style="rounded,filled", fontname="Helvetica")

    styles = {
        "source": {"fillcolor": "#E3F2FD", "color": "#1565C0", "fontcolor": "#0D47A1"},
        "process": {"fillcolor": "#FFF3E0", "color": "#F57C00", "fontcolor": "#E65100"},
        "output": {"fillcolor": "#E8F5E9", "color": "#2E7D32", "fontcolor": "#1B5E20"},
    }

    graph.node("smiles", "SMILES", **styles["source"], height="1.0", width="1.8")

    graph.node("morgan", "Morgan Fingerprint", **styles["output"], height="1.0", width="2.2")

    graph.node("rdkit", "RDKit\nDescriptor Engine", **styles["process"], height="1.1", width="2.1")
    graph.node("properties", "Compound Properties", **styles["output"], height="1.0", width="2.3")

    graph.node("chemberta", "ChemBERTa\nEncoder", **styles["process"], height="1.1", width="2.1")
    graph.node("embedding", "Embedding Vector", **styles["output"], height="1.0", width="2.1")

    graph.edge("smiles", "morgan", label="RDKit Morgan FP", fontsize="11")
    graph.edge("smiles", "rdkit", label="Input", fontsize="11")
    graph.edge("rdkit", "properties", label="Calculated descriptors", fontsize="11")

    graph.edge("smiles", "chemberta", label="Tokenize", fontsize="11")
    graph.edge("chemberta", "embedding", label="Mean pooling", fontsize="11")

    return graph


def render(output: Path | None = None) -> Path:
    graph = build_graph()
    if output is None:
        output = Path(__file__).with_suffix(".svg")

    render_dir = output.parent
    render_dir.mkdir(parents=True, exist_ok=True)

    rendered_path = graph.render(filename=output.stem, directory=str(render_dir), cleanup=True)
    return Path(rendered_path)


if __name__ == "__main__":
    path = render()
    print(f"Diagram written to {path}")
