# 🔄 Phase Zero — Excel to Production Migration Spec

> **Document Version:** 1.2  
> **Last Updated:** 2026-05-15  
> **Branch:** `main`  
> **Namespace:** `fadl-migration` (isolated from prod)  
> **Status:** Specification Complete — Platform live; Excel cutover pending 30-day parallel run  
> **Owner:** Saad

---

## 📋 Executive Summary

Phase Zero replaces Fadl Clinic's Excel-based operational system (`.xlsm` files) with the new microservices platform on OpenShift. This phase runs **before any production code deployment** and is the single most critical phase of the project — financial inaccuracy here would damage doctor trust and clinic revenue permanently.

**Hard validation gate:** Financial variance between Excel and the new system must be **< 0.01%** before cutover. **30-day parallel run** is mandatory. **Doctor sign-off** required on revenue split configurations.

This document covers:
1. Source data inventory from the actual `سعد_داتا_.xlsm` and `مرسل_لسعد.xlsm` files
2. Field-by-field mapping to the target schema (`database.md`)
3. Transformation rules including the **cash-flow directional DSL** parser
4. Data quality issues and cleansing rules
5. Special entity handling: settlements, vendor invoices, FOC transactions, refunds, reschedule backlogs
6. The migration pipeline runbook
7. Validation gates and reconciliation reports
8. Rollback procedure

---

## Table of Contents

