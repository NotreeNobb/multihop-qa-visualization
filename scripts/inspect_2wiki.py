import pandas as pd
import json
from pathlib import Path
from pprint import pprint

# =========================
# 1. 路径设置
# =========================
project_root = Path(__file__).resolve().parent.parent
data_path = project_root / "datasets" / "2WikiMultihopQA" / "dev.parquet"

print("=" * 80)
print("正在读取文件：", data_path)
print("=" * 80)

# =========================
# 2. 读取 parquet
# =========================
df = pd.read_parquet(data_path)

# =========================
# 3. 基本信息
# =========================
print("\n【1】数据集形状")
print(df.shape)

print("\n【2】字段名称")
print(df.columns.tolist())

print("\n【3】字段类型")
print(df.dtypes)

# =========================
# 4. 查看第一条样本
# =========================
row = df.iloc[0]

print("\n" + "=" * 80)
print("【4】第一条样本：核心字段")
print("=" * 80)

for field in ["_id", "question", "answer", "type"]:
    print(f"\n{field}:")
    print(row[field])

# =========================
# 5. JSON 字符串解析
# =========================
evidences = json.loads(row["evidences"])
supporting_facts = json.loads(row["supporting_facts"])
context = json.loads(row["context"])

# =========================
# 6. 查看 evidences
# =========================
print("\n" + "=" * 80)
print("【5】evidences 字段：用于构造实体关系图")
print("=" * 80)
pprint(evidences)

print("\n【5.1】将 evidences 转成易读推理链：")
for i, triple in enumerate(evidences, start=1):
    subject, relation, obj = triple
    print(f"第{i}跳：{subject} --[{relation}]--> {obj}")

# =========================
# 7. 查看 supporting_facts
# =========================
print("\n" + "=" * 80)
print("【6】supporting_facts 字段")
print("=" * 80)
pprint(supporting_facts)

# =========================
# 8. 查看 context 前两个文档
# =========================
print("\n" + "=" * 80)
print("【7】context 字段前两个文档")
print("=" * 80)

# context 的实际结构通常是：
# {
#   "title": [...],
#   "sentences": [...]
# }

for i in range(min(2, len(context["title"]))):
    print(f"\n文档 {i + 1}:")
    print("标题：", context["title"][i])
    print("句子：")
    for j, sentence in enumerate(context["sentences"][i], start=0):
        print(f"  [{j}] {sentence}")

# =========================
# 9. 查看 type 分布
# =========================
print("\n" + "=" * 80)
print("【8】dev 集 type 分布")
print("=" * 80)
print(df["type"].value_counts())

# =========================
# 10. 补充：答案示例和问题长度
# =========================
print("\n" + "=" * 80)
print("【9】前 5 条问题与答案")
print("=" * 80)

for idx, sample in df.head(5).iterrows():
    print(f"\n样本 {idx + 1}")
    print("问题：", sample["question"])
    print("答案：", sample["answer"])
    print("类型：", sample["type"])

print("\n检查完成。")
