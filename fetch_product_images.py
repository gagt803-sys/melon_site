#!/usr/bin/env python3
"""
Автоматическая загрузка фото товаров из Excel для сайта Masterskaya.

Что делает:
1. Читает Excel с каталогом товаров.
2. Ищет изображения по бренду + названию модели.
3. Проверяет, что URL действительно возвращает изображение.
4. Сохраняет фото в public/products/.
5. Обновляет поле image в src/data/products.json для совпавших товаров.
6. Создаёт photos_report.xlsx с результатами.

Запуск из корня проекта:
    python fetch_product_images.py --excel novyi-tovar.xlsx

Для поиска используется пакет ddgs:
    pip install -U ddgs pandas openpyxl requests pillow rapidfuzz
"""

from __future__ import annotations

import argparse
import io
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

import pandas as pd
import requests
from PIL import Image
from rapidfuzz import fuzz

try:
    from ddgs import DDGS
except ImportError:
    print("Не найден пакет ddgs. Установи зависимости: pip install -U ddgs pandas openpyxl requests pillow rapidfuzz")
    raise

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/127 Safari/537.36"
HEADERS = {"User-Agent": USER_AGENT, "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"}
MIN_WIDTH = 180
MIN_HEIGHT = 180
TIMEOUT = 15


def norm(value: object) -> str:
    s = str(value or "").lower().strip()
    # Keep model characters/digits; Ukrainian/Russian text is intentionally retained.
    s = re.sub(r"[\"'’`]+", "", s)
    s = re.sub(r"[^\w\s.-]+", " ", s, flags=re.UNICODE)
    s = re.sub(r"\s+", " ", s)
    return s


def slugify(value: str) -> str:
    s = norm(value)
    s = s.replace(" ", "-")
    s = re.sub(r"[^\w.-]+", "-", s, flags=re.UNICODE)
    s = re.sub(r"-+", "-", s).strip("-.")
    return s[:140] or "product"


def model_tokens(name: str) -> list[str]:
    # Extract useful model-like tokens: letters/numbers combinations such as X88, BX110, J101A.
    tokens = re.findall(r"[A-Za-zА-Яа-яІіЇїЄєҐґ]*\d+[A-Za-zА-Яа-яІіЇїЄєҐґ0-9-]*", name)
    return [t.lower() for t in tokens if len(t) >= 2]


def build_query(row: pd.Series) -> str:
    brand = str(row.get("Бренд", "") or "").strip()
    name = str(row.get("Назва", "") or "").strip()
    models = model_tokens(name)
    if models:
        # Model + brand gives much cleaner image results than the entire marketing title.
        return " ".join([brand] + models[:4]).strip()
    return " ".join([brand, name]).strip()


def verify_image(url: str) -> tuple[bytes | None, str | None, tuple[int, int] | None]:
    try:
        r = requests.get(url, headers=HEADERS, timeout=TIMEOUT, allow_redirects=True)
        if r.status_code != 200 or not r.content:
            return None, None, None
        content_type = (r.headers.get("Content-Type") or "").lower()
        # Some CDNs omit Content-Type, so PIL verification is the final authority.
        try:
            with Image.open(io.BytesIO(r.content)) as im:
                width, height = im.size
                if width < MIN_WIDTH or height < MIN_HEIGHT:
                    return None, None, None
                fmt = (im.format or "JPEG").lower()
        except Exception:
            return None, None, None
        if fmt in {"jpeg", "jpg"}:
            ext = ".jpg"
        elif fmt == "png":
            ext = ".png"
        elif fmt == "webp":
            ext = ".webp"
        elif fmt in {"gif", "bmp", "tiff"}:
            ext = "." + fmt
        else:
            ext = ".jpg"
        return r.content, ext, (width, height)
    except requests.RequestException:
        return None, None, None


def result_score(result: dict, row: pd.Series) -> float:
    title = norm(result.get("title", ""))
    query = norm(build_query(row))
    name = norm(row.get("Назва", ""))
    score = fuzz.token_set_ratio(query, title) * 0.5 + fuzz.partial_ratio(name, title) * 0.5
    # Strong bonus when the exact model token occurs in the result title.
    for tok in model_tokens(str(row.get("Назва", ""))):
        if tok in title:
            score += 8
    return min(score, 100)


