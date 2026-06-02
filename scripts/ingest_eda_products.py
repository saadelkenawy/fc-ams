#!/usr/bin/env python3
"""
EDA Products Dictionary Ingester
---------------------------------
Loads Egyptian Drug Authority product registry into products_dictionary.

Supported input formats:
  - CSV  (UTF-8 or Windows-1256 with BOM)
  - JSON (array of objects or {"products": [...]} wrapper)
  - Excel (.xlsx / .xls) — requires: pip install pandas openpyxl

Usage:
  EHR_DATABASE_URL=postgres://user:pass@host/fadl_ehr \\
      python ingest_eda_products.py eda_registry.xlsx

  python ingest_eda_products.py eda_registry.csv \\
      --dsn postgres://user:pass@localhost/fadl_ehr \\
      --dry-run

After ingestion, run the reconciliation script to backfill product_id on
existing prescription_items:
  psql $EHR_DATABASE_URL -f scripts/reconcile_medication_dict.sql

Dependencies:
  pip install psycopg2-binary
  pip install pandas openpyxl   # only for Excel input
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import psycopg2
import psycopg2.extras

try:
    import pandas as pd
    HAS_PANDAS = True
except ImportError:
    HAS_PANDAS = False

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("ingest_eda.log", encoding="utf-8"),
    ],
)
log = logging.getLogger(__name__)

# ── Arabic normalization ──────────────────────────────────────────────────────
# Must match normalize_arabic() in V003 SQL migration exactly.

_ARABIC_TRANS = str.maketrans(
    {
        "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا",  # alef forms
        "ة": "ه",                                    # ta marbuta
        "ى": "ي",                                    # alef maqsura
        "ـ": "",                                     # tatweel
    }
)
_DIACRITICS_RE = re.compile(r"[ً-ٰٱ-ۿ&&[ً-ٰ]]")
# Simpler: harakat are U+064B–U+065F, superscript alef is U+0670
_HARAKAT_RE = re.compile(r"[ً-ٰ]")


def normalize_arabic(text: Optional[str]) -> Optional[str]:
    if not text:
        return None
    text = text.translate(_ARABIC_TRANS)
    text = _HARAKAT_RE.sub("", text)
    return text.strip() or None


# ── Column mapping ────────────────────────────────────────────────────────────
# Maps EDA Excel/CSV header variants to ProductRow field names.
# Add new variants here as you encounter different EDA file formats.

COLUMN_MAP: dict[str, str] = {
    "Trade Name":                    "trade_name_en",
    "Trade Name (EN)":               "trade_name_en",
    "Product Name":                  "trade_name_en",
    "Trade Name Arabic":             "trade_name_ar",
    "Trade Name (Arabic)":           "trade_name_ar",
    "Trade Name (AR)":               "trade_name_ar",
    "الاسم التجاري":                  "trade_name_ar",
    "Generic Name":                  "generic_name_en",
    "Scientific Name":               "generic_name_en",
    "Active Ingredient":             "generic_name_en",
    "Generic Name (Arabic)":         "generic_name_ar",
    "الاسم العلمي":                   "generic_name_ar",
    "Registration No":               "registration_number",
    "Registration Number":           "registration_number",
    "Reg. No":                       "registration_number",
    "Reg No":                        "registration_number",
    "رقم التسجيل":                    "registration_number",
    "Barcode":                       "barcode",
    "EAN":                           "barcode",
    "GTIN":                          "barcode",
    "Manufacturer":                  "manufacturer_en",
    "Company":                       "manufacturer_en",
    "Company Name":                  "manufacturer_en",
    "Manufacturer (Arabic)":         "manufacturer_ar",
    "Company (Arabic)":              "manufacturer_ar",
    "الشركة المصنعة":                 "manufacturer_ar",
    "Country":                       "country_of_origin",
    "Country of Origin":             "country_of_origin",
    "Country of Manufacture":        "country_of_origin",
    "Strength":                      "strength",
    "Dosage Strength":               "strength",
    "Dosage Form":                   "form_code",
    "Form":                          "form_code",
    "الشكل الدوائي":                  "form_code",
    "Route":                         "administration_route",
    "Administration Route":          "administration_route",
    "Route of Administration":       "administration_route",
    "ATC Code":                      "atc_code",
    "ATC":                           "atc_code",
    "Therapeutic Class":             "therapeutic_class",
    "Prescription Required":         "prescription_required",
    "OTC":                           "_otc",
    "Status":                        "status",
    "Type":                          "product_type",
    "Product Type":                  "product_type",
}

# ── Form code normalization ───────────────────────────────────────────────────
# Maps free-text form names (EN + AR) to product_forms.code values from V003.

FORM_MAP: dict[str, str] = {
    "tablet": "tab", "tablets": "tab", "tab": "tab", "قرص": "tab", "أقراص": "tab",
    "capsule": "cap", "capsules": "cap", "cap": "cap", "كبسولة": "cap", "كبسولات": "cap",
    "syrup": "syr", "syr": "syr", "شراب": "syr",
    "suspension": "susp", "susp": "susp", "معلق": "susp",
    "solution": "sol", "sol": "sol", "محلول": "sol",
    "injection": "inj", "inj": "inj", "حقنة": "inj", "حقن": "inj",
    "infusion": "inf", "inf": "inf", "تسريب": "inf",
    "drops": "gtt", "eye drops": "gtt", "ear drops": "gtt", "gtt": "gtt", "نقط": "gtt",
    "inhaler": "inh", "بخاخ": "inh",
    "patch": "patch", "transdermal patch": "patch", "لاصقة": "patch",
    "suppository": "supp", "suppositories": "supp", "تحميلة": "supp",
    "granules": "gran", "granule": "gran", "حبيبات": "gran",
    "cream": "crm", "كريم": "crm",
    "ointment": "oint", "مرهم": "oint",
    "gel": "gel", "جل": "gel",
    "lotion": "lot", "لوشن": "lot",
    "spray": "spray",
    "powder": "pdr", "مسحوق": "pdr",
    "oil": "oil", "زيت": "oil",
    "shampoo": "sham", "شامبو": "sham",
    "foam": "foam", "رغوة": "foam",
    "mask": "mask", "قناع": "mask",
    "toner": "toner",
    "serum": "ser", "سيروم": "ser",
}


def normalize_form(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    return FORM_MAP.get(raw.strip().lower())


# ── Status / type normalization ───────────────────────────────────────────────

STATUS_MAP: dict[str, str] = {
    "active": "active", "نشط": "active", "registered": "active", "مسجل": "active",
    "suspended": "suspended", "موقوف": "suspended",
    "cancelled": "cancelled", "ملغي": "cancelled", "withdrawn": "cancelled",
    "recalled": "recalled", "مسحوب": "recalled",
}

TYPE_MAP: dict[str, str] = {
    "medicine": "medicine", "drug": "medicine", "pharmaceutical": "medicine", "دواء": "medicine",
    "cosmetic": "cosmetic", "cosmetics": "cosmetic", "تجميل": "cosmetic", "مستحضرات تجميل": "cosmetic",
}

# ── Data model ────────────────────────────────────────────────────────────────

@dataclass
class ProductRow:
    trade_name_en: str
    type: str                           # 'medicine' | 'cosmetic'
    trade_name_ar:       Optional[str] = None
    registration_number: Optional[str] = None
    barcode:             Optional[str] = None
    manufacturer_en:     Optional[str] = None
    manufacturer_ar:     Optional[str] = None
    country_of_origin:   Optional[str] = None
    status:              str = "active"
    # Medicine-specific
    generic_name_en:      Optional[str] = None
    generic_name_ar:      Optional[str] = None
    strength:             Optional[str] = None
    atc_code:             Optional[str] = None
    form_code:            Optional[str] = None
    administration_route: Optional[str] = None
    therapeutic_class:    Optional[str] = None
    prescription_required: bool = True
    controlled_substance:  bool = False
    # Internal
    anomalies: list[str] = field(default_factory=list)


# ── Row parsing ───────────────────────────────────────────────────────────────

def _clean(value) -> Optional[str]:
    if value is None:
        return None
    s = str(value).strip()
    # pandas NaN stringified
    if s.lower() in ("nan", "none", "", "n/a", "-"):
        return None
    return s


def parse_row(raw: dict, row_index: int) -> Optional[ProductRow]:
    # Map raw column headers to field names
    mapped: dict[str, str] = {}
    for raw_col, raw_val in raw.items():
        field_name = COLUMN_MAP.get(str(raw_col).strip())
        if field_name:
            mapped[field_name] = raw_val

    trade_name_en = _clean(mapped.get("trade_name_en"))
    if not trade_name_en:
        log.warning("Row %d: missing trade name — skipped", row_index)
        return None

    anomalies: list[str] = []
    reg_num = _clean(mapped.get("registration_number"))
    barcode = _clean(mapped.get("barcode"))
    if not reg_num and not barcode:
        anomalies.append("no_dedup_key")  # will be logged; row is still accepted

    # Product type
    raw_type = _clean(mapped.get("product_type")) or "medicine"
    product_type = TYPE_MAP.get(raw_type.lower(), "medicine")

    # Status
    raw_status = _clean(mapped.get("status")) or "active"
    status = STATUS_MAP.get(raw_status.lower(), "active")

    # Prescription required — infer from OTC flag if direct field absent
    pr_raw = mapped.get("prescription_required")
    otc_raw = mapped.get("_otc")
    if pr_raw is not None:
        s = str(pr_raw).strip().lower()
        prescription_required = s not in ("no", "false", "0", "لا", "otc")
    elif otc_raw is not None:
        s = str(otc_raw).strip().lower()
        prescription_required = s not in ("yes", "true", "1", "نعم")
    else:
        prescription_required = True

    # Country — keep only ISO-2 if a longer string is provided
    country = _clean(mapped.get("country_of_origin"))
    if country and len(country) > 2:
        # e.g. "Egypt (EG)" → "EG"
        match = re.search(r"\(([A-Z]{2})\)", country)
        if match:
            country = match.group(1)
        elif country[:2].isalpha():
            country = country[:2].upper()
        else:
            anomalies.append(f"country_not_normalized:{country}")
            country = None

    form_code = normalize_form(_clean(mapped.get("form_code")))

    generic_name_en = _clean(mapped.get("generic_name_en"))
    if product_type == "medicine" and not generic_name_en:
        anomalies.append("medicine_missing_generic_name")

    return ProductRow(
        trade_name_en=trade_name_en,
        trade_name_ar=_clean(mapped.get("trade_name_ar")),
        type=product_type,
        registration_number=reg_num,
        barcode=barcode,
        manufacturer_en=_clean(mapped.get("manufacturer_en")),
        manufacturer_ar=_clean(mapped.get("manufacturer_ar")),
        country_of_origin=country,
        status=status,
        generic_name_en=generic_name_en,
        generic_name_ar=_clean(mapped.get("generic_name_ar")),
        strength=_clean(mapped.get("strength")),
        atc_code=_clean(mapped.get("atc_code")),
        form_code=form_code,
        administration_route=_clean(mapped.get("administration_route")),
        therapeutic_class=_clean(mapped.get("therapeutic_class")),
        prescription_required=prescription_required,
        anomalies=anomalies,
    )


# ── File loaders ──────────────────────────────────────────────────────────────

def load_file(path: Path) -> list[dict]:
    suffix = path.suffix.lower()
    if suffix == ".csv":
        # Try UTF-8 first; fall back to Windows-1256 (common in EDA files)
        for enc in ("utf-8-sig", "windows-1256", "latin-1"):
            try:
                with open(path, newline="", encoding=enc) as f:
                    rows = list(csv.DictReader(f))
                log.info("Loaded CSV with encoding=%s (%d rows)", enc, len(rows))
                return rows
            except UnicodeDecodeError:
                continue
        raise ValueError(f"Cannot decode {path} — unknown encoding")
    if suffix == ".json":
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return data
        for key in ("products", "data", "items", "records"):
            if key in data:
                return data[key]
        raise ValueError("JSON root must be a list or have a known array key")
    if suffix in (".xlsx", ".xls"):
        if not HAS_PANDAS:
            raise RuntimeError("Excel support requires: pip install pandas openpyxl")
        df = pd.read_excel(path, dtype=str)
        return df.where(pd.notna(df), None).to_dict("records")
    raise ValueError(f"Unsupported file type: {suffix}")


# ── SQL statements ────────────────────────────────────────────────────────────

# Upsert on registration_number (primary dedup key).
# ON CONFLICT targets idx_prod_reg_num_uniq (partial unique index from V003).
_UPSERT_BY_REG = """
INSERT INTO products_dictionary (
    type, status,
    trade_name_en, trade_name_ar,
    registration_number, barcode,
    manufacturer_en, manufacturer_ar, country_of_origin,
    shelf_form_id,
    source, last_synced_at
) VALUES (
    %(type)s::product_type,
    %(status)s::product_status,
    %(trade_name_en)s, %(trade_name_ar)s,
    %(registration_number)s, %(barcode)s,
    %(manufacturer_en)s, %(manufacturer_ar)s, %(country_of_origin)s,
    (SELECT id FROM product_forms WHERE code = %(form_code)s),
    'eda_scraper', NOW()
)
ON CONFLICT (registration_number) WHERE registration_number IS NOT NULL
DO UPDATE SET
    trade_name_en       = EXCLUDED.trade_name_en,
    trade_name_ar       = EXCLUDED.trade_name_ar,
    status              = EXCLUDED.status,
    barcode             = COALESCE(EXCLUDED.barcode, products_dictionary.barcode),
    manufacturer_en     = EXCLUDED.manufacturer_en,
    manufacturer_ar     = EXCLUDED.manufacturer_ar,
    country_of_origin   = EXCLUDED.country_of_origin,
    shelf_form_id       = COALESCE(EXCLUDED.shelf_form_id, products_dictionary.shelf_form_id),
    last_synced_at      = NOW(),
    updated_at          = NOW()
