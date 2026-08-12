import json
import re
from pathlib import Path

import pandas as pd

PROJECT = Path(".").resolve()
EXCEL = PROJECT / "novyi-tovar.xlsx"
PRODUCTS = PROJECT / "src" / "data" / "products.json"


def translit(text: str) -> str:
    table = {
        "а":"a","б":"b","в":"v","г":"g","ґ":"g","д":"d","е":"e","є":"ie",
        "ж":"zh","з":"z","и":"y","і":"i","ї":"i","й":"i","к":"k","л":"l",
        "м":"m","н":"n","о":"o","п":"p","р":"r","с":"s","т":"t","у":"u",
        "ф":"f","х":"h","ц":"ts","ч":"ch","ш":"sh","щ":"shch","ь":"",
        "ъ":"","ы":"y","э":"e","ю":"iu","я":"ia",
    }
    return "".join(table.get(c, c) for c in text.lower())


def slugify(text: str, used: set[str]) -> str:
    s = translit(text)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    s = s[:60] or "item"

    base = s
    slug = base
    n = 2

    while slug in used:
        slug = f"{base}-{n}"
        n += 1

    used.add(slug)
    return slug


def availability(value: str) -> str:
    v = str(value or "").strip().lower()

    mapping = {
        "в наявності": "in",
        "в наявности": "in",
        "наявний": "in",
        "під замовлення": "order",
        "под заказ": "order",
        "немає": "out",
        "нема": "out",
        "відсутній": "out",
    }

    return mapping.get(v, "order")


def condition(value: str) -> str:
    v = str(value or "").strip().lower()

    mapping = {
        "нове": "new",
        "нова": "new",
        "новий": "new",
        "б/у": "used",
        "бу": "used",
    }

    return mapping.get(v, "new")


df = pd.read_excel(EXCEL)

with PRODUCTS.open("r", encoding="utf-8") as f:
    old_products = json.load(f)

# Старые фотографии индексируем по названию.
old_images = {}

for product in old_products:
    name = str(product.get("name", "")).strip().lower()
    image = product.get("image", "")

    if name and image:
        old_images[name] = image

used_slugs = set()
products = []

for index, row in df.iterrows():
    name = str(row.get("Назва", "") or "").strip()

    if not name:
        continue

    brand = str(row.get("Бренд", "") or "").strip()

    price_raw = str(row.get("Ціна", "") or "").replace(",", ".").strip()

    if price_raw:
        try:
            price = round(float(price_raw))
            price_on_request = False
        except ValueError:
            price = 0
            price_on_request = True
    else:
        price = 0
        price_on_request = True

    old_image = old_images.get(name.lower())

    if old_image:
        image = old_image
    else:
        image = "/products/placeholder.svg"

    products.append({
        "id": str(index + 1),
        "slug": slugify(name, used_slugs),
        "name": name,
        "category": "",
        "subcategory": "",
        "brand": brand,
        "condition": condition(row.get("Стан", "")),
        "price": price,
        "priceOnRequest": price_on_request,
        "cost": price,
        "availability": availability(row.get("Наявність", "")),
        "warranty": str(row.get("Гарантія", "") or "").strip() or None,
        "image": image,
        "description": str(row.get("Опис", "") or "").strip() or name,
    })


PRODUCTS.write_text(
    json.dumps(products, ensure_ascii=False, indent=2),
    encoding="utf-8"
)

print(f"Готово: записано {len(products)} товаров.")
print(f"Файл: {PRODUCTS}")
 