def find_image(ddgs: DDGS, row: pd.Series) -> dict | None:
    query = build_query(row)
    # First try exact model-oriented query, then a broader product query.
    queries = [f'"{query}" product', query, str(row.get("Назва", ""))]
    seen = set()
    candidates = []
    for q in queries:
        try:
            results = ddgs.images(q, max_results=10, safesearch="moderate")
            for item in results:
                url = item.get("image") or item.get("thumbnail")
                if not url or url in seen:
                    continue
                seen.add(url)
                item["_score"] = result_score(item, row)
                candidates.append(item)
        except Exception as exc:
            print(f"  search error: {exc}")
        if candidates:
            # Usually enough; further queries are just backup.
            break

    candidates.sort(key=lambda x: x.get("_score", 0), reverse=True)
    for item in candidates:
        url = item.get("image") or item.get("thumbnail")
        data, ext, size = verify_image(url)
        if data is not None:
            return {
                "url": url,
                "data": data,
                "ext": ext,
                "size": size,
                "score": item.get("_score", 0),
                "source": item.get("url", ""),
                "title": item.get("title", ""),
                "query": query,
            }
    return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--excel", required=True, help="Путь к Excel каталога")
    parser.add_argument("--project", default=".", help="Корень Astro-проекта")
    parser.add_argument("--delay", type=float, default=0.8, help="Пауза между товарами")
    parser.add_argument("--min-score", type=float, default=55, help="Минимальный score автоматического совпадения")
    args = parser.parse_args()

    project = Path(args.project).resolve()
    excel_path = Path(args.excel).resolve()
    products_path = project / "src" / "data" / "products.json"
    images_dir = project / "public" / "products"
    images_dir.mkdir(parents=True, exist_ok=True)

    df = pd.read_excel(excel_path)
    required = {"Назва", "Бренд"}
    missing = required - set(df.columns)
    if missing:
        raise SystemExit(f"В Excel отсутствуют колонки: {', '.join(sorted(missing))}")

    with products_path.open("r", encoding="utf-8") as f:
        products = json.load(f)

    # Match current site's products to Excel rows by model/brand, not by exact full title.
    for p in products:
        p["_norm_name"] = norm(p.get("name", ""))
        p["_norm_brand"] = norm(p.get("brand", ""))

    # Existing filename index to avoid duplicates.
    existing = {}
    for p in products:
        image = p.get("image", "")
        if image:
            existing[norm(p.get("name", ""))] = image

    ddgs = DDGS()
    rows = []

    for i, row in df.iterrows():
        name = str(row.get("Назва", "") or "").strip()
        brand = str(row.get("Бренд", "") or "").strip()
        print(f"[{i+1}/{len(df)}] {name}")

        # Best existing-site match, useful when the product already exists under a slightly different title.
        n = norm(name)
        b = norm(brand)
        best = None
        best_score = 0
        for p in products:
            s = fuzz.token_set_ratio(n, p["_norm_name"])
            if b and p["_norm_brand"] and b == p["_norm_brand"]:
                s += 8
            for tok in model_tokens(name):
                if tok in p["_norm_name"]:
                    s += 6
            if s > best_score:
                best_score, best = s, p

        found = None
        if best and best_score >= 82 and best.get("image"):
            local = project / "public" / best["image"].lstrip("/")
            if local.exists():
                rows.append({
                    "row": i + 2, "Назва": name, "Бренд": brand,
                    "status": "reused_existing", "score": round(best_score, 1),
                    "image_url": "", "local_image": best["image"],
                    "source": "existing_site"
                })
                if "_norm_name" in best: pass
                time.sleep(args.delay)
                continue

        found = find_image(ddgs, row)
        if found and found["score"] >= args.min_score:
            filename = f"{slugify(name)}{found['ext']}"
            out = images_dir / filename
            out.write_bytes(found["data"])
            image_path = f"/products/{filename}"

            # Update the closest existing product only when confidence is high.
            if best and best_score >= 82:
                best["image"] = image_path
                target_id = best.get("id", "")
            else:
                target_id = ""

            rows.append({
                "row": i + 2, "Назва": name, "Бренд": brand,
                "status": "downloaded", "score": round(found["score"], 1),
                "image_url": found["url"], "local_image": image_path,
                "source": found["source"], "matched_product_id": target_id,
                "search_title": found["title"], "dimensions": str(found["size"])
            })
        else:
            rows.append({
                "row": i + 2, "Назва": name, "Бренд": brand,
                "status": "needs_review", "score": round(found["score"], 1) if found else 0,
                "image_url": found["url"] if found else "", "local_image": "",
                "source": found["source"] if found else "",
                "search_title": found["title"] if found else ""
            })

        time.sleep(args.delay)

    # Remove helper fields before writing JSON.
    for p in products:
        p.pop("_norm_name", None)
        p.pop("_norm_brand", None)

    products_path.write_text(json.dumps(products, ensure_ascii=False, indent=2), encoding="utf-8")

    report = pd.DataFrame(rows)
    report_path = project / "photos_report.xlsx"
    report.to_excel(report_path, index=False)

    print("\nГотово.")
    print(f"Фото/пути обработаны: {len(rows)}")
    print(f"Скачано: {(report.status == 'downloaded').sum()}")
    print(f"Переиспользовано из проекта: {(report.status == 'reused_existing').sum()}")
    print(f"На ручную проверку: {(report.status == 'needs_review').sum()}")
    print(f"Отчёт: {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
