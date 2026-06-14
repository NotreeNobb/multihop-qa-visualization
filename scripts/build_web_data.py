import argparse
import json
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path

import pandas as pd


RELATION_CLUSTERS = {
    "person_family": ["father", "mother", "spouse", "child", "sibling", "wife", "husband"],
    "creative_work": ["director", "producer", "writer", "screenwriter", "composer", "cast", "performer"],
    "location": ["country", "place", "located", "capital", "birth", "death", "headquarters"],
    "organization": ["member", "employer", "founded", "publisher", "owned", "operator"],
    "time": ["date", "year", "inception", "publication", "released"],
}


def relation_cluster(relation: str) -> str:
    text = relation.lower()
    for cluster, keywords in RELATION_CLUSTERS.items():
        if any(keyword in text for keyword in keywords):
            return cluster
    return "other"


def safe_json_loads(value, fallback):
    if value is None:
        return fallback
    if isinstance(value, (list, dict)):
        return value
    try:
        return json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return fallback


def short_context(context, max_docs=3, max_sentences=3):
    docs = []
    for item in context[:max_docs]:
        if not isinstance(item, list) or len(item) != 2:
            continue
        title, sentences = item
        docs.append(
            {
                "title": title,
                "sentences": [str(sentence) for sentence in sentences[:max_sentences]],
            }
        )
    return docs


def build_data(source_path: Path, output_dir: Path, sample_size: int):
    df = pd.read_parquet(source_path)
    df = df.head(sample_size).copy()

    nodes = {}
    edges = []
    questions = []
    question_type_counts = Counter()
    relation_counts = Counter()
    cluster_counts = Counter()
    entity_to_questions = defaultdict(list)
    relation_to_questions = defaultdict(list)

    for _, row in df.iterrows():
        qid = str(row["_id"])
        qtype = str(row["type"])
        question_type_counts[qtype] += 1

        evidences = safe_json_loads(row["evidences"], [])
        context = safe_json_loads(row["context"], [])
        supporting_facts = safe_json_loads(row["supporting_facts"], [])

        chain = []
        for hop_index, triple in enumerate(evidences, start=1):
            if not isinstance(triple, list) or len(triple) != 3:
                continue
            source, relation, target = [str(part) for part in triple]
            cluster = relation_cluster(relation)
            relation_counts[relation] += 1
            cluster_counts[cluster] += 1

            for entity in [source, target]:
                if entity not in nodes:
                    nodes[entity] = {
                        "id": entity,
                        "label": entity,
                        "degree": 0,
                        "questionIds": [],
                    }
                nodes[entity]["degree"] += 1
                nodes[entity]["questionIds"].append(qid)
                entity_to_questions[entity].append(qid)

            relation_to_questions[relation].append(qid)
            edge_id = f"{qid}-{hop_index}"
            edges.append(
                {
                    "id": edge_id,
                    "source": source,
                    "target": target,
                    "relation": relation,
                    "questionId": qid,
                    "hop": hop_index,
                    "type": qtype,
                    "cluster": cluster,
                }
            )
            chain.append(
                {
                    "source": source,
                    "relation": relation,
                    "target": target,
                    "hop": hop_index,
                    "cluster": cluster,
                }
            )

        questions.append(
            {
                "id": qid,
                "type": qtype,
                "question": str(row["question"]),
                "answer": str(row["answer"]),
                "chain": chain,
                "supportingFacts": supporting_facts,
                "context": short_context(context),
            }
        )

    for node in nodes.values():
        node["questionIds"] = sorted(set(node["questionIds"]))

    top_entities = sorted(nodes.values(), key=lambda item: item["degree"], reverse=True)[:80]
    top_relations = relation_counts.most_common(40)

    app_data = {
        "meta": {
            "source": str(source_path),
            "sampleSize": len(questions),
            "nodeCount": len(nodes),
            "edgeCount": len(edges),
        },
        "questions": questions,
        "nodes": list(nodes.values()),
        "edges": edges,
        "topEntities": top_entities,
        "topRelations": [{"relation": name, "count": count} for name, count in top_relations],
        "questionTypeCounts": dict(question_type_counts),
        "clusterCounts": dict(cluster_counts),
    }

    summary = {
        "sample_size": len(questions),
        "node_count": len(nodes),
        "edge_count": len(edges),
        "question_type_counts": dict(question_type_counts),
        "cluster_counts": dict(cluster_counts),
        "top_relations": app_data["topRelations"][:12],
        "top_entities": [
            {"entity": item["id"], "degree": item["degree"]} for item in top_entities[:12]
        ],
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "app_data.json").write_text(
        json.dumps(app_data, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (output_dir / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    build_sqlite(output_dir / "multihop.sqlite", questions, nodes, edges)
    return summary


def build_sqlite(db_path: Path, questions, nodes, edges):
    if db_path.exists():
        db_path.unlink()
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE questions (
            id TEXT PRIMARY KEY,
            type TEXT,
            question TEXT,
            answer TEXT
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE entities (
            id TEXT PRIMARY KEY,
            label TEXT,
            degree INTEGER
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE relations (
            id TEXT PRIMARY KEY,
            question_id TEXT,
            source TEXT,
            relation TEXT,
            target TEXT,
            hop INTEGER,
            type TEXT,
            cluster TEXT
        )
        """
    )

    cur.executemany(
        "INSERT INTO questions VALUES (?, ?, ?, ?)",
        [(q["id"], q["type"], q["question"], q["answer"]) for q in questions],
    )
    cur.executemany(
        "INSERT INTO entities VALUES (?, ?, ?)",
        [(node_id, node["label"], node["degree"]) for node_id, node in nodes.items()],
    )
    cur.executemany(
        "INSERT INTO relations VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [
            (
                edge["id"],
                edge["questionId"],
                edge["source"],
                edge["relation"],
                edge["target"],
                edge["hop"],
                edge["type"],
                edge["cluster"],
            )
            for edge in edges
        ],
    )
    conn.commit()
    conn.close()


def main():
    parser = argparse.ArgumentParser(description="Build web data for 2WikiMultihopQA demo.")
    parser.add_argument(
        "--source",
        default="datasets/2WikiMultihopQA/dev.parquet",
        help="Input parquet file.",
    )
    parser.add_argument("--output", default="web/data", help="Output data directory.")
    parser.add_argument("--sample-size", type=int, default=3000, help="Rows to export.")
    args = parser.parse_args()

    summary = build_data(Path(args.source), Path(args.output), args.sample_size)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