RETURNING id
"""

# Upsert on barcode (fallback when no registration_number).
# ON CONFLICT targets idx_prod_barcode_uniq (partial unique index from V003).
_UPSERT_BY_BARCODE = """
INSERT INTO products_dictionary (
    type, status,
    trade_name_en, trade_name_ar,
    registration_number, barcode,
    manufacturer_en, manufacturer_ar, country_of_origin,
    shelf_form_id,
    source, last_synced_at
) VALUES (
    %(type)s::product_type,
    %(status)s::product_status,
    %(trade_name_en)s, %(trade_name_ar)s,
    %(registration_number)s, %(barcode)s,
    %(manufacturer_en)s, %(manufacturer_ar)s, %(country_of_origin)s,
    (SELECT id FROM product_forms WHERE code = %(form_code)s),
    'eda_scraper', NOW()
)
ON CONFLICT (barcode) WHERE barcode IS NOT NULL
DO UPDATE SET
    trade_name_en       = EXCLUDED.trade_name_en,
    trade_name_ar       = EXCLUDED.trade_name_ar,
    status              = EXCLUDED.status,
    registration_number = COALESCE(EXCLUDED.registration_number, products_dictionary.registration_number),
    manufacturer_en     = EXCLUDED.manufacturer_en,
    manufacturer_ar     = EXCLUDED.manufacturer_ar,
    country_of_origin   = EXCLUDED.country_of_origin,
    shelf_form_id       = COALESCE(EXCLUDED.shelf_form_id, products_dictionary.shelf_form_id),
    last_synced_at      = NOW(),
    updated_at          = NOW()
