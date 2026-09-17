#!/usr/bin/env python3
"""
High-Performance Parquet Storage Engine for FYERS Market Data
Exports SQLite ticks, 1s bars, 1m bars, and Smart Money trails
to compressed Apache Parquet format using PyArrow and Zstandard (zstd).

Usage:
    python scripts/export_parquet.py [--db-path PATH] [--date YYYY-MM-DD] [--out-dir DIR]
"""

import os
import sys
import argparse
import sqlite3
import json
from datetime import datetime
import pyarrow as pa
import pyarrow.parquet as pq

# ============================================================================
# PYARROW SCHEMAS (Optimized with dictionary encoding & compact numerics)
# ============================================================================
TICK_SCHEMA = pa.schema([
    ("date", pa.string()),
    ("time", pa.string()),
    ("symbol", pa.dictionary(pa.int16(), pa.string())),
    ("ltp", pa.float32()),
    ("quantity", pa.int32()),
    ("volume", pa.int64()),
    ("bid", pa.float32()),
    ("ask", pa.float32()),
    ("chng", pa.float32()),
    ("pchange", pa.float32()),
    ("created_at", pa.int64()),
])

BAR_SCHEMA = pa.schema([
    ("date", pa.string()),
    ("time", pa.string()),
    ("symbol", pa.dictionary(pa.int16(), pa.string())),
    ("open", pa.float32()),
    ("high", pa.float32()),
    ("low", pa.float32()),
    ("close", pa.float32()),
    ("volume", pa.int64()),
    ("trades", pa.int32()),
    ("chng", pa.float32()),
    ("pchange", pa.float32()),
    ("day_volume", pa.int64()),
    ("created_at", pa.int64()),
])

SMART_MONEY_SCHEMA = pa.schema([
    ("id", pa.int64()),
    ("date", pa.string()),
    ("symbol", pa.dictionary(pa.int16(), pa.string())),
    ("company_name", pa.string()),
    ("sector", pa.string()),
    ("ltp", pa.float32()),
    ("volume_multiple", pa.float32()),
    ("trade_size_mult", pa.float32()),
    ("aggressor_ratio", pa.float32()),
    ("price_spread_pct", pa.float32()),
    ("pattern_type", pa.string()),
    ("score", pa.int32()),
    ("note", pa.string()),
    ("created_at", pa.int64()),
])

def export_table_to_parquet(conn, query, schema, output_filepath):
    """Executes a query and writes results to a Parquet file using Zstandard compression."""
    cursor = conn.cursor()
    cursor.execute(query)
    rows = cursor.fetchall()
    
    if not rows:
        return 0, 0

    col_names = [col[0] for col in cursor.description]
    data_dict = {col: [] for col in col_names}
    
    for row in rows:
        for idx, col in enumerate(col_names):
            val = row[idx]
            data_dict[col].append(val)

    table = pa.Table.from_pydict(data_dict, schema=schema)
    
    os.makedirs(os.path.dirname(output_filepath), exist_ok=True)
    pq.write_table(
        table,
        output_filepath,
        compression="zstd",
        compression_level=7,
        use_dictionary=True,
    )
    
    file_size = os.path.getsize(output_filepath)
    return len(rows), file_size

