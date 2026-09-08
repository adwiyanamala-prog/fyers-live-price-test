"""
FYERS WebSocket Bridge
Connects to FYERS API V3 WebSocket and outputs tick data as JSON lines to stdout.
The Node.js server spawns this process and reads its stdout for real market data.
"""

import os
import sys
import json
import time
import signal
from datetime import datetime, timezone, timedelta

IST = timezone(timedelta(hours=5, minutes=30))

# Ensure stdout is line-buffered for real-time piping to Node.js
sys.stdout.reconfigure(line_buffering=True)

# Load .env if python-dotenv is available
try:
    from dotenv import load_dotenv
    load_dotenv()
    load_dotenv(os.path.join(os.path.dirname(__file__), "fyers-price-test", ".env"))
except ImportError:
    pass

# Read symbols from command-line argument or environment
symbols_arg = sys.argv[1] if len(sys.argv) > 1 else os.getenv("COLLECTOR_SYMBOLS", "")
symbols = [s.strip() for s in symbols_arg.split(",") if s.strip()]

if not symbols:
    symbols = ["NSE:RELIANCE-EQ", "NSE:TCS-EQ", "NSE:INFY-EQ"]

# Read credentials
client_id = os.getenv("FYERS_CLIENT_ID", "").strip()
access_token = os.getenv("FYERS_ACCESS_TOKEN", "").strip()

if not client_id or not access_token:
    emit = {"type": "error", "message": "Missing FYERS_CLIENT_ID or FYERS_ACCESS_TOKEN in .env"}
    print(json.dumps(emit), flush=True)
    sys.exit(1)

# Format access token
if access_token.startswith(f"{client_id}:"):
    full_access_token = access_token
else:
    full_access_token = f"{client_id}:{access_token}"

# Import FYERS SDK
try:
    from fyers_apiv3.FyersWebsocket import data_ws
except ImportError:
    emit = {"type": "error", "message": "fyers-apiv3 not installed. Run: pip install fyers-apiv3"}
    print(json.dumps(emit), flush=True)
    sys.exit(1)


# Globals
fyers_socket = None
is_running = True


def emit_event(event_type, data):
    """Emit a JSON line to stdout for the Node.js server to consume."""
    payload = {"type": event_type, **data}
    print(json.dumps(payload), flush=True)


def format_timestamp(raw_ts):
    """Convert exchange timestamp to IST readable string."""
    if raw_ts is None:
        return datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S")
    try:
        if isinstance(raw_ts, (int, float)):
            return datetime.fromtimestamp(raw_ts, tz=IST).strftime("%Y-%m-%d %H:%M:%S")
        return str(raw_ts)
    except Exception:
        return datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S")


def on_message(message):
    """Handle incoming market data from FYERS WebSocket."""
    if isinstance(message, list):
        for tick in message:
            process_tick(tick)
    elif isinstance(message, dict):
        process_tick(message)


def process_tick(data):
    """Process a single tick and emit as JSON."""
    if not isinstance(data, dict):
        return

    # Check for error responses
    if data.get("s") == "error" or data.get("type") == "error":
        err_msg = data.get("message") or data.get("msg") or str(data)
        emit_event("error", {"message": err_msg})
        return

    symbol = data.get("symbol") or data.get("name")
    ltp = data.get("ltp")

    if not symbol or ltp is None:
        return

    raw_ts = (
        data.get("exch_feed_time")
        or data.get("last_traded_time")
        or data.get("timestamp")
    )
    ts_str = format_timestamp(raw_ts)

    try:
        dt_obj = datetime.strptime(ts_str, "%Y-%m-%d %H:%M:%S")
        date_str = dt_obj.strftime("%Y-%m-%d")
        time_str = dt_obj.strftime("%H:%M:%S")
    except Exception:
        date_str = datetime.now(IST).strftime("%Y-%m-%d")
        time_str = datetime.now(IST).strftime("%H:%M:%S")

    tick_data = {
        "symbol": symbol,
        "ltp": float(ltp) if ltp is not None else None,
        "date": date_str,
        "time": time_str,
        "timestamp": ts_str,
        "open": _to_float(data.get("open_price") or data.get("open")),
        "high": _to_float(data.get("high_price") or data.get("high")),
        "low": _to_float(data.get("low_price") or data.get("low")),
        "close": _to_float(data.get("prev_close_price") or data.get("close")),
        "quantity": _to_int(data.get("last_traded_qty") or data.get("qty") or data.get("quantity")),
        "volume": _to_int(data.get("vol_traded_today") or data.get("volume")),
        "average": _to_float(data.get("avg_trade_price") or data.get("avg_price") or data.get("average")),
        "bid": _to_float(data.get("bid_price") or data.get("bid")),
        "ask": _to_float(data.get("ask_price") or data.get("ask")),
        "change": _to_float(data.get("ch")),
        "pChange": _to_float(data.get("chp")),
    }

    # Calculate change/pChange if not provided by API
    if tick_data["change"] is None and tick_data["ltp"] and tick_data["close"]:
        tick_data["change"] = round(tick_data["ltp"] - tick_data["close"], 2)
    if tick_data["pChange"] is None and tick_data["change"] and tick_data["close"] and tick_data["close"] != 0:
        tick_data["pChange"] = round((tick_data["change"] / tick_data["close"]) * 100, 2)

    emit_event("tick", tick_data)


