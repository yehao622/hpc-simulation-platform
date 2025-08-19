#!/usr/bin/env python3
# Simple health check for simulation worker

import sys
import asyncio
import asyncpg
import os

async def check_health():
    try:
        # Test database connection
        conn = await asyncpg.connect(
            host=os.getenv('DB_HOST', 'postgres'),
            port=int(os.getenv('DB_PORT', 5432)),
            user=os.getenv('DB_USER', 'smartops'),
            password=os.getenv('DB_PASSWORD', 'smartops123'),
            database=os.getenv('DB_NAME', 'smartops_platform')
        )
        await conn.close()
        print("healthy")
        return True
    except Exception as e:
        print(f"unhealthy: {e}")
        return False

if __name__ == "__main__":
    result = asyncio.run(check_health())
    sys.exit(0 if result else 1)