def run_export(db_path, out_dir, target_date=None, tag=None):
    if not os.path.exists(db_path):
        return {"success": False, "error": f"Database not found at {db_path}"}

    if not tag:
        tag = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        
    date_filter = f"WHERE date = '{target_date}'" if target_date else ""

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    results = {
        "tag": tag,
        "date": target_date or datetime.now().strftime("%Y-%m-%d"),
        "timestamp": datetime.now().isoformat(),
        "files": {},
        "total_rows": 0,
        "total_size_bytes": 0,
    }

    try:
        # 1. Export Ticks
        tick_query = f"SELECT date, time, symbol, ltp, quantity, volume, bid, ask, chng, pchange, created_at FROM ticks {date_filter} ORDER BY id ASC"
        tick_file = os.path.join(out_dir, f"fyers_ticks_{tag}.parquet")
        tick_count, tick_size = export_table_to_parquet(conn, tick_query, TICK_SCHEMA, tick_file)
        if tick_count > 0:
            results["files"]["ticks"] = {
                "path": tick_file,
                "filename": os.path.basename(tick_file),
                "rows": tick_count,
                "size_bytes": tick_size,
                "size_mb": round(tick_size / (1024 * 1024), 2),
            }
            results["total_rows"] += tick_count
            results["total_size_bytes"] += tick_size

        # 2. Export 1s Bars
        bars1s_query = f"SELECT date, time, symbol, open, high, low, close, volume, trades, chng, pchange, day_volume, created_at FROM bars_1s {date_filter} ORDER BY id ASC"
        bars1s_file = os.path.join(out_dir, f"fyers_bars1s_{tag}.parquet")
        bars1s_count, bars1s_size = export_table_to_parquet(conn, bars1s_query, BAR_SCHEMA, bars1s_file)
        if bars1s_count > 0:
            results["files"]["bars_1s"] = {
                "path": bars1s_file,
                "filename": os.path.basename(bars1s_file),
                "rows": bars1s_count,
                "size_bytes": bars1s_size,
                "size_mb": round(bars1s_size / (1024 * 1024), 2),
            }
            results["total_rows"] += bars1s_count
            results["total_size_bytes"] += bars1s_size

        # 3. Export 1m Bars
        bars1m_query = f"SELECT date, time, symbol, open, high, low, close, volume, trades, chng, pchange, day_volume, created_at FROM bars_1m {date_filter} ORDER BY id ASC"
        bars1m_file = os.path.join(out_dir, f"fyers_bars1m_{tag}.parquet")
        bars1m_count, bars1m_size = export_table_to_parquet(conn, bars1m_query, BAR_SCHEMA, bars1m_file)
        if bars1m_count > 0:
            results["files"]["bars_1m"] = {
                "path": bars1m_file,
                "filename": os.path.basename(bars1m_file),
                "rows": bars1m_count,
                "size_bytes": bars1m_size,
                "size_mb": round(bars1m_size / (1024 * 1024), 2),
            }
            results["total_rows"] += bars1m_count
            results["total_size_bytes"] += bars1m_size

        # 4. Export Smart Money Trail
        sm_query = f"SELECT id, date, symbol, company_name, sector, ltp, volume_multiple, trade_size_mult, aggressor_ratio, price_spread_pct, pattern_type, score, note, created_at FROM smart_money_trail {date_filter} ORDER BY id ASC"
        sm_file = os.path.join(out_dir, f"fyers_smart_money_{tag}.parquet")
        sm_count, sm_size = export_table_to_parquet(conn, sm_query, SMART_MONEY_SCHEMA, sm_file)
        if sm_count > 0:
            results["files"]["smart_money"] = {
                "path": sm_file,
                "filename": os.path.basename(sm_file),
                "rows": sm_count,
                "size_bytes": sm_size,
                "size_mb": round(sm_size / (1024 * 1024), 2),
            }
            results["total_rows"] += sm_count
            results["total_size_bytes"] += sm_size

        results["success"] = True
        results["total_size_mb"] = round(results["total_size_bytes"] / (1024 * 1024), 2)
        return results
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        conn.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Export FYERS SQLite data to Apache Parquet")
    parser.add_argument("--db-path", default=os.path.join(os.getcwd(), "fyers_prices.db"), help="Path to SQLite database")
    parser.add_argument("--out-dir", default=os.path.join(os.getcwd(), "backups"), help="Destination directory for Parquet files")
    parser.add_argument("--date", default=None, help="Specific date to filter (YYYY-MM-DD)")
    parser.add_argument("--tag", default=None, help="Custom filename tag")
    
    args = parser.parse_args()
    summary = run_export(args.db_path, args.out_dir, args.date, args.tag)
    print(json.dumps(summary, indent=2))
