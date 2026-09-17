#!/usr/bin/env python3
"""
Cloud Object Storage Synchronizer (Cloudflare R2 & AWS S3)
Uploads daily compressed Parquet files and Excel archives to Cloudflare R2 or AWS S3.
Provides zero-egress cost access and generates pre-signed download URLs.

Usage:
    python scripts/cloud_sync.py --file PATH [--prefix FOLDER] [--generate-url]
"""

import os
import sys
import argparse
import json
from dotenv import load_dotenv

# Load root .env
load_dotenv(os.path.join(os.getcwd(), ".env"))

def get_s3_client():
    try:
        import boto3
        from botocore.config import Config
    except ImportError:
        return None, "boto3 is not installed"

    # 1. Cloudflare R2 configuration (Zero Egress Fee Target)
    r2_account_id = os.getenv("R2_ACCOUNT_ID")
    r2_access_key = os.getenv("R2_ACCESS_KEY_ID")
    r2_secret_key = os.getenv("R2_SECRET_ACCESS_KEY")
    r2_bucket = os.getenv("R2_BUCKET_NAME")

    if r2_account_id and r2_access_key and r2_secret_key and r2_bucket:
        endpoint_url = f"https://{r2_account_id}.r2.cloudflarestorage.com"
        client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=r2_access_key,
            aws_secret_access_key=r2_secret_key,
            config=Config(signature_version="s3v4"),
            region_name="auto",
        )
        return {"client": client, "bucket": r2_bucket, "type": "Cloudflare R2"}, None

    # 2. Standard AWS S3 fallback
    aws_access_key = os.getenv("AWS_ACCESS_KEY_ID")
    aws_secret_key = os.getenv("AWS_SECRET_ACCESS_KEY")
    s3_bucket = os.getenv("S3_BUCKET_NAME")
    aws_region = os.getenv("AWS_REGION", "ap-south-1")

    if aws_access_key and aws_secret_key and s3_bucket:
        client = boto3.client(
            "s3",
            aws_access_key_id=aws_access_key,
            aws_secret_access_key=aws_secret_key,
            region_name=aws_region,
        )
        return {"client": client, "bucket": s3_bucket, "type": f"AWS S3 ({aws_region})"}, None

    return None, "No Cloudflare R2 or AWS S3 credentials found in .env"

def upload_file(filepath, remote_key=None, generate_url=True):
    if not os.path.exists(filepath):
        return {"success": False, "error": f"File not found: {filepath}"}

    provider, err = get_s3_client()
    if not provider:
        return {"success": False, "skipped": True, "message": err}

    client = provider["client"]
    bucket = provider["bucket"]
    filename = os.path.basename(filepath)
    key = remote_key or f"market_data/{filename}"

    try:
        file_size = os.path.getsize(filepath)
        content_type = "application/octet-stream"
        if filename.endswith(".parquet"):
            content_type = "application/vnd.apache.parquet"
        elif filename.endswith(".xlsx"):
            content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        elif filename.endswith(".csv"):
            content_type = "text/csv"

        client.upload_file(
            filepath,
            bucket,
            key,
            ExtraArgs={"ContentType": content_type}
        )

        result = {
            "success": True,
            "provider": provider["type"],
            "bucket": bucket,
            "key": key,
            "size_bytes": file_size,
            "size_mb": round(file_size / (1024 * 1024), 2),
        }

        if generate_url:
            try:
                url = client.generate_presigned_url(
                    "get_object",
                    Params={"Bucket": bucket, "Key": key},
                    ExpiresIn=86400  # 24 hours
                )
                result["download_url"] = url
            except Exception as url_err:
                result["url_error"] = str(url_err)

        return result
    except Exception as e:
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Upload market data file to Cloudflare R2 or AWS S3")
    parser.add_argument("--file", required=True, help="Path to file to upload")
    parser.add_argument("--prefix", default="market_data", help="Remote folder prefix in bucket")
    parser.add_argument("--generate-url", action="store_true", help="Generate pre-signed download URL")

    args = parser.parse_args()
    key = f"{args.prefix}/{os.path.basename(args.file)}" if args.prefix else os.path.basename(args.file)
    res = upload_file(args.file, remote_key=key, generate_url=args.generate_url)
    print(json.dumps(res, indent=2))
