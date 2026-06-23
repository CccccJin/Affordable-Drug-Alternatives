"""Generate the Chemical Similarity Platform data flow diagram.

The script uses graphviz to render an academic-style data flow diagram that mirrors
the structure provided in the source Mermaid description.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import html

from graphviz import Digraph


ASCII_ICONS = {
    "title": "DF",
    "source": "S",
    "preprocess": "P",
    "storage": "DB",
    "api": "API",
    "service": "Svc",
}

EMOJI_ICONS = {
    "title": "🧬",
    "source": "🧪",
    "preprocess": "⚙️",
    "storage": "💾",
    "api": "🔗",
    "service": "🛎️",
}

LABEL_WIDTHS = {
    "title": 460,
    "source": 320,
    "preprocess": 360,
    "storage": 400,
    "api": 340,
    "service": 320,
}


def _format_text_lines(lines: list[str]) -> list[str]:
    formatted: list[str] = []
    total = len(lines)
    for index, raw_line in enumerate(lines):
        stripped = raw_line.strip()
        if not stripped:
            formatted.append("&nbsp;")
            continue
        if stripped.startswith("- "):
            content = html.escape(stripped[2:].lstrip(), quote=False)
            formatted.append(f"&#8226;&nbsp;{content}")
            continue
        escaped = html.escape(stripped, quote=False)
        if index == 0 and total > 1:
            escaped = f"<B>{escaped}</B>"
        formatted.append(escaped)
    return formatted


def _make_label(style_key: str, text: str, icon_map: dict[str, str]) -> str:
    """Build an HTML-like label with an optional icon and multiline text."""

    icon = icon_map.get(style_key, "")
    text_lines = _format_text_lines(text.split("\n"))
    line_block = "<BR ALIGN=\"LEFT\"/>".join(text_lines)
    width = LABEL_WIDTHS.get(style_key)
    table_width_attr = f' WIDTH="{width}"' if width else ""
    text_width_attr = f' WIDTH="{max(width - 48, 1)}"' if width and width > 60 else ""

    icon_cell = ""
    if icon:
        icon_cell = (
            '<TD ALIGN="CENTER" VALIGN="TOP" WIDTH="40">'
            f"<FONT POINT-SIZE=\"20\">{icon}</FONT>"
            "</TD>"
        )

    text_cell = (
        f'<TD ALIGN="LEFT" BALIGN="LEFT" VALIGN="TOP"{text_width_attr}>'
        f"<FONT POINT-SIZE=\"14\">{line_block}</FONT>"
        "</TD>"
    )

    return (
        "<"
        f'<TABLE BORDER="0" CELLBORDER="0" CELLPADDING="6"{table_width_attr}>'
        "<TR>"
        f"{icon_cell}{text_cell}"
        "</TR>"
        "</TABLE>"
        ">"
    )


TITLE = "Chemical Similarity Platform Data Flow\n(ChEMBL + DuckDB + RDKit + ChemBERTa)"


def build_graph(icon_map: dict[str, str]) -> Digraph:
    """Construct and return the data flow diagram as a graphviz Digraph."""
    graph = Digraph("chemical_similarity_data_flow", format="svg")

    graph.attr(
        rankdir="LR",
        nodesep="0.5",
        ranksep="1.0",
        pad="0.6",
        margin="0.25",
        labelloc="t",
        labeljust="c",
        label="",
        splines="ortho",
        overlap="false",
        bgcolor="#F9FAFB",
    )

    # Default node and edge style tuned for clean straight connectors.
    graph.attr("node", shape="rect", style="rounded,filled", fontname="Helvetica")
    graph.attr("edge", color="#37474F", penwidth="1.2", arrowsize="0.8")

    styles = {
        "title": {
            "fillcolor": "#0B3D91",
            "color": "#062663",
            "fontcolor": "#FFFFFF",
            "fontsize": "20",
            "penwidth": "2",
        },
        "source": {
            "fillcolor": "#E3F2FD",
            "color": "#1565C0",
            "fontcolor": "#0D47A1",
            "fontsize": "16",
            "penwidth": "1.5",
        },
        "preprocess": {
            "fillcolor": "#FFF8E1",
            "color": "#F9A825",
            "fontcolor": "#6D4C41",
            "fontsize": "15",
            "penwidth": "1.5",
        },
        "storage": {
            "fillcolor": "#E8F5E9",
            "color": "#2E7D32",
            "fontcolor": "#1B5E20",
            "fontsize": "16",
            "penwidth": "1.5",
        },
        "api": {
            "fillcolor": "#FCE4EC",
            "color": "#C2185B",
            "fontcolor": "#880E4F",
            "fontsize": "15",
            "penwidth": "1.5",
        },
        "service": {
            "fillcolor": "#F3E5F5",
            "color": "#7B1FA2",
            "fontcolor": "#4A148C",
            "fontsize": "13",
            "penwidth": "1.5",
        },
    }

    for key, attributes in styles.items():
        width_points = LABEL_WIDTHS.get(key)
        if width_points:
            attributes.setdefault("width", f"{width_points / 72:.2f}")

    with graph.subgraph(name="cluster_sources") as sources:
        sources.attr(
            label="Data Sources",
            labelloc="b",
            color="#1565C0",
            fontname="Helvetica-Bold",
            fontsize="14",
            penwidth="1.5",
            rank="same",
        )
        sources.node("A1", _make_label("source", "ChEMBL SQLite\nchembl_35.db", icon_map), **styles["source"])
        sources.node("A2", _make_label("source", "WHO GPRM / NHS SCMD / GoodRx\n(价格增广)", icon_map), **styles["source"])
        sources.node(
            "SRC_HUB_CORE",
            shape="point",
            width="0.08",
            height="0.08",
            color="#1565C0",
            label="",
        )
        sources.node(
            "SRC_HUB_PRICE",
            shape="point",
            width="0.08",
            height="0.08",
            color="#1565C0",
            label="",
        )

    with graph.subgraph(name="cluster_preprocessing") as preprocessing:
        preprocessing.attr(
            label="Preprocessing & Data Augmentation",
            labelloc="b",
            color="#F9A825",
            fontname="Helvetica-Bold",
            fontsize="14",
            penwidth="1.5",
            rank="same",
        )
        preprocessing.node(
            "P1",
            _make_label("preprocess", "preprocess_database.py\n→ compound_structures.fingerprint_hex\nMorgan Fingerprints", icon_map),
            **styles["preprocess"],
        )
        preprocessing.node(
            "P2",
            _make_label("preprocess", "preprocess_properties.py\n→ rdkit_metrics + compound_full (VIEW)\nRDKit Descriptors & CNS MPO", icon_map),
            **styles["preprocess"],
        )
        preprocessing.node(
            "P3",
            _make_label("preprocess", "preprocess_inn.py\n→ inn_list\nINN Synonyms from SQLite", icon_map),
            **styles["preprocess"],
        )
        preprocessing.node(
            "P4",
            _make_label("preprocess", "preprocess_chemberta.py\n→ chemberta_embeddings\nChemBERTa Mean-Pooled Embeddings", icon_map),
            **styles["preprocess"],
        )
        preprocessing.node(
            "P5",
            _make_label("preprocess", "Aggregate_drug_price.py\n→ drug_prices (+ nhs_prices, goodrx_cache)\n价格抓取与匹配", icon_map),
            **styles["preprocess"],
        )
        preprocessing.node(
            "PRE_HUB_CORE",
            shape="point",
            width="0.08",
            height="0.08",
            color="#F9A825",
            label="",
        )
        preprocessing.node(
            "PRE_HUB_PRICE",
            shape="point",
            width="0.08",
            height="0.08",
            color="#F9A825",
            label="",
        )

    with graph.subgraph(name="cluster_duckdb") as duckdb:
        duckdb.attr(
            label="Analytical Storage\nchembl_35/chembl_35.duckdb",
            labelloc="b",
            color="#2E7D32",
            fontname="Helvetica-Bold",
            fontsize="14",
            penwidth="1.5",
            rank="same",
        )
        duckdb.node(
            "D1",
            _make_label("storage", "DuckDB 数据文件\nchembl_35.duckdb", icon_map),
            **styles["storage"],
        )
        duckdb.node(
            "D2",
            _make_label(
                "storage",
                "核心表 / 视图 (DuckDB)\n- compound_structures (fingerprint_hex)\n- rdkit_metrics / chemberta_embeddings\n- compound_full (view) / inn_list\n- drug_prices / nhs_prices / goodrx_cache",
                icon_map,
            ),
            **styles["storage"],
        )
        duckdb.node(
            "STO_HUB",
            shape="point",
            width="0.08",
            height="0.08",
            color="#2E7D32",
            label="",
        )

    with graph.subgraph(name="cluster_api") as api:
        api.attr(
            label="API & Services",
            labelloc="b",
            color="#C2185B",
            fontname="Helvetica-Bold",
            fontsize="14",
            penwidth="1.5",
            rank="same",
        )
        api.node(
            "S1",
            _make_label("api", "/search\n指纹相似 (Tanimoto / Cosine)\n数据: fingerprint_hex", icon_map),
            **styles["api"],
        )
        api.node(
            "PP",
            _make_label("service", "post_processing.py\n排序 / 过滤 / Butina 聚类", icon_map),
            **styles["service"],
        )
        api.node(
            "S2",
            _make_label("api", "/search_ai\nChemBERTa 相似 (Cosine)\n数据: chemberta_embeddings", icon_map),
            **styles["api"],
        )
        api.node(
            "S3",
            _make_label("api", "/properties, /properties/calculate\n属性查询 + RDKit 计算", icon_map),
            **styles["api"],
        )
        api.node("S5", _make_label("api", "/visualize\nSMILES → SVG", icon_map), **styles["api"])
        api.node(
            "S4",
            _make_label("api", "/resolve_name\nChEMBL Web 客户端在线解析", icon_map),
            **styles["api"],
        )
        api.node(
            "B",
            _make_label("service", "ChEMBL Web Resource API", icon_map),
            shape="rect",
            **styles["service"],
        )
        api.node(
            "API_HUB",
            shape="point",
            width="0.08",
            height="0.08",
            color="#C2185B",
            label="",
        )

    # Source to preprocessing to storage edges guided through hub points.
    graph.edge("A1", "SRC_HUB_CORE", weight="3")
    graph.edge("A2", "SRC_HUB_PRICE", weight="3")

    graph.edge("SRC_HUB_CORE", "PRE_HUB_CORE", weight="3")
    graph.edge("SRC_HUB_PRICE", "PRE_HUB_PRICE", weight="3")
    for node_id in ("P1", "P2", "P3", "P4"):
        graph.edge("PRE_HUB_CORE", node_id, weight="3")

    graph.edge("PRE_HUB_PRICE", "P5", weight="3")

    for node_id in ("P1", "P2", "P3", "P4", "P5"):
        graph.edge(node_id, "STO_HUB", weight="4")

    graph.edge("STO_HUB", "D1", weight="4")
    graph.edge("D1", "D2", weight="5")

    # Storage to API & services.
    graph.edge("D2", "API_HUB", weight="4")
    for node_id in ("S1", "S2", "S3", "S4", "S5"):
        graph.edge("API_HUB", node_id, weight="3")

    graph.edge("S1", "PP", weight="2")

    # External lookup service.
    graph.edge("S4", "B", style="dashed", label="Online Lookup", constraint="false")

    return graph


def render(
    output: Path,
    view: bool = False,
    fmt: str | None = None,
    *,
    use_emoji: bool = False,
) -> Path:
    """Render the diagram to the desired output path and format."""
    icon_map = EMOJI_ICONS if use_emoji else ASCII_ICONS
    graph = build_graph(icon_map)
    if fmt is not None:
        graph.format = fmt

    destination = output.parent
    destination.mkdir(parents=True, exist_ok=True)

    filename = output.stem
    rendered_path = graph.render(filename=filename, directory=str(destination), view=view, cleanup=True)
    return Path(rendered_path)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate the Chemical Similarity Platform data flow diagram.")
    parser.add_argument(
        "output",
        type=Path,
        nargs="?",
        default=Path("diagrams/chemical_similarity_data_flow"),
        help="Output file path without extension (default: diagrams/chemical_similarity_data_flow)",
    )
    parser.add_argument(
        "--format",
        "-f",
        default=None,
        help="Optional graphviz output format (png, svg, pdf, ...). Defaults to graphviz default (png).",
    )
    parser.add_argument(
        "--view",
        action="store_true",
        help="Open the rendered file with the default viewer after generation.",
    )
    parser.add_argument(
        "--emoji-icons",
        action="store_true",
        help="Render labels with emoji icons (requires system emoji fonts).",
    )

    args = parser.parse_args()

    rendered = render(args.output, view=args.view, fmt=args.format, use_emoji=args.emoji_icons)
    print(f"Diagram written to {rendered}")


if __name__ == "__main__":
    main()