RETURNING id
"""

_UPSERT_METADATA = """
INSERT INTO medicines_metadata (
    product_id,
    generic_name_en, generic_name_ar,
    strength, atc_code,
    form_id, administration_route,
    therapeutic_class,
    prescription_required, controlled_substance
) VALUES (
    %(product_id)s,
    %(generic_name_en)s, %(generic_name_ar)s,
    %(strength)s, %(atc_code)s,
    (SELECT id FROM product_forms WHERE code = %(form_code)s),
    %(administration_route)s,
    %(therapeutic_class)s,
    %(prescription_required)s, %(controlled_substance)s
)
ON CONFLICT (product_id) DO UPDATE SET
    generic_name_en      = EXCLUDED.generic_name_en,
    generic_name_ar      = EXCLUDED.generic_name_ar,
    strength             = COALESCE(EXCLUDED.strength, medicines_metadata.strength),
    atc_code             = COALESCE(EXCLUDED.atc_code, medicines_metadata.atc_code),
    form_id              = COALESCE(EXCLUDED.form_id, medicines_metadata.form_id),
    administration_route = EXCLUDED.administration_route,
    therapeutic_class    = EXCLUDED.therapeutic_class,
    prescription_required = EXCLUDED.prescription_required
"""


# ── Ingester ──────────────────────────────────────────────────────────────────

class EDAIngester:
    def __init__(self, dsn: str, dry_run: bool = False):
        self.dsn = dsn
        self.dry_run = dry_run
        self.stats = {
            "total_rows":  0,
            "parsed":      0,
            "upserted":    0,
            "skipped":     0,
            "db_errors":   0,
            "parse_errors": 0,
        }
        self._anomalies: list[dict] = []

    def run(self, path: Path, batch_size: int = 500) -> dict:
        raw_rows = load_file(path)
        log.info("Loaded %d raw rows from %s", len(raw_rows), path)
        self.stats["total_rows"] = len(raw_rows)

        products: list[ProductRow] = []
        for i, raw in enumerate(raw_rows, start=1):
            try:
                row = parse_row(raw, i)
                if row is None:
                    self.stats["skipped"] += 1
                    continue
                if row.anomalies:
                    self._anomalies.append(
                        {"row": i, "name": row.trade_name_en, "issues": row.anomalies}
                    )
                products.append(row)
                self.stats["parsed"] += 1
            except Exception as exc:
                log.error("Row %d parse error: %s", i, exc, exc_info=True)
                self.stats["parse_errors"] += 1

        log.info("Parsed %d valid products (%d skipped, %d errors)",
                 self.stats["parsed"], self.stats["skipped"], self.stats["parse_errors"])

        if self.dry_run:
            log.info("DRY RUN — no database writes performed")
            self._dump_anomalies()
            return self.stats

        conn = psycopg2.connect(self.dsn)
        try:
            for start in range(0, len(products), batch_size):
                batch = products[start : start + batch_size]
                with conn:   # each batch is one transaction
                    self._upsert_batch(conn, batch)
                log.info("Committed batch %d–%d", start + 1, start + len(batch))
        finally:
            conn.close()

        log.info("Refreshing product_search_index materialized view…")
        self._refresh_view()

        self._dump_anomalies()
        log.info("Final stats: %s", self.stats)
        return self.stats

    def _upsert_batch(self, conn, batch: list[ProductRow]):
        with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
            for product in batch:
                params = {
                    "type":                product.type,
                    "status":              product.status,
                    "trade_name_en":       product.trade_name_en,
                    "trade_name_ar":       product.trade_name_ar,
                    "registration_number": product.registration_number,
                    "barcode":             product.barcode,
                    "manufacturer_en":     product.manufacturer_en,
                    "manufacturer_ar":     product.manufacturer_ar,
                    "country_of_origin":   product.country_of_origin,
                    "form_code":           product.form_code,
                }
                try:
                    if product.registration_number:
                        cur.execute(_UPSERT_BY_REG, params)
                    elif product.barcode:
                        cur.execute(_UPSERT_BY_BARCODE, params)
                    else:
                        log.debug(
                            "Skipping '%s' — no registration_number or barcode",
                            product.trade_name_en,
                        )
                        self.stats["skipped"] += 1
                        continue

                    row = cur.fetchone()
                    if not row:
                        continue
                    product_id = row["id"]
                    self.stats["upserted"] += 1

                    if product.type == "medicine" and product.generic_name_en:
                        cur.execute(_UPSERT_METADATA, {
                            "product_id":           product_id,
                            "generic_name_en":      product.generic_name_en,
                            "generic_name_ar":      product.generic_name_ar,
                            "strength":             product.strength,
                            "atc_code":             product.atc_code,
                            "form_code":            product.form_code,
                            "administration_route": product.administration_route,
                            "therapeutic_class":    product.therapeutic_class,
                            "prescription_required": product.prescription_required,
                            "controlled_substance":  product.controlled_substance,
                        })

                except psycopg2.Error as exc:
                    log.error(
                        "DB error for '%s' (reg=%s): %s",
                        product.trade_name_en,
                        product.registration_number,
                        exc,
                    )
                    self.stats["db_errors"] += 1
                    conn.rollback()

    def _refresh_view(self):
        try:
            conn = psycopg2.connect(self.dsn)
            conn.autocommit = True
            with conn.cursor() as cur:
                cur.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY product_search_index")
            conn.close()
            log.info("Materialized view refreshed")
        except Exception as exc:
            log.warning("Could not refresh materialized view: %s", exc)

    def _dump_anomalies(self):
        if not self._anomalies:
            return
        out = Path("ingest_anomalies.json")
        out.write_text(
            json.dumps(self._anomalies, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        log.warning("%d anomalous rows written to %s", len(self._anomalies), out)


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Ingest EDA product registry into products_dictionary"
    )
    parser.add_argument("file", type=Path, help="CSV, JSON, or Excel file")
    parser.add_argument(
        "--dsn",
        default=os.environ.get("EHR_DATABASE_URL"),
        help="PostgreSQL DSN (default: $EHR_DATABASE_URL)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse and validate only; do not write to the database",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=500,
        help="Rows per transaction (default: 500)",
    )
    args = parser.parse_args()

    if not args.dry_run and not args.dsn:
        parser.error("Set EHR_DATABASE_URL or pass --dsn")

    ingester = EDAIngester(dsn=args.dsn or "", dry_run=args.dry_run)
    ingester.run(args.file, batch_size=args.batch_size)


if __name__ == "__main__":
    main()
