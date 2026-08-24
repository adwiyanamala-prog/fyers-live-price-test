# FYERS Live Price Test

A minimal Python application to test live real-time price feeds from NSE via the FYERS API V3 WebSocket.

---

### Step 1

Install Python (3.10+ recommended).

### Step 2

Create and activate a virtual environment:

```bash
python -m venv venv
```

* macOS / Linux:
```bash
source venv/bin/activate
```

* Windows:
```bash
venv\Scripts\activate
```

### Step 3

Install dependencies:

```bash
pip install -r requirements.txt
```

### Step 4

Create `.env` file (or copy from `.env.example`) and fill in your FYERS credentials:

```text
FYERS_CLIENT_ID=your_client_id
FYERS_ACCESS_TOKEN=your_access_token
```

> Note: Do not hardcode credentials in source code.

### Step 5

Run the test application:

```bash
python app.py
```

* Real-time prices are printed to the terminal and automatically appended to `fyers_prices.csv`.
* Press `CTRL+C` to stop streaming and finalize the CSV file.
