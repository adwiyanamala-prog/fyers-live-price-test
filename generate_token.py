import hashlib, json, webbrowser, urllib.parse, sys, os, re

try:
    import requests
except ImportError:
    os.system(f"{sys.executable} -m pip install requests")
    import requests

try:
    from dotenv import load_dotenv, set_key
except ImportError:
    os.system(f"{sys.executable} -m pip install python-dotenv")
    from dotenv import load_dotenv, set_key

def sha256(text):
    return hashlib.sha256(text.encode()).hexdigest()

def extract_auth_code(raw):
    raw = raw.strip()
    # 1. Regex search for auth_code param (handles full URL or partial string)
    match = re.search(r'[?&]auth_code=([^&#\s]+)', raw)
    if match:
        return urllib.parse.unquote(match.group(1))

    # 2. Add protocol if user copied 127.0.0.1 without https://
    if "://" not in raw and ("127.0.0.1" in raw or "localhost" in raw):
        raw = "https://" + raw

    if raw.startswith("http"):
        try:
            parsed = urllib.parse.urlparse(raw)
            params = urllib.parse.parse_qs(parsed.query)
            code = params.get("auth_code", [None])[0] or params.get("code", [None])[0]
            if code and code != "200":
                return code
        except Exception:
            pass

    return raw

def main():
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    load_dotenv(env_path)

    print("=" * 60)
    print("  FYERS Access Token Generator")
    print("=" * 60)

    print("Select which token to generate:")
    print("  1) Market Data App (Quotes, Websockets, Historical Data)")
    print("  2) Algo Trading App (Live Order Placement, Positions, Margins)")
    app_choice = input("Choice [1 or 2, default=1]: ").strip()
    is_trading_app = (app_choice == "2")

    if is_trading_app:
        print("\n--- Configuring FYERS Algo Trading App ---")
        client_key_name = "FYERS_TRADE_CLIENT_ID"
        secret_key_name = "FYERS_TRADE_SECRET_KEY"
        token_key_name = "FYERS_TRADE_ACCESS_TOKEN"
    else:
        print("\n--- Configuring FYERS Market Data App ---")
        client_key_name = "FYERS_CLIENT_ID"
        secret_key_name = "FYERS_SECRET_KEY"
        token_key_name = "FYERS_ACCESS_TOKEN"

    app_id = os.getenv(client_key_name, "").strip().strip("'\"")
    saved_secret = os.getenv(secret_key_name, "").strip().strip("'\"")
    default_redirect = os.getenv("FYERS_REDIRECT_URL", "https://127.0.0.1").strip().strip("'\"")

    if app_id and app_id not in ("test_client_id", "your_client_id_here"):
        print(f"\nApp ID from .env ({client_key_name}): {app_id}")
        use = input("Use this? (Y/n): ").strip().lower()
        if use == "n":
            app_id = input("Enter App ID: ").strip()
    else:
        app_id = input(f"\nEnter your {client_key_name}: ").strip()

    if saved_secret:
        print(f"Secret Key: [Saved in .env ({saved_secret[:4]}...)]")
        use_s = input("Use saved secret key? (Y/n): ").strip().lower()
        if use_s == "n":
            secret_key = input("Enter your Secret Key: ").strip()
        else:
            secret_key = saved_secret
    else:
        secret_key = input("Enter your Secret Key: ").strip()

    redirect_prompt = f"Redirect URI (Enter = {default_redirect}): "
    redirect_uri = input(redirect_prompt).strip() or default_redirect

    login_url = (
        f"https://api-t1.fyers.in/api/v3/generate-authcode"
        f"?client_id={app_id}"
        f"&redirect_uri={urllib.parse.quote(redirect_uri, safe='')}"
        f"&response_type=code&state=sample"
    )

    print(f"\nOpening login page in browser...")
    print(f"URL: {login_url}\n")
    webbrowser.open(login_url)

    print("After login, browser redirects to your redirect URI.")
    print("You can paste EITHER:")
    print("  - The full redirect URL from the address bar")
    print("  - Just the auth_code value from the URL\n")

    raw = input("Paste URL or auth_code here: ").strip()
    auth_code = extract_auth_code(raw)

    if not auth_code:
        print("ERROR: Could not extract auth_code. Try pasting just the auth_code value.")
        sys.exit(1)

    print(f"\n[OK] auth_code: {auth_code[:15]}...")

    app_id_hash = sha256(f"{app_id}:{secret_key}")
    print("Exchanging for access token...")

    resp = requests.post(
        "https://api-t1.fyers.in/api/v3/validate-authcode",
        json={"grant_type": "authorization_code", "appIdHash": app_id_hash, "code": auth_code},
        headers={"Content-Type": "application/json"},
        timeout=15
    )
    data = resp.json()

    if data.get("s") == "error" or not data.get("access_token"):
        print(f"\nERROR: {json.dumps(data, indent=2)}")
        sys.exit(1)

    access_token = data["access_token"]
    print(f"[OK] Access token received: {access_token[:20]}...")

    save = input(f"\nSave to .env ({token_key_name}) and enable live mode? (Y/n): ").strip().lower()
    if save != "n":
        set_key(env_path, client_key_name, app_id)
        set_key(env_path, secret_key_name, secret_key)
        set_key(env_path, token_key_name, access_token)
        set_key(env_path, "FYERS_REDIRECT_URL", redirect_uri)
        set_key(env_path, "MOCK_MODE", "false")
        print(f"\nDone! .env updated with fresh Access Token for {client_key_name}. Live mode enabled.")
    else:
        print(f"\nAccess token:\n{access_token}")

if __name__ == "__main__":
    main()
