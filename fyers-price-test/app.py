import os
import sys
import time
import signal
import csv
from datetime import datetime
from dotenv import load_dotenv

# Load credentials from .env file
load_dotenv()

# ==============================================================================
# CONFIGURATION: TEST SYMBOLS & CSV LOGGING
# ==============================================================================
symbols = [
    "NSE:RELIANCE-EQ",
    "NSE:TCS-EQ",
    "NSE:INFY-EQ",
]

CSV_FILE_PATH = "fyers_prices.csv"
csv_file = None
csv_writer = None
recorded_count = 0

# ==============================================================================
# READ & VALIDATE CREDENTIALS
# ==============================================================================
client_id = os.getenv("FYERS_CLIENT_ID", "").strip()
access_token = os.getenv("FYERS_ACCESS_TOKEN", "").strip()

if not client_id or not access_token:
    print("FYERS ERROR:")
    print("Missing credentials in .env file.")
    print("Please set FYERS_CLIENT_ID and FYERS_ACCESS_TOKEN in your .env file.")
    sys.exit(1)

# Format access token as 'client_id:access_token' if not already prefixed
if access_token.startswith(f"{client_id}:"):
    full_access_token = access_token
else:
    full_access_token = f"{client_id}:{access_token}"

# ==============================================================================
# IMPORT FYERS SDK
# ==============================================================================
try:
    from fyers_apiv3.FyersWebsocket import data_ws
except ImportError:
    print("FYERS ERROR:")
    print("Package 'fyers-apiv3' is not installed.")
    print("Please run: pip install -r requirements.txt")
    sys.exit(1)

# Global control flags and socket handle
fyers_socket = None
is_running = True


def format_timestamp(raw_ts):
    """Format timestamp from exchange feed or current system time."""
    if raw_ts is None:
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    try:
        if isinstance(raw_ts, (int, float)):
            # FYERS feed timestamp is epoch in seconds
            return datetime.fromtimestamp(raw_ts).strftime("%Y-%m-%d %H:%M:%S")
        return str(raw_ts)
    except Exception:
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def handle_tick(data):
    """Process individual tick dictionary from WebSocket and write to CSV."""
    global csv_writer, csv_file, recorded_count
    if not isinstance(data, dict):
        return

    # Check for API error response payloads
    if data.get("s") == "error" or data.get("type") == "error":
        err_msg = data.get("message") or data.get("msg") or str(data)
        print(f"FYERS ERROR:\n{err_msg}")
        return

    symbol = data.get("symbol") or data.get("name")
    ltp = data.get("ltp")

    if symbol and ltp is not None:
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
            date_str = datetime.now().strftime("%Y-%m-%d")
            time_str = datetime.now().strftime("%H:%M:%S")

        open_price = data.get("open_price") or data.get("open", "")
        high_price = data.get("high_price") or data.get("high", "")
        low_price = data.get("low_price") or data.get("low", "")
        close_price = data.get("prev_close_price") or data.get("close", "")
        qty = data.get("last_traded_qty") or data.get("qty") or data.get("quantity", "")
        volume = data.get("vol_traded_today") or data.get("volume", "")
        avg_price = data.get("avg_trade_price") or data.get("avg_price") or data.get("average", "")
        bid = data.get("bid_price") or data.get("bid", "")
        ask = data.get("ask_price") or data.get("ask", "")

        formatted_ltp = f"{ltp:.2f}" if isinstance(ltp, (int, float)) else str(ltp)
        
        parts = [
            f"{date_str} {time_str}",
            f"{symbol:<16}",
            f"O: {open_price}",
            f"H: {high_price}",
            f"L: {low_price}",
            f"C: {close_price}",
            f"LTP: {formatted_ltp:>8}",
            f"Qty: {qty}",
            f"Vol: {volume}",
            f"Avg: {avg_price}"
        ]

        print(" | ".join(parts))

        # Write tick row to CSV with complete columns
        if csv_writer:
            try:
                csv_writer.writerow([
                    date_str,
                    time_str,
                    symbol,
                    open_price,
                    high_price,
                    low_price,
                    close_price,
                    formatted_ltp,
                    qty,
                    volume,
                    avg_price,
                    bid,
                    ask
                ])
                if csv_file:
                    csv_file.flush()
                recorded_count += 1
            except Exception as e:
                pass


# ==============================================================================
# WEBSOCKET EVENT CALLBACKS
# ==============================================================================
def on_message(message):
    """Handle incoming market data messages."""
    if isinstance(message, list):
        for tick in message:
            handle_tick(tick)
    elif isinstance(message, dict):
        handle_tick(message)


def on_error(message):
    """Handle socket errors."""
    print(f"FYERS ERROR:\n{message}")


def on_close(message):
    """Handle socket close event."""
    if is_running:
        print("\nWebSocket disconnected.")
        if message:
            print(f"Details: {message}")
        print("Reconnecting in 5 seconds...")


def on_open():
    """Handle successful connection and subscribe to symbols."""
    print("Connected successfully.")
    print("Subscribing to symbols...")
    try:
        if fyers_socket:
            # Subscribe using SymbolUpdate mode for live price and market data
            fyers_socket.subscribe(symbols=symbols, data_type="SymbolUpdate")
            print("Subscription successful.")
            print("Waiting for market data...\n")
    except Exception as e:
        print(f"FYERS ERROR:\nSubscription failed: {e}")


# ==============================================================================
# GRACEFUL EXIT HANDLER
# ==============================================================================
def handle_exit(signum, frame):
    """Cleanly close connection and finalize CSV upon CTRL+C."""
    global is_running, fyers_socket, csv_file, recorded_count
    is_running = False
    print("\nFYERS connection closed.")
    
    if csv_file:
        try:
            csv_file.flush()
            csv_file.close()
            print(f"Recorded prices saved to '{CSV_FILE_PATH}' ({recorded_count} rows).")
        except Exception:
            pass

    print("Application stopped.")
    try:
        if fyers_socket:
            fyers_socket.close_connection()
    except Exception:
        pass
    sys.exit(0)


signal.signal(signal.SIGINT, handle_exit)
signal.signal(signal.SIGTERM, handle_exit)


# ==============================================================================
# MAIN CONNECTION LOOP WITH RECONNECT & CSV INITIALIZATION
# ==============================================================================
def start_client():
    global fyers_socket, is_running, csv_file, csv_writer, recorded_count

    # Initialize CSV file
    file_exists = os.path.exists(CSV_FILE_PATH)
    csv_file = open(CSV_FILE_PATH, mode="a", newline="", encoding="utf-8")
    csv_writer = csv.writer(csv_file)
    
    # Write header if new file
    if not file_exists or os.path.getsize(CSV_FILE_PATH) == 0:
        csv_writer.writerow(["Date", "Time", "Symbol", "Open", "High", "Low", "Close", "LTP", "Quantity", "Volume", "Average", "Bid", "Ask"])
        csv_file.flush()

    print(f"CSV logging active: Writing prices to '{CSV_FILE_PATH}'...")

    while is_running:
        try:
            print("Connecting to FYERS...")
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

            # Establish WebSocket connection
            fyers_socket.connect()

            # Keep the thread active while socket is alive
            while is_running and fyers_socket.is_connected():
                time.sleep(1)

        except Exception as e:
            if not is_running:
                break
            print(f"FYERS ERROR:\n{e}")

        if is_running:
            time.sleep(5)


if __name__ == "__main__":
    start_client()
