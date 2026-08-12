#!/usr/bin/env python3
"""
Привязывает уже скачанные фотографии из photos_report.xlsx
к 182 товарам в src/data/products.json.

Ничего не скачивает заново и не меняет остальные поля товаров.
"""

from pathlib import Path
import json
import pandas as pd

ROOT = Path(__file__).resolve().parent
REPORT = ROOT / "photos_report.xlsx"
PRODUCTS = ROOT / "src" / "data" / "products.json"

df = pd.read_excel(REPORT)

with PRODUCTS.open("r", encoding="utf-8") as f:
    products = json.load(f)

index = {
    (str(p.get("name", "")).strip().lower(),
     str(p.get("brand", "")).strip().lower()): i
    for i, p in enumerate(products)
}

updated = 0
review = 0

for _, row in df.iterrows():
    status = str(row.get("status", ""))
    local_image = row.get("local_image")

    key = (
        str(row.get("Назва", "")).strip().lower(),
        str(row.get("Бренд", "")).strip().lower(),
    )

    if status in ("downloaded", "reused_existing") and pd.notna(local_image):
        if key in index:
            products[index[key]]["image"] = str(local_image).strip()
            updated += 1
    elif status == "needs_review":
        review += 1

PRODUCTS.write_text(
    json.dumps(products, ensure_ascii=False, indent=2),
    encoding="utf-8"
)

print(f"Готово. Привязано фотографий: {updated}")
print(f"Оставлено на ручную проверку: {review}")
print(f"Всего товаров: {len(products)}")
