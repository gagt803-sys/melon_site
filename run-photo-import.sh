#!/usr/bin/env bash
set -e
python3 -m pip install -U ddgs pandas openpyxl requests pillow rapidfuzz
python3 fetch_product_images.py --excel novyi-tovar.xlsx --project .