1. [Source Data Inventory](#1-source-data-inventory)
2. [Target Schema Reference](#2-target-schema-reference)
3. [Field-by-Field Mapping](#3-field-by-field-mapping)
4. [Cash Flow Directional DSL Parser ⭐ CRITICAL](#4-cash-flow-directional-dsl-parser)
5. [Doctor Prefix Resolution (Op_ / Onl_)](#5-doctor-prefix-resolution)
6. [Mobile Number & POS Receipt Normalization](#6-mobile-number--pos-receipt-normalization)
7. [Special Entity Handling](#7-special-entity-handling)
8. [Data Quality Issues & Cleansing](#8-data-quality-issues--cleansing)
9. [Migration Pipeline Architecture](#9-migration-pipeline-architecture)
10. [Validation Gates](#10-validation-gates)
11. [30-Day Parallel Run Procedure](#11-30-day-parallel-run-procedure)
12. [Reconciliation Reports](#12-reconciliation-reports)
13. [Rollback Procedure](#13-rollback-procedure)
14. [Schema Updates Required](#14-schema-updates-required)
15. [Implementation Checklist](#15-implementation-checklist)

---

## 1. Source Data Inventory

### 1.1 Files Analyzed

| File | Sheets | Rows | Description |
|---|---|---|---|
| `مرسل_لسعد.xlsm` | MSR, Dr_Data, Lists, Dict. | ~50 sample | Initial sample sent for analysis |
| `سعد_داتا_.xlsm` | MSR, Dr_Data, Lists, Dict., حالات د سارة المؤجلة | **1,474 transactions + 153 doctors + 32 backlog** | Full operational dataset |

### 1.2 Sheet-by-Sheet Inventory

#### A. MSR (Master Sheet Record) — 1,474 rows × 28 columns

The clinic's primary transaction ledger. Each row is either:
- An **appointment** (`Entry = Appt.`) — patient visit with financial details
- A **cash-out event** (`Entry = C/O`) — doctor settlement, vendor invoice, salary payout
- A **cash-in event** (`Entry = C/I`) — payment receipt (less common standalone)

**Columns:**

| Excel Column | Description | Notes |
|---|---|---|
| `Date` | Transaction date | DateTime in Excel format |
| `Time` | Slot time | 20-min cadence: 9:00, 9:20, 9:40... |
| `2nd Party Nm.` | Patient name (or doctor name for C/O) | Mixed Arabic/English |
| `2nd Party Mob.` | Mobile number | Stored as integer — leading zeros lost |
| `Entry` | Record type | `Appt.` / `C/I` / `C/O` |
| `TBC! Pt.` | Patient confirmation status | TBC, Ok!, Conf., Comp., Canc., Resch., Inf. |
| `TBC! Dr.` | Doctor confirmation status | Same set |
| `C#` | **Clinic room number** | `#1`, `#2`, `D1`, `D2`, `D3`, `OL`, `NS` |
| `Clinic` | Specialty/department | E.g., `Gynecology_Infertility`, `Finance` |
| `Pt. Src.` | Patient source code | `CPt.`, `DPt.`, `VZ`, `XVZ`, `EKF`, `XEF`, `DO`, `XDO`, `SHL`, `SHL-CL`, `N/A` |
| `Src. Fee` | Source platform fee deducted | EGP value |
| `Doctor (Employee)` | Doctor or employee handling | E.g., `هدى_مدكور`, `Op_أحمد_حسن`, `Onl_سارة_أبو_النصر` |
| `Procedure` | Procedure performed | Arabic mostly, e.g., `كشف نساء سونار`; pseudo-procedures: `Doctor's Fee`, `Settling Invoice` |
| `Approve Charge` | Approved patient charge | EGP |
| `Proc. Cost` | Clinic cost of procedure | EGP |
| `C/I` | Check-in cash amount | EGP |
| `C/O` | Check-out cash amount | EGP |
| `C/M` | **Cash-flow direction code** | `NS<Pt.`, `POS<Pt.`, `MW<VFC`, `NS>Dr.`, etc. (the DSL — see §4) |
| `Ref.` | Reference (POS receipt # or cash) | Mixed: `Cash`, 11-digit int, `…` |
| `Revenue` | Net revenue post source fee | EGP |
| `Due` | Outstanding due | EGP |
| `Dr.%` | Doctor share % | 0.5, 0.8, 0.7, 0.3, 0.375... |
| `Dr.'s Shr.` | Doctor's share amount | EGP |
| `Pd.` | **Settlement status** | `Yes` / `…` / `N/A` |
| `Cl.%` | Clinic share % | Complement of Dr.% |
| `Cl.'s Shr.` | Clinic's share amount | EGP |
| `Vlt.` | **Vault (cash category)** | `NS`, `POS`, `MW`, `CIB`, `FOC` |
| `Balance!` | Running balance | EGP, can be negative |

#### B. Dr_Data — 153 rows × 8 columns

Doctor catalogue with revenue splits.

**Columns:** `Dr. Name`, `Cl.` (specialty), `Dr. Mobile`, `Dr. %`, `Cl. %`, `PYMT TP` (payment type), `PYMT Acc.` (account/mobile #), `PYMT Ch.` (channel — InstaPay etc.)

**Patterns observed:**
- Same doctor appears twice: regular (e.g., `أحمد_حسن`) and operative (`Op_أحمد_حسن`) with different splits
- Some appear thrice including online (`Onl_سارة_أبو_النصر`)
- `POS` and `CIB` are bookkeeping placeholders, not real doctors
- Many rows have NULL mobile, payment type, account — incomplete records
- Splits seen: `0.3/0.7`, `0.375/0.625`, `0.5/0.5`, `0.7/0.3`, `0.8/0.2`

#### C. Lists — 565 rows × 68 columns

Excel data-validation source for dropdowns. Each column is a list:
- 41+ specialty columns containing doctor names
- `Dr_List` master list
- `Vezeeta Fees` reference
- `Record_Type` (`Appt.`, `C/O`, `C/I`)
- `Cl._No.` rooms (`#1`–`#6`, `D1`–`D4`, `OL`, `NS`)
- `To_be_Conf.` (status values)
- `Cash_Mode` (the directional DSL values)
- `Vault` (cash categories)
- `Referral_Source` (patient source codes)
- `Settlement` (`Yes` / `N/A`)
- `Time` (20-min slots from 9:00)
- `Appt.` ordinals (`1st`, `2nd`, ...`29th`)

#### D. Dict. — 55 rows × 5 columns

Glossary in Arabic, confirms semantics:
- Two-hour rule explicitly stated for `TBC!` and `Ok!` statuses
- `Comp.` includes religious phrasing ("بحول الله تعالى")
- Source codes: `Cl.'s`, `Dr.'s`, `VEZ`/`Ex-VEZ`, `EKF`/`Ex-EKF`, `DO`/`Ex-DO`, `SHL` (Shamel — no commission)

#### E. حالات د سارة المؤجلة (Dr. Sara's Postponed Cases) — 32 rows

Per-doctor reschedule backlog spreadsheet. All entries `Resch.` Some have `#VALUE!` errors. Pattern proves the staff manually maintains rebook lists per doctor.

---

## 2. Target Schema Reference

All migrations land in PostgreSQL `fadl_clinic_production` and MongoDB `fadl_clinic_ehr` per `database.md`.

Primary target tables:
- `patients` — keyed on `patient_id` UUID, `mobile` is unique constraint
- `doctors` — one record per real doctor (Op_ / Onl_ resolved into split columns)
- `specialties` — 41+ records with bilingual names
- `clinic_rooms` ⭐ **NEW** — needs to be added
- `appointments` — partitioned by branch + date
- `procedure_catalogue` — real procedures only (excludes Doctor's Fee, Settling Invoice)
- `transaction_types` ⭐ **NEW** — for non-procedure ledger entries
- `financial_transactions` — immutable ledger
- `cash_flow_events` ⭐ **NEW** — parsed from the C/M directional DSL
- `source_fee_rules`
- `settlement_records` ⭐ **NEW** — separate from financial_transactions
- `reschedule_backlog` ⭐ **NEW** — per-doctor pending reschedules

---

## 3. Field-by-Field Mapping

### 3.1 MSR → Multiple Tables

Each MSR row decomposes into **one or more** target records depending on `Entry` type:

#### When `Entry = Appt.`:
```
MSR Row → 1 appointment record + 1 financial_transaction record + 1+ cash_flow_event records
```

| MSR Field | Target | Transformation |
|---|---|---|
| `Date` + `Time` | `appointments.appointment_date`, `appointments.start_time` | Direct |
| `Date` + `Time` + procedure_duration | `appointments.end_time` | start + 20min default, or procedure-specific |
| `2nd Party Nm.` | `patients.name_ar` (or `name_en` if Latin) | Auto-detect script; trim whitespace |
| `2nd Party Mob.` | `patients.mobile` | Normalize → §6 |
| `TBC! Dr.` | `appointments.status` | Map: `Comp.` → `Comp.`, etc. (already matches) |
| `C#` | `appointments.room_id` | Lookup `clinic_rooms.code` → FK |
| `Clinic` | `appointments.specialty_id` | Lookup `specialties.code` → FK |
| `Pt. Src.` | `appointments.patient_source` | Map abbreviations to canonical codes (§3.3) |
| `Src. Fee` | `financial_transactions.source_fee_amount` | Direct (validate against `source_fee_rules`) |
| `Doctor (Employee)` | `appointments.doctor_id` | Resolve Op_/Onl_ prefix → §5 |
| `Procedure` | `appointments.procedure_id` | Lookup `procedure_catalogue.name_ar` → FK |
| `Approve Charge` | `financial_transactions.approved_charge` | Direct |
| `Proc. Cost` | `financial_transactions.procedure_cost` | Direct |
| `Revenue` | `financial_transactions.gross_revenue` | Validate = `Approve Charge` − `Src. Fee` |
| `Dr.%` | `financial_transactions.split_doctor_percentage` | × 100 (Excel uses 0.5, DB uses 50.00) |
| `Dr.'s Shr.` | `financial_transactions.doctor_share` | Validate = `Revenue` × `Dr.%` |
| `Cl.%` | `financial_transactions.split_clinic_percentage` | × 100 |
| `Cl.'s Shr.` | `financial_transactions.clinic_share` | Validate = `Revenue` × `Cl.%` |
| `Pd.` | `financial_transactions.payment_status` | Map: `Yes` → `paid`, `…` → `pending`, `N/A` → `not_applicable` |
| `Vlt.` | `financial_transactions.payment_method` | Map cash category (§3.4) |
| `C/M` | `cash_flow_events` (separate records) | Parse DSL → §4 |
| `Ref.` | `financial_transactions.payment_reference` | If number → preserve as string with leading zeros; if `Cash` → store as method tag |

#### When `Entry = C/O` and `Procedure = "Doctor's Fee"`:
```
MSR Row → 1 settlement_record (NOT an appointment)
```

| MSR Field | Target | Notes |
|---|---|---|
| `2nd Party Nm.` | `settlement_records.doctor_id` | Resolve doctor from Arabic name (fuzzy match against `doctors.name_ar`) |
| `Doctor (Employee)` | `settlement_records.processed_by_user_id` | This is the staff member who paid out |
| `C/O` (cash-out amount) | `settlement_records.amount` | Direct |
| `C/M` | `cash_flow_events` | Parse → typically `NS>Dr.` (cash to doctor) |

#### When `Entry = C/O` and `Procedure = "Settling Invoice"`:
```
MSR Row → 1 vendor_invoice_record + 1 cash_flow_event
```

| MSR Field | Target | Notes |
|---|---|---|
| `2nd Party Nm.` | `vendor_invoices.vendor_name` | Often `فضل كلينك` itself for inter-clinic transfers |
| `C/O` | `vendor_invoices.amount` | Direct |
| `C/M` | `cash_flow_events` | Parse → typically `NS>Vdr.` |

### 3.2 Dr_Data → `doctors` Table

| Excel Pattern | Resolution |
|---|---|
| `أحمد_حسن` (regular) + `Op_أحمد_حسن` (operative) | **Single doctor record** with `consultation_split` and `operative_split` columns populated from both rows |
| `سارة_أبو_النصر` + `Op_سارة_أبو_النصر` + `Onl_سارة_أبو_النصر` | **Single doctor record** with all three splits populated |
| `POS`, `CIB` | **NOT migrated as doctors** — these are bookkeeping placeholders; map to `payment_methods` reference table instead |
| Dr.'s with NULL mobile | Migrate as-is; flag for manual update post-cutover |
| Dr.'s with NULL payment info | Migrate; flag for HR/finance to complete |

### 3.3 Patient Source Code Mapping

| Excel Code | Target `patient_source` | Description | Has Source Fee? |
|---|---|---|---|
| `CPt.` | `Cl.'s` | Clinic walk-in | No |
| `DPt.` | `Dr.'s` | Doctor referral | No |
| `VZ` | `VEZ` | Vizita active patient | Yes |
| `XVZ` | `Ex-VEZ` | Vizita former patient | Sometimes |
| `DVZ` | `VEZ-Direct` | Vizita with direct fee | Yes |
| `EKF` | `EKF` | Ekshf active | Yes |
| `XEF` | `Ex-EKF` | Ekshf former | Sometimes |
| `DEF` | `EKF-Direct` ⭐ NEW | Ekshf direct | Yes |
| `DO` | `DO` | CliniDo active | Yes |
| `XDO` | `Ex-DO` | CliniDo former | Sometimes |
| `DDO` | `DO-Direct` ⭐ NEW | CliniDo direct | Yes |
| `SHL` | `SHL` | Shamel (Vizita service) | **No commission** |
| `SHL-CL` | `SHL-Clinic` | Shamel via clinic | No |
| `N/A` | `not_applicable` | Finance entries | No |

### 3.4 Cash Category (Vault) Mapping

| Excel `Vlt.` | Target `payment_method` | Notes |
|---|---|---|
| `NS` | `cash` | "No Slip" — physical cash |
| `POS` | `pos_terminal` | Card via POS |
| `MW` | `mobile_wallet` | Generic mobile wallet |
| `CIB` | `bank_transfer_cib` | CIB bank transfer ⭐ MISSING from original plan |
| `FOC` | `free_of_charge` | Staff/family ⭐ MISSING from original plan |
| `…` | `pending` | TBD |

---

## 4. Cash Flow Directional DSL Parser ⭐ CRITICAL

The `C/M` column uses a custom micro-language the staff invented to track money flow direction. Every value follows the pattern:

```
<METHOD> <DIRECTION> <COUNTERPARTY>
```

Where:
- `<METHOD>` ∈ {`NS`, `POS`, `MW`, `CIB`, `iPay`, `BT`, `VFC`, `Cash`, `FOC`}
- `<DIRECTION>` ∈ {`<` (received from), `>` (paid to)}
- `<COUNTERPARTY>` ∈ {`Pt.` (patient), `Dr.` (doctor), `Vdr.` (vendor), `Sal.` (salary), `MW`, `iPay`, `VFC`, `CIB`, `BT`, `NS`}

### 4.1 Examples Decoded

| Raw `C/M` | Method | Direction | Counterparty | Meaning |
|---|---|---|---|---|
| `NS<Pt.` | Cash | Received | Patient | Cash received from patient at desk |
| `POS<Pt.` | POS | Received | Patient | Card payment from patient |
| `MW<VFC` | Mobile Wallet | Received | VFC | Wallet credit from VFC |
| `MW<iPay` | Mobile Wallet | Received | InstaPay | Wallet credit via InstaPay |
| `MW<Dr.` | Mobile Wallet | Received | Doctor | Doctor topped up wallet (rare) |
| `NS>Dr.` | Cash | Paid | Doctor | Doctor settlement payout |
| `NS>Vdr.` | Cash | Paid | Vendor | Vendor invoice payment |
| `NS>Sal.` | Cash | Paid | Salary | Staff salary payment |
| `MW>iPay` | Mobile Wallet | Paid | InstaPay | Out-transfer to InstaPay |
| `CIB>MW` | CIB | Paid | Mobile Wallet | Bank-to-wallet transfer |
| `POS>CIB` | POS | Paid | CIB | POS settlement to CIB account |
| `FOC` | Free | — | — | Free of charge (no cash movement) |
| `…` | Pending | — | — | Not yet recorded |

### 4.2 Parser Specification

```python
import re
from dataclasses import dataclass
from enum import Enum

class FlowDirection(Enum):
    INFLOW = "inflow"        # < (received from)
    OUTFLOW = "outflow"       # > (paid to)
    NONE = "none"             # FOC, ..., null

class PaymentMethod(Enum):
    CASH = "cash"
    POS = "pos_terminal"
    MOBILE_WALLET = "mobile_wallet"
    CIB = "bank_transfer_cib"
    INSTAPAY = "instapay"
    BANK_TRANSFER = "bank_transfer"
    VFC = "vfc_wallet"
    FREE_OF_CHARGE = "free_of_charge"
    PENDING = "pending"

class Counterparty(Enum):
    PATIENT = "patient"
    DOCTOR = "doctor"
    VENDOR = "vendor"
    SALARY = "salary"
    MOBILE_WALLET = "mobile_wallet"
    INSTAPAY = "instapay"
    VFC = "vfc"
    CIB = "cib"
    BANK_TRANSFER = "bank_transfer"
    CASH = "cash"
    NONE = "none"

@dataclass
class CashFlowEvent:
    raw: str
    method: PaymentMethod
    direction: FlowDirection
    counterparty: Counterparty
    is_valid: bool
    parse_warning: str | None = None

# Method tokens
METHOD_MAP = {
    "NS": PaymentMethod.CASH,
    "Cash": PaymentMethod.CASH,
    "POS": PaymentMethod.POS,
    "MW": PaymentMethod.MOBILE_WALLET,
    "CIB": PaymentMethod.CIB,
    "iPay": PaymentMethod.INSTAPAY,
    "BT": PaymentMethod.BANK_TRANSFER,
    "VFC": PaymentMethod.VFC,
    "FOC": PaymentMethod.FREE_OF_CHARGE,
}

# Counterparty tokens
COUNTERPARTY_MAP = {
    "Pt.": Counterparty.PATIENT,
    "Dr.": Counterparty.DOCTOR,
    "Vdr.": Counterparty.VENDOR,
    "Sal.": Counterparty.SALARY,
    "MW": Counterparty.MOBILE_WALLET,
    "iPay": Counterparty.INSTAPAY,
    "VFC": Counterparty.VFC,
    "CIB": Counterparty.CIB,
    "BT": Counterparty.BANK_TRANSFER,
    "NS": Counterparty.CASH,
}

PATTERN = re.compile(r"^(?P<method>NS|Cash|POS|MW|CIB|iPay|BT|VFC|FOC)(?P<dir>[<>])(?P<cp>Pt\.|Dr\.|Vdr\.|Sal\.|MW|iPay|VFC|CIB|BT|NS)$")

def parse_cash_flow(raw: str) -> CashFlowEvent:
    if raw is None or raw.strip() in ("", "…", "..."):
        return CashFlowEvent(
            raw=raw or "",
            method=PaymentMethod.PENDING,
            direction=FlowDirection.NONE,
            counterparty=Counterparty.NONE,
            is_valid=False,
            parse_warning="Empty or pending placeholder"
        )

    raw_clean = raw.strip()

    if raw_clean == "FOC":
        return CashFlowEvent(
            raw=raw_clean,
            method=PaymentMethod.FREE_OF_CHARGE,
            direction=FlowDirection.NONE,
            counterparty=Counterparty.NONE,
            is_valid=True
        )

    match = PATTERN.match(raw_clean)
    if not match:
        return CashFlowEvent(
            raw=raw_clean,
            method=PaymentMethod.PENDING,
            direction=FlowDirection.NONE,
            counterparty=Counterparty.NONE,
            is_valid=False,
            parse_warning=f"Pattern did not match: {raw_clean}"
        )

    return CashFlowEvent(
        raw=raw_clean,
        method=METHOD_MAP[match.group("method")],
        direction=FlowDirection.INFLOW if match.group("dir") == "<" else FlowDirection.OUTFLOW,
        counterparty=COUNTERPARTY_MAP[match.group("cp")],
        is_valid=True
    )
```

### 4.3 Output Schema — `cash_flow_events` Table

```sql
CREATE TABLE cash_flow_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES financial_transactions(id),
    raw_dsl VARCHAR(20) NOT NULL,                     -- Original C/M value preserved
    method VARCHAR(50) NOT NULL,                       -- cash, pos_terminal, mobile_wallet, etc.
    direction VARCHAR(20) NOT NULL CHECK (direction IN ('inflow','outflow','none')),
    counterparty VARCHAR(50) NOT NULL,                 -- patient, doctor, vendor, etc.
    amount DECIMAL(12,2) NOT NULL,
    parse_warning TEXT,                                -- Populated for unparseable values
    occurred_at TIMESTAMPTZ NOT NULL,
    branch_id INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cash_flow_transaction ON cash_flow_events(transaction_id);
CREATE INDEX idx_cash_flow_method_direction ON cash_flow_events(method, direction, occurred_at);
CREATE INDEX idx_cash_flow_counterparty ON cash_flow_events(counterparty, occurred_at);
```

---

## 5. Doctor Prefix Resolution

Excel doctor names use three forms:
- `<name>` — regular consultation mode
- `Op_<name>` — operative mode (different split)
- `Onl_<name>` — online consultation mode (different split)

**Resolution rule:** **One doctor record** in the new system holds all three split modes.

### 5.1 Migration Algorithm

```python
def resolve_doctor_records(dr_data_rows):
    doctors = {}  # canonical_name → doctor record
    
    for row in dr_data_rows:
        raw_name = row["Dr. Name"]
        if raw_name in ("POS", "CIB", None):
            continue  # Skip bookkeeping placeholders
        
        # Strip prefix
        if raw_name.startswith("Op_"):
            canonical = raw_name[3:]
            mode = "operative"
        elif raw_name.startswith("Onl_"):
            canonical = raw_name[4:]
            mode = "online"
        else:
            canonical = raw_name
            mode = "consultation"
        
        if canonical not in doctors:
            doctors[canonical] = {
                "canonical_name": canonical,
                "name_ar": canonical.replace("_", " "),
                "mobile": row.get("Dr. Mobile"),
                "specialty_code": row["Cl."],
                "consultation_split_doctor": None,
                "consultation_split_clinic": None,
                "operative_split_doctor": None,
                "operative_split_clinic": None,
                "online_split_doctor": None,
                "online_split_clinic": None,
                "payment_method": row.get("PYMT TP"),
                "payment_account": row.get("PYMT Acc."),
                "payment_channel": row.get("PYMT Ch."),
            }
        
        # Apply split based on mode
        doctors[canonical][f"{mode}_split_doctor"] = row["Dr. %"] * 100
        doctors[canonical][f"{mode}_split_clinic"] = row["Cl. %"] * 100
    
    # Apply defaults for missing modes
    for d in doctors.values():
        if d["consultation_split_doctor"] is None:
            d["consultation_split_doctor"] = 50.0
            d["consultation_split_clinic"] = 50.0
        if d["operative_split_doctor"] is None:
            d["operative_split_doctor"] = 80.0
            d["operative_split_clinic"] = 20.0
        if d["online_split_doctor"] is None:
            d["online_split_doctor"] = 70.0
            d["online_split_clinic"] = 30.0
    
    return list(doctors.values())
```

### 5.2 MSR Transaction Doctor Resolution

When migrating MSR rows, the `Doctor (Employee)` field tells us which **mode** the appointment used:

```python
def resolve_appointment_split_mode(employee_field, doctors_table):
    if employee_field.startswith("Op_"):
        canonical = employee_field[3:]
        mode = "operative"
    elif employee_field.startswith("Onl_"):
        canonical = employee_field[4:]
        mode = "online"
    else:
        canonical = employee_field
        mode = "consultation"
    
    doctor = doctors_table.lookup(canonical_name=canonical)
    if not doctor:
        raise MigrationError(f"Unknown doctor: {employee_field}")
    
    return {
        "doctor_id": doctor.id,
        "split_mode": mode,
        "split_doctor_percentage": getattr(doctor, f"{mode}_split_doctor"),
        "split_clinic_percentage": getattr(doctor, f"{mode}_split_clinic"),
    }
```

---

## 6. Mobile Number & POS Receipt Normalization

### 6.1 Mobile Number Issues in Source

The Excel stores mobile numbers as **integers**. This causes:
- **Leading zeros lost** — Egyptian mobiles like `01012345678` become `1012345678` (10 digits instead of 11)
- **Some have country code** — `966581247711` (Saudi number for an expat patient — legitimate)
- **Some are very short** — `112462259` (9 digits — likely truncated)

### 6.2 Normalization Rules

```python
def normalize_egyptian_mobile(raw_value, default_country_code="+20"):
    if raw_value is None or raw_value == 0:
        return None, "missing"
    
    s = str(int(raw_value))  # Coerce to string, drop decimal
    
    # If starts with 20 and 12-13 digits long → already has country code
    if s.startswith("20") and len(s) in (12, 13):
        return f"+{s}", "ok"
    
    # If starts with 966 / 971 / 974 etc. → other GCC country code
    if s[:3] in ("966", "971", "974", "973", "965", "968"):
        return f"+{s}", "ok"
    
    # Egyptian mobile patterns:
    # - 11 digits starting with 01 → standard
    # - 10 digits starting with 1 → leading zero lost, restore
    if len(s) == 11 and s.startswith("01"):
        return f"+20{s[1:]}", "ok"
    if len(s) == 10 and s.startswith("1"):
        return f"+20{s}", "restored_leading_zero"
    
    # Anomalies
    if len(s) < 10:
        return f"INVALID:{s}", "too_short"
    if len(s) > 13:
        return f"INVALID:{s}", "too_long"
    
    return f"INVALID:{s}", "unknown_format"
```

**Migration policy:**
- Status `ok` and `restored_leading_zero` → migrate normally
- Status `too_short`, `too_long`, `unknown_format` → migrate with `INVALID:` prefix to a quarantine flag; flag for receptionist correction post-cutover; do NOT block migration

### 6.3 POS Receipt Number Preservation

POS receipts are 11-digit numbers like `35049846171`. Stored as **integers** in Excel — risk of leading-zero loss. Migration policy:

```python
def normalize_pos_receipt(raw_value):
    if raw_value is None:
        return None
    if isinstance(raw_value, str) and raw_value.strip() in ("Cash", "Cash ", "..."):
        return None  # Not a POS receipt
    
    s = str(int(raw_value))
    # POS receipts are typically 11 digits — pad with leading zeros if shorter
    if s.isdigit() and len(s) <= 11:
        return s.zfill(11)
    return s  # Preserve as-is for atypical lengths
```

---

## 7. Special Entity Handling

### 7.1 Doctor Settlements (`C/O` + `Procedure = "Doctor's Fee"`)

These are **NOT appointments**. They are settlement events where the clinic pays the doctor their accumulated share.

```sql
CREATE TABLE settlement_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id UUID NOT NULL REFERENCES doctors(id),
    settlement_date DATE NOT NULL,
    settlement_time TIME,
    amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(50) NOT NULL,
    payment_reference VARCHAR(50),                    -- POS receipt or transfer reference
    processed_by_user_id UUID REFERENCES users(id),    -- Staff member who paid out
    related_transaction_ids UUID[],                    -- Which financial_transactions this settles
    notes TEXT,
    branch_id INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Immutable
    CONSTRAINT no_settlement_modification CHECK (true)  -- Trigger enforces NO UPDATE/DELETE
);
```

**Migration logic:** When MSR row has `Entry='C/O'` and `Procedure='Doctor's Fee'`:
1. Identify doctor from `2nd Party Nm.` (fuzzy match against `doctors.name_ar`)
2. Identify staff member from `Doctor (Employee)` field
3. Find unsettled `financial_transactions` for that doctor up to settlement date with `payment_status='paid'` and `settlement_id IS NULL`
4. Create `settlement_records` row, link to those transactions
5. Update those `financial_transactions` to `payment_status='reconciled'` with `settlement_reference` populated

### 7.2 Vendor Invoices (`C/O` + `Procedure = "Settling Invoice"`)

```sql
CREATE TABLE vendor_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_name VARCHAR(200) NOT NULL,                 -- From "2nd Party Nm."
    invoice_date DATE NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    payment_reference VARCHAR(50),
    description TEXT,
    processed_by_user_id UUID REFERENCES users(id),
    branch_id INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 7.3 FOC (Free of Charge) Transactions

These need careful handling because they break the "splits sum to gross_revenue" check:
- All financial amounts should be **0.00**, not NULL
- `payment_method = 'free_of_charge'`
- `payment_status = 'not_applicable'`
- `procedure_id` still references the actual procedure performed
- Add `is_foc BOOLEAN` column to `financial_transactions` for filtering in reports
- FOC transactions still create an `appointment` record (the patient was still seen)

### 7.4 Refunds & Negative Balances

Observed in MSR: `Revenue = -301`, `Doctor's Shr. = -150.5`, etc.

**Migration policy:**
- Original transaction stays positive
- Refund creates a **compensating transaction** with `is_refund=TRUE`, `original_transaction_id` set, and amounts negated
- The CHECK constraint `approved_charge >= 0` in `database.md` must be relaxed for refund rows OR refunds use a separate `refund_records` table linked to the original

**Recommendation:** Use the **compensating transaction** pattern (immutable ledger best practice) — never modify originals.

```sql
-- Adjust the database.md schema constraint:
ALTER TABLE financial_transactions DROP CONSTRAINT IF EXISTS approved_charge_check;
ALTER TABLE financial_transactions ADD CONSTRAINT approved_charge_check 
    CHECK (
        (is_refund = FALSE AND approved_charge >= 0) OR
        (is_refund = TRUE AND approved_charge <= 0)
    );
```

### 7.5 Reschedule Backlog Per Doctor (Dr. Sara's Sheet Pattern)

The clinic manually maintains per-doctor reschedule backlogs. Productize this as:

```sql
CREATE TABLE reschedule_backlog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_appointment_id UUID NOT NULL REFERENCES appointments(id),
    patient_id UUID NOT NULL REFERENCES patients(patient_id),
    doctor_id UUID NOT NULL REFERENCES doctors(id),
    original_date DATE NOT NULL,
    rescheduled_to_date DATE,                          -- NULL until rescheduled
    rescheduled_to_appointment_id UUID REFERENCES appointments(id),
    backlog_reason VARCHAR(200),
    priority SMALLINT DEFAULT 0,                        -- Manual priority bump
    notification_sent_count INT DEFAULT 0,
    last_notification_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    branch_id INT NOT NULL DEFAULT 1
);

CREATE INDEX idx_backlog_doctor_unresolved ON reschedule_backlog(doctor_id, original_date) 
    WHERE resolved_at IS NULL;
```

**Receptionist UI requirement:** A "Pending Reschedule" view per doctor, showing all unresolved backlog entries, with one-click rescheduling.

### 7.6 Clinic Rooms

```sql
CREATE TABLE clinic_rooms (
    id SERIAL PRIMARY KEY,
    code VARCHAR(10) UNIQUE NOT NULL,                  -- '#1', '#2', 'D1', 'D2', 'OL', 'NS'
    name_en VARCHAR(100),
    name_ar VARCHAR(100),
    room_type VARCHAR(20) CHECK (room_type IN ('clinical','dental','online','finance')),
    floor SMALLINT,
    is_active BOOLEAN DEFAULT TRUE,
    branch_id INT NOT NULL DEFAULT 1
);

-- Seed data from Excel observation
INSERT INTO clinic_rooms (code, name_en, name_ar, room_type, branch_id) VALUES
    ('#1', 'Room 1', 'غرفة ١', 'clinical', 1),
    ('#2', 'Room 2', 'غرفة ٢', 'clinical', 1),
    ('#3', 'Room 3', 'غرفة ٣', 'clinical', 1),
    ('#4', 'Room 4', 'غرفة ٤', 'clinical', 1),
    ('#5', 'Room 5', 'غرفة ٥', 'clinical', 1),
    ('#6', 'Room 6', 'غرفة ٦', 'clinical', 1),
    ('D1', 'Dental Chair 1', 'كرسي أسنان ١', 'dental', 1),
    ('D2', 'Dental Chair 2', 'كرسي أسنان ٢', 'dental', 1),
    ('D3', 'Dental Chair 3', 'كرسي أسنان ٣', 'dental', 1),
    ('D4', 'Dental Chair 4', 'كرسي أسنان ٤', 'dental', 1),
    ('OL', 'Online', 'أونلاين', 'online', 1),
    ('NS', 'No Slot (Finance)', 'مالية', 'finance', 1);
```

### 7.7 Specialty-to-Room Binding

Add `specialty_room_assignments` to enforce that each specialty operates in specific rooms:

```sql
CREATE TABLE specialty_room_assignments (
    specialty_id INT REFERENCES specialties(id),
    room_id INT REFERENCES clinic_rooms(id),
    is_primary BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (specialty_id, room_id)
);
```

Excel shows: Gynecology → Room #1, Internal Medicine → Room #2, Psychiatry → Room #5, Dentistry → Rooms D1-D4, Pediatrics → Room #6, Finance → NS, Online → OL, etc.

---

## 8. Data Quality Issues & Cleansing

| Issue Type | Where | Severity | Cleansing Rule |
|---|---|---|---|
| `#VALUE!` formula errors | حالات د سارة sheet, others | High | Skip row, log to `migration_errors` for manual review |
| `…` placeholder | Many fields | Low | Map to `pending` / `not_applicable` / `unknown` per field |
| Mobile numbers as integers | All patient/doctor mobiles | Critical | Use §6.2 normalization |
| Leading zeros lost on POS receipts | `Ref.` column | High | Use §6.3 padding |
| Duplicate patient records (same mobile) | `2nd Party Nm.` variants | Medium | Group by normalized mobile; keep most recent name; merge history |
| Arabic name spelling variants | Same patient written multiple ways | Medium | Fuzzy match on mobile + birthdate; flag low-confidence merges for manual review |
| Empty `Procedure` cells | Some FOC entries | Low | Default to `unknown_procedure` for FOC; reject for paid entries |
| NULL doctor mobile | Dr_Data | Low | Migrate as NULL; flag for HR completion |
| NULL doctor payment info | Dr_Data | Low | Migrate as NULL; flag for finance completion |
| Inconsistent date formats | Mixed | Low | Excel handles natively; pandas parsing |
| Inconsistent procedure name spelling | Same procedure typed differently | Medium | Build canonical procedure dictionary; fuzzy match; flag low-confidence |
| Negative amounts not flagged as refunds | Refunds | High | Detect by checking original_transaction relationship; if no parent, manually classify |
| Mixed Arabic/Latin script in same field | Patient names | Low | Auto-detect script per record; populate either `name_ar` or `name_en` accordingly |
| Time entries outside 9:00-23:00 range | Possible data entry errors | Low | Flag for review; do not block |

### 8.1 Migration Error Log Table

```sql
CREATE TABLE migration_errors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_file VARCHAR(200) NOT NULL,
    source_sheet VARCHAR(100) NOT NULL,
    source_row INT NOT NULL,
    error_type VARCHAR(50) NOT NULL,                   -- 'parse_error', 'fk_lookup_failed', 'data_quality', etc.
    error_severity VARCHAR(20) CHECK (error_severity IN ('blocker', 'high', 'medium', 'low', 'warning')),
    error_message TEXT NOT NULL,
    raw_row_data JSONB NOT NULL,                       -- Full source row for debugging
    suggested_fix TEXT,
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 9. Migration Pipeline Architecture

### 9.1 High-Level Pipeline

```
┌────────────────────────────────────────────────────────────────────┐
│                  fadl-migration namespace (OpenShift)               │
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐         │
│  │   EXTRACT    │───►│   VALIDATE   │───►│  TRANSFORM   │         │
│  │              │    │              │    │              │         │
│  │ openpyxl/    │    │ schema check │    │ - Mobile norm│         │
│  │ pandas       │    │ row counts   │    │ - DSL parse  │         │
│  │ → Parquet    │    │ totals       │    │ - FK resolve │         │
│  └──────────────┘    └──────────────┘    └──────┬───────┘         │
│                                                  │                  │
│                                                  ▼                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐         │
│  │  RECONCILE   │◄───│     LOAD     │◄───│    STAGE     │         │
│  │              │    │              │    │              │         │
│  │ - Daily diff │    │ Bulk INSERT  │    │ Parquet →    │         │
│  │ - <0.01% gate│    │ via COPY     │    │ Staging DB   │         │
│  │ - Sign-off   │    │ + integrity  │    │ (validation) │         │
│  └──────────────┘    └──────────────┘    └──────────────┘         │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Tekton Pipeline orchestration; ArgoCD deploys configs       │  │
│  │  Migration role with limited permissions; revoked after run  │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

### 9.2 Pipeline Stages

#### Stage 1 — EXTRACT
- Read `.xlsm` files using `openpyxl` in read-only mode (avoid macro execution)
- Convert each sheet to Parquet with explicit dtypes preserved
- Output to `/migration/extracted/<timestamp>/`
- Compute SHA-256 checksum of source files; store for audit

#### Stage 2 — VALIDATE (Source-Side)
- Row counts per sheet
- Sum totals: `SUM(Approve Charge)`, `SUM(Dr.'s Shr.)`, `SUM(Cl.'s Shr.)`, `SUM(Revenue)`
- Per-month, per-specialty, per-doctor breakdowns
- Save as `source_baseline.json` — used in §10 reconciliation

#### Stage 3 — TRANSFORM
- Apply all rules from §3-8
- Resolve FKs (specialties, doctors, rooms, procedures)
- Parse cash flow DSL → cash_flow_events
- Output cleaned, normalized records ready for load
- Errors written to `migration_errors` table

#### Stage 4 — STAGE
- Load to **staging database** (separate PostgreSQL instance in `fadl-migration` namespace)
- Run **all integrity checks** (FK constraints, CHECK constraints, exclusion constraints)
- Run **financial integrity validations** (splits sum to gross, etc.)
- Generate staging reconciliation report

#### Stage 5 — LOAD (Production)
- **Only after staging passes < 0.01% variance gate**
- Use `COPY` for bulk insert (much faster than individual INSERTs)
- Wrap in transactions per logical unit (specialties, then doctors, then patients, then appointments, then transactions)
- Migration role has restricted permissions; revoked at end

#### Stage 6 — RECONCILE
- Run §12 reports
- Daily during 30-day parallel run

### 9.3 Tooling

| Tool | Purpose |
|---|---|
| **Python 3.11** + `pandas` + `openpyxl` | Extraction and transformation |
| **dbt** (data build tool) | SQL-based transformations and testing in staging |
| **Great Expectations** | Data quality checks on extracted data |
| **Apache Airflow** OR **Tekton Pipelines** | Orchestration (Tekton recommended for OpenShift consistency) |
| **PostgreSQL** (staging instance in `fadl-migration` ns) | Validation environment |
| **pgBackRest** | Point-in-time backup before any production load |

---

## 10. Validation Gates

Migration cannot proceed past each gate without sign-off:

### Gate 1 — Source Validation Pass
- All Excel sheets readable
- No corrupt rows
- Source baseline totals computed and frozen
- **Sign-off:** Saad

### Gate 2 — Doctor Resolution Sign-Off
- Every doctor in MSR has a resolved record in target `doctors` table
- Every doctor's three split modes (consultation, operative, online) verified or default-assigned
- **Sign-off:** Each doctor reviews their own split config (digital signature)

### Gate 3 — Staging Load Pass
- 100% of valid rows loaded to staging
- Errors documented in `migration_errors` table with severity classification
- Zero `blocker` errors; `high` errors triaged
- **Sign-off:** Saad + Finance lead

### Gate 4 — Financial Reconciliation
**THE CRITICAL GATE.** Variance between staging totals and source baseline must be:
- **Total revenue:** < 0.01% variance
- **Total doctor shares:** < 0.01% per doctor
- **Total clinic shares:** < 0.01%
- **Total source fees:** < 0.01% per source platform
- **Cash flow event totals:** Inflows − Outflows must reconcile to running balance

If gate fails:
1. Halt migration
2. Identify discrepancy source
3. Fix transformation rule
4. Re-run from Stage 3
5. Re-validate

**Sign-off:** Saad + Finance lead + Doctor champion committee representative

### Gate 5 — 30-Day Parallel Run Pass
See §11.

### Gate 6 — Production Cutover Approval
- All 30 daily reconciliations have passed
- All doctors signed off on their earnings statements from the new system
- Disaster recovery drill completed
- **Sign-off:** Saad + clinic ownership

---

## 11. 30-Day Parallel Run Procedure

For 30 calendar days post-staging-load, the clinic operates **both systems** simultaneously:

### 11.1 Daily Workflow

| Time | Action |
|---|---|
| Throughout day | Reception enters every transaction in **both** Excel (existing) and the new system (training/validation mode) |
| 11:00 PM | Daily close in Excel as usual |
| 11:30 PM | Automated **reconciliation report** generated comparing Excel vs new system |
| Next morning 9:00 AM | Saad + Finance lead reviews report; any variance > 0.01% triggers root-cause investigation |

### 11.2 Variance Tolerance Matrix

| Day Range | Allowed Variance | Required Action if Exceeded |
|---|---|---|
| Days 1-7 | < 1.0% | Investigate; fix transform rule or staff training |
| Days 8-14 | < 0.1% | Investigate; halt cutover countdown until resolved |
| Days 15-30 | < 0.01% | **Hard gate** — must achieve to proceed to cutover |

### 11.3 Staff Dual-Entry Burden

Dual-entry is exhausting for staff. Mitigations:
- Receptionists get a **side-by-side UI** during parallel run with Excel-like layout
- Daily 1-hour overtime allocation budgeted
- Pre-trained staff entry champion (ideally 2-3 people) leads the team
- Patient-facing operations remain on Excel as source of truth until cutover

### 11.4 Patient/Doctor-Facing Cutover

Until day 30 passes, the Excel remains the **legal record of truth**. The new system runs in shadow mode. After cutover, Excel becomes archive-only (read-only export).

---

## 12. Reconciliation Reports

Generated daily during parallel run; on-demand thereafter.

### 12.1 Total Reconciliation

| Metric | Excel Total | System Total | Variance | Variance % | Status |
|---|---|---|---|---|---|
| Total approved charges | EGP X | EGP Y | Y-X | (Y-X)/X | ✅/⚠️/❌ |
| Total source fees | EGP X | EGP Y | Y-X | (Y-X)/X | ✅/⚠️/❌ |
| Total revenue | EGP X | EGP Y | Y-X | (Y-X)/X | ✅/⚠️/❌ |
| Total doctor shares | EGP X | EGP Y | Y-X | (Y-X)/X | ✅/⚠️/❌ |
| Total clinic shares | EGP X | EGP Y | Y-X | (Y-X)/X | ✅/⚠️/❌ |
| Cash inflow total | EGP X | EGP Y | Y-X | (Y-X)/X | ✅/⚠️/❌ |
| Cash outflow total | EGP X | EGP Y | Y-X | (Y-X)/X | ✅/⚠️/❌ |
| Net cash position | EGP X | EGP Y | Y-X | (Y-X)/X | ✅/⚠️/❌ |

### 12.2 Per-Doctor Reconciliation

For each doctor: total earned, total settled, outstanding — Excel vs System.

### 12.3 Per-Specialty Reconciliation

Volume + revenue per specialty.

### 12.4 Per-Source Reconciliation

Vizita / Ekshf / CliniDo / Shamel / Direct — appointment count + source fees.

### 12.5 Anomaly Report

- Rows in Excel not in System (and vice versa)
- Rows where status differs between systems
- Rows where amount differs > 0.01 EGP

---

## 13. Rollback Procedure

If validation fails post-cutover:

1. **Within first 24 hours:** Revert OpenShift Routes to point at Excel-export read-only UI; re-enable Excel as source of truth; halt all writes to PostgreSQL
2. **Database state:** Use pgBackRest PITR to restore PostgreSQL to pre-cutover snapshot
3. **Notification:** All staff notified via WhatsApp; cutover postponed; root-cause analysis begins
4. **Doctor communications:** Any doctor settlement statements issued in window are voided and re-issued from Excel
5. **Re-run prerequisites:** All 6 validation gates must be re-passed before next cutover attempt
6. **No partial rollback:** Either fully on the new system or fully back to Excel — no hybrid state allowed

---

## 14. Schema Updates Required

The following tables need to be added or modified in `database.md` based on Phase Zero discoveries:

### Add new tables:
- `clinic_rooms` (§7.6)
- `specialty_room_assignments` (§7.7)
- `cash_flow_events` (§4.3)
- `settlement_records` (§7.1)
- `vendor_invoices` (§7.2)
- `reschedule_backlog` (§7.5)
- `migration_errors` (§8.1)

### Modify existing tables:

**`appointments`:**
- Add `room_id INT REFERENCES clinic_rooms(id)`
- Change `slot_duration_minutes DEFAULT 15` → `DEFAULT 20`
- Add `split_mode VARCHAR(20) CHECK (split_mode IN ('consultation','operative','online'))`

**`financial_transactions`:**
- Add `is_foc BOOLEAN DEFAULT FALSE`
- Add `entry_type VARCHAR(20) CHECK (entry_type IN ('appointment','cash_in','cash_out'))`
- Add `settlement_id UUID REFERENCES settlement_records(id)`
- Relax `approved_charge` CHECK to allow negative for refunds (§7.4)
- Add `payment_method` enum value: `'free_of_charge'`, `'bank_transfer_cib'`

**`doctors`:**
- Existing `consultation_split_*`, `operative_split_*`, `online_split_*` columns are correct — no change needed
- Add `payment_channel VARCHAR(50)` (e.g., 'InstaPay', 'Bank Direct')

**`source_fee_rules`:**
- Add codes: `VEZ-Direct` (DVZ), `EKF-Direct` (DEF), `DO-Direct` (DDO)

---

## 15. Implementation Checklist

### Pre-Migration Preparation
- [ ] Provision `fadl-migration` namespace on OpenShift
- [ ] Deploy staging PostgreSQL cluster (3 instances HA, smaller than prod)
- [ ] Configure pgBackRest with separate S3 bucket
- [ ] Set up Tekton Pipelines for migration orchestration
- [ ] Provision Vault role for migration with time-limited credentials
- [ ] Apply schema updates from §14 to staging
- [ ] Seed `specialties`, `clinic_rooms`, `source_fee_rules`, `procedure_catalogue` reference data

### Phase 0a — Source Analysis (1 week)
- [ ] Final Excel files locked (no further edits during migration)
- [ ] Source SHA-256 checksums recorded
- [ ] Source baseline totals computed and signed off
- [ ] Doctor list reviewed and approved by clinic owner
- [ ] All 41+ specialty mappings confirmed bilingual

### Phase 0b — Transformation Build (2 weeks)
- [ ] Cash flow DSL parser implemented and unit-tested with all observed values
- [ ] Mobile number normalizer implemented and tested
- [ ] POS receipt normalizer implemented
- [ ] Doctor prefix resolver implemented and tested
- [ ] Patient deduplication logic implemented
- [ ] Procedure dictionary built (canonical name per Arabic spelling variant)
- [ ] FK lookup caches built for high-speed transform

### Phase 0c — Staging Load (1 week)
- [ ] Full staging load executed
- [ ] All migration errors triaged
- [ ] Zero blocker errors
- [ ] Staging reconciliation passes < 0.01% variance gate
- [ ] **Gate 4 sign-off obtained**

### Phase 0d — Doctor Sign-Off (1 week, parallel)
- [ ] Each doctor receives their split configuration in writing
- [ ] Each doctor's last 30-day earnings statement validated against Excel
- [ ] **Gate 2 sign-off obtained**

### Phase 0e — 30-Day Parallel Run
- [ ] Receptionist staff trained on dual-entry workflow
- [ ] Daily reconciliation reports automated
- [ ] Days 1-7 variance < 1.0%
- [ ] Days 8-14 variance < 0.1%
- [ ] Days 15-30 variance < 0.01%
- [ ] **Gate 5 sign-off obtained**

### Phase 0f — Production Cutover
- [ ] Full PostgreSQL backup taken (pgBackRest)
- [ ] All ArgoCD apps point at production namespace
- [ ] OpenShift Routes flipped to new system
- [ ] Excel marked read-only and archived
- [ ] **Gate 6 sign-off obtained**
- [ ] First 24h close monitoring with on-call SRE

### Post-Cutover (Week 1)
- [ ] Daily reconciliation against Excel archive continues for 7 more days
- [ ] Migration role permissions revoked
- [ ] Migration error backlog cleared
- [ ] Lessons-learned retrospective documented

---

## 📅 Change Log

| Date | Version | Change | By |
|---|---|---|---|
| 2026-05-02 | 1.0 | **Initial Phase 0 migration spec created** based on full analysis of `سعد_داتا_.xlsm` (1,474 transactions). Documents source data inventory, field-by-field mapping, the cash-flow directional DSL parser, doctor prefix resolution (Op_/Onl_), mobile/POS receipt normalization, special entity handling (settlements, vendor invoices, FOC, refunds, reschedule backlog, clinic rooms), data quality cleansing rules, 6-stage pipeline architecture, 6 validation gates, 30-day parallel run procedure, reconciliation reports, rollback procedure, required schema updates, and full implementation checklist | Saad + Claude |
| 2026-05-04 | 1.1 | **§14 schema updates applied** — V002 migrations created and applied to both databases. `fadl_appointments`: new tables `clinic_rooms` (12 rooms seeded), `specialty_room_assignments`, `reschedule_backlog`; `appointments` altered to add `room_id` FK and `split_mode`; `doctors` altered to add `payment_channel`; `doctor_schedules` slot default changed 15→20 min. `fadl_billing`: new tables `settlement_records` (immutable trigger), `vendor_invoices`, `cash_flow_events`, `migration_errors`; `financial_transactions` altered to add `is_foc`, `entry_type`, `settlement_id`; `approved_charge` constraint relaxed to allow negatives for refund rows; `source_fee_rules` seeded with `VEZ-Direct`, `EKF-Direct`, `DO-Direct`, `SHL-Clinic` — total 13 source codes. Migrations: `appointment-service/db/migrations/V002__phase_zero_schema_updates.sql`, `billing-service/db/migrations/V002__phase_zero_schema_updates.sql` | Saad + Claude |
| 2026-05-15 | 1.2 | **Doctor revenue split sync implemented** — `doctor-service` now pushes `revenue_splits` to `billing-service POST /compensation/:doctorId` on every create/update for all three visit types. V009 billing migration relaxes `protect_financial_amounts()` trigger: `split_doctor_percentage`/`split_clinic_percentage` updatable on pending (non-settled) rows; added `recalc_on_split_change()` trigger auto-recalculates `doctor_share`/`clinic_share` when splits change. Backfill script ran: 27 doctors × 3 visit types = 81 compensation records seeded. Settlement Dr%/Cl% now correctly reflects current doctor profile values. `appointment-service` appointments now include `specialtyId` from selected doctor on create and edit; SQL backfill patched 5 historical NULL rows. | Saad + Claude |

---

> **The migration is not done when data is loaded. The migration is done when 30 consecutive days show < 0.01% variance and every doctor has signed off on their earnings statement. Until then, Excel remains the legal record of truth.**