def _to_float(val):
    """Safely convert to float."""
    if val is None or val == "":
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def _to_int(val):
    """Safely convert to int."""
    if val is None or val == "":
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


last_activity_time = time.time()
reconnect_delay = 2.0
MIN_RECONNECT_DELAY = 2.0
MAX_RECONNECT_DELAY = 30.0
BACKOFF_MULTIPLIER = 1.8


def on_error(message):
    """Handle WebSocket errors."""
    msg_str = str(message)
    lower = msg_str.lower()

    if any(k in lower for k in ["401", "unauthorized", "token expired", "invalid_token", "invalid token", "expired", "-100"]):
        emit_event("auth_error", {
            "message": "FYERS Access Token has expired or is invalid. Please refresh token in Settings.",
            "raw": msg_str
        })
    else:
        emit_event("error", {"message": msg_str})


def on_close(message):
    """Handle WebSocket close."""
    global reconnect_delay
    msg_str = str(message or "")
    emit_event("status", {"message": f"WebSocket disconnected. {msg_str}".strip()})
    if is_running:
        emit_event("status", {"message": f"Reconnecting in {reconnect_delay:.1f}s (backoff active)..."})


def on_open():
    """Handle successful connection."""
    global reconnect_delay, last_activity_time
    reconnect_delay = MIN_RECONNECT_DELAY
    last_activity_time = time.time()
    emit_event("status", {"message": "Connected successfully to FYERS WebSocket."})
    emit_event("status", {"message": f"Subscribing to symbols: {', '.join(symbols)}..."})
    try:
        if fyers_socket:
            fyers_socket.subscribe(symbols=symbols, data_type="SymbolUpdate")
            emit_event("status", {"message": "Subscription successful."})
            emit_event("status", {"message": "Waiting for market data...\n"})
    except Exception as e:
        emit_event("error", {"message": f"Subscription failed: {e}"})


def handle_exit(signum, frame):
    """Handle graceful shutdown."""
    global is_running, fyers_socket
    is_running = False
    emit_event("status", {"message": "FYERS connection closed."})
    try:
        if fyers_socket:
            fyers_socket.close_connection()
    except Exception:
        pass
    sys.exit(0)


signal.signal(signal.SIGINT, handle_exit)
signal.signal(signal.SIGTERM, handle_exit)


def main():
    global fyers_socket, is_running, reconnect_delay, last_activity_time

    emit_event("status", {"message": "Connecting to FYERS..."})

    while is_running:
        try:
            fyers_socket = data_ws.FyersDataSocket(
                access_token=full_access_token,
                log_path="",
                litemode=False,
                write_to_file=False,
                reconnect=True,
                on_connect=on_open,
                on_close=on_close,
                on_error=on_error,
                on_message=on_message,
            )

            fyers_socket.connect()

            # Keep alive and send periodic heartbeat if idle
            last_heartbeat = time.time()
            while is_running:
                time.sleep(1)
                now = time.time()
                # If no ticks for 15s, emit heartbeat ping
                if now - last_heartbeat >= 15:
                    emit_event("heartbeat", {
                        "status": "alive",
                        "symbols": len(symbols),
                        "timestamp": datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S")
                    })
                    last_heartbeat = now

        except Exception as e:
            if not is_running:
                break
            err_str = str(e)
            if any(k in err_str.lower() for k in ["401", "unauthorized", "token expired", "invalid_token"]):
                emit_event("auth_error", {
                    "message": "FYERS Access Token expired. Please refresh credentials.",
                    "detail": err_str
                })
                # On auth error, exit to avoid hammering API
                time.sleep(3)
                sys.exit(2)
            else:
                emit_event("error", {"message": err_str})

        if is_running:
            time.sleep(reconnect_delay)
            # Apply exponential backoff up to max
            reconnect_delay = min(MAX_RECONNECT_DELAY, reconnect_delay * BACKOFF_MULTIPLIER)


if __name__ == "__main__":
    main()
