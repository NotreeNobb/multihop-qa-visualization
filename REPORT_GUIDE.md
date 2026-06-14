# 基于 Neo4j 的多跳问答知识图谱系统报告指南

## 1. 项目主题

本项目基于 2WikiMultihopQA 数据集，选择 Neo4j 图数据库进行建模，构建支持多跳过程查询、检索、简单聚类和可视化的网页系统。

推荐标题：

```text
基于 Neo4j 的多跳问答知识图谱检索与可视化系统
```

## 2. 为什么选择 Neo4j

2WikiMultihopQA 的 `evidences` 字段天然是实体关系三元组：

```text
实体 --[关系]--> 实体
```

例如：

```text
Polish-Russian War --[director]--> Xawery Żuławski
Xawery Żuławski --[mother]--> Małgorzata Braunek
```

这类数据最适合使用图数据库 Neo4j 表达。Neo4j 可以直接存储实体节点、关系边和多跳路径，便于实现路径查询、关系检索和知识图谱可视化。

## 3. 技术路线

```text
2WikiMultihopQA parquet 原始数据
  -> Python 读取和清洗 evidences 三元组
  -> 构建 Neo4j 图模型
  -> 生成 Cypher 导入脚本
  -> 导出 JSON 前端索引
  -> GitHub Pages 静态网页展示
```

核心文件：

```text
datasets/2WikiMultihopQA/dev.parquet
scripts/build_web_data.py
scripts/export_neo4j_cypher.py
web/data/neo4j_import.cypher
web/data/app_data.json
web/index.html
web/src/main.js
web/src/style.css
```

## 4. Neo4j 图模型设计

节点：

```text
(:Entity {name})
(:Question {id, text, answer, type})
```

关系：

```text
(:Entity)-[:RELATED_TO {
  relation,
  question_id,
  hop,
  cluster
}]->(:Entity)

(:Question)-[:ASKS_ABOUT]->(:Entity)
```

示例路径：

```text
(Polish-Russian War)-[:RELATED_TO {relation:"director"}]->(Xawery Żuławski)
(Xawery Żuławski)-[:RELATED_TO {relation:"mother"}]->(Małgorzata Braunek)
```

## 5. Cypher 查询示例

查询某个实体出发的两跳路径：

```cypher
MATCH p=(a:Entity)-[:RELATED_TO*1..2]->(b:Entity)
WHERE a.name CONTAINS "Polish-Russian War"
RETURN p
LIMIT 10;
```

查询包含 director 关系的问题：

```cypher
MATCH (a:Entity)-[r:RELATED_TO]->(b:Entity)
WHERE r.relation = "director"
RETURN a.name, r.relation, b.name, r.question_id
LIMIT 20;
```

查询某个问题的完整推理链：

```cypher
MATCH p=(a:Entity)-[r:RELATED_TO]->(b:Entity)
WHERE r.question_id = "8813f87c0bdd11eba7f7acde48001122"
RETURN p
ORDER BY r.hop;
```

## 6. 聚类方法

问题类型聚类：

```text
compositional
comparison
bridge_comparison
inference
```

关系语义聚类：

```text
作品创作：director, producer, writer
人物亲属：mother, father, spouse
地理位置：country, place of birth, place of death
时间日期：date of birth, date of death, publication date
组织机构：member, employer, founded
```

## 7. 建议截图顺序

1. 项目文件结构  
   展示 `datasets`、`scripts`、`web`。

2. 生成网页数据  
   运行：

```powershell
$env:PYTHONIOENCODING='utf-8'; python scripts\build_web_data.py --sample-size 3000
```

3. 生成 Neo4j Cypher 脚本  
   运行：

```powershell
$env:PYTHONIOENCODING='utf-8'; python scripts\export_neo4j_cypher.py --limit 3000
```

4. 系统首页  
   打开：

```text
http://localhost:8000
```

5. 问答助手演示  
   输入：

```text
Who is the mother of the director of film Polish-Russian War?
```

6. 多跳路径可视化  
   展示：

```text
Polish-Russian War --[director]--> Xawery Żuławski
Xawery Żuławski --[mother]--> Małgorzata Braunek
```

7. 关键词检索  
   搜索：

```text
director
```

8. 聚类与高频关系  
   截右侧“问题类型聚类、关系语义聚类、高频关系”。

## 8. 本地运行命令

生成网页数据：

```powershell
$env:PYTHONIOENCODING='utf-8'; python scripts\build_web_data.py --sample-size 3000
```

生成 Neo4j 导入脚本：

```powershell
$env:PYTHONIOENCODING='utf-8'; python scripts\export_neo4j_cypher.py --limit 3000
```

启动网页：

```powershell
python -m http.server 8000 --directory web
```

浏览器访问：

```text
http://localhost:8000
```

## 9. GitHub Pages 部署说明

由于 GitHub Pages 不能直接运行 Neo4j 服务，本项目采用：

```text
Neo4j 作为数据库建模与本地导入方案
JSON 作为前端静态索引
GitHub Pages 作为网页展示平台
```

这样既能体现图数据库设计，又能保证老师打开网页链接即可查看系统。

## 10. 可写进报告的创新点

- 从课程给定数据库中选择 Neo4j，与多跳关系数据高度匹配。
- 将 evidence triples 转换为 Neo4j 图模型。
- 生成可导入 Neo4j 的 Cypher 脚本。
- 支持聊天式问答、实体检索、关系检索和问题类型筛选。
- 支持多跳路径 SVG 可视化。
- 支持问题类型聚类和关系语义聚类。
