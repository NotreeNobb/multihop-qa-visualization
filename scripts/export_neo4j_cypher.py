import argparse
import json
from pathlib import Path


def cypher_string(value):
    return json.dumps(str(value), ensure_ascii=False)


def write_neo4j_import(source_path: Path, output_path: Path, limit: int):
    data = json.loads(source_path.read_text(encoding="utf-8"))
    questions = data["questions"][:limit]

    lines = [
        "// Neo4j import script for 2WikiMultihopQA multi-hop evidence graph",
        "CREATE CONSTRAINT entity_name IF NOT EXISTS FOR (e:Entity) REQUIRE e.name IS UNIQUE;",
        "CREATE CONSTRAINT question_id IF NOT EXISTS FOR (q:Question) REQUIRE q.id IS UNIQUE;",
        "",
    ]

    for item in questions:
        qid = cypher_string(item["id"])
        qtype = cypher_string(item["type"])
        question = cypher_string(item["question"])
        answer = cypher_string(item["answer"])
        lines.append(
            f"MERGE (q:Question {{id: {qid}}}) "
            f"SET q.type = {qtype}, q.text = {question}, q.answer = {answer};"
        )

        for hop in item["chain"]:
            source = cypher_string(hop["source"])
            target = cypher_string(hop["target"])
            relation = cypher_string(hop["relation"])
            cluster = cypher_string(hop["cluster"])
            hop_index = int(hop["hop"])

            lines.extend(
                [
                    f"MERGE (s:Entity {{name: {source}}});",
                    f"MERGE (t:Entity {{name: {target}}});",
                    (
                        "MATCH "
                        f"(s:Entity {{name: {source}}}), "
                        f"(t:Entity {{name: {target}}}), "
                        f"(q:Question {{id: {qid}}}) "
                        f"MERGE (s)-[r:RELATED_TO {{question_id: {qid}, hop: {hop_index}}}]->(t) "
                        f"SET r.relation = {relation}, r.cluster = {cluster};"
                    ),
                    (
                        f"MATCH (q:Question {{id: {qid}}}), (s:Entity {{name: {source}}}) "
                        "MERGE (q)-[:ASKS_ABOUT]->(s);"
                    ),
                    (
                        f"MATCH (q:Question {{id: {qid}}}), (t:Entity {{name: {target}}}) "
                        "MERGE (q)-[:ASKS_ABOUT]->(t);"
                    ),
                ]
            )
        lines.append("")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(lines), encoding="utf-8")
    return {
        "questions": len(questions),
        "output": str(output_path),
        "lines": len(lines),
    }


def main():
    parser = argparse.ArgumentParser(description="Export Neo4j Cypher import script.")
    parser.add_argument("--source", default="web/data/app_data.json")
    parser.add_argument("--output", default="web/data/neo4j_import.cypher")
    parser.add_argument("--limit", type=int, default=3000)
    args = parser.parse_args()

    summary = write_neo4j_import(Path(args.source), Path(args.output), args.limit)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
