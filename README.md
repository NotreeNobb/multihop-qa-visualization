# Multi-hop QA Knowledge Explorer

基于 2WikiMultihopQA 的多跳问答知识检索与可视化系统。

## 功能

- 自然语言问答检索
- 问题、答案、实体、关系统一检索
- 多跳推理路径可视化
- 问题类型聚类
- 关系语义聚类
- 高频关系统计

## 数据库设计

课程数据库选型采用 Neo4j 图数据库思路。原始数据中的 `evidences` 字段被建模为实体关系三元组：

```text
Entity --[relation]--> Entity
```

项目中提供了 Neo4j Cypher 导入脚本：

```text
web/data/neo4j_import.cypher
```

GitHub Pages 只支持静态网页，因此线上展示使用预处理后的 JSON 索引：

```text
docs/data/app_data.json
```

## 本地运行

```powershell
python -m http.server 8000 --directory web
```

访问：

```text
http://localhost:8000
```

## GitHub Pages

发布目录：

```text
docs/
```

仓库设置中选择：

```text
Settings -> Pages -> Deploy from a branch -> main -> /docs
```

## 演示问题

```text
Who is the mother of the director of film Polish-Russian War?
Which film came out first, Blind Shaft or The Mask Of Fu Manchu?
When did John V, Prince Of Anhalt-Zerbst's father die?
Where was the director of film Ronnie Rocket born?
```
