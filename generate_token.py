import hashlib, json, webbrowser, urllib.parse, sys, os

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
    # Try as full URL first
    if raw.startswith("http"):
        parsed = urllib.parse.urlparse(raw)
        params = urllib.parse.parse_qs(parsed.query)
        code = params.get("auth_code", [None])[0] or params.get("code", [None])[0]
        if code and code != "200":
            return code
    # Otherwise treat raw input as the auth_code itself
    return raw

def main():
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    load_dotenv(env_path)

    print("=" * 60)
    print("  FYERS Access Token Generator")
    print("=" * 60)

    app_id = os.getenv("FYERS_CLIENT_ID", "").strip()
    if app_id and app_id not in ("test_client_id", "your_client_id_here"):
        print(f"\nApp ID from .env: {app_id}")
        use = input("Use this? (y/n): ").strip().lower()
        if use != "y":
            app_id = input("Enter App ID: ").strip()
    else:
        app_id = input("\nEnter your Fyers App ID: ").strip()

    secret_key = input("Enter your Fyers Secret Key: ").strip()
    redirect_uri = input("Redirect URI (Enter = https://127.0.0.1): ").strip() or "https://127.0.0.1"

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

    save = input("\nSave to .env and enable live mode? (y/n): ").strip().lower()
    if save == "y":
        set_key(env_path, "FYERS_CLIENT_ID", app_id)
        set_key(env_path, "FYERS_ACCESS_TOKEN", access_token)
        set_key(env_path, "MOCK_MODE", "false")
        print("\nDone! .env updated. Restart npm run dev to go live.")
    else:
        print(f"\nAccess token:\n{access_token}")

if __name__ == "__main__":
    main()
