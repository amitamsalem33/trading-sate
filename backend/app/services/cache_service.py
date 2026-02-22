# backend/app/services/cache_service.py
"""
Redis cache service with graceful fallback to in-memory dict.
"""
import json
import time
from typing import Any, Optional
from ..config import get_settings

settings = get_settings()

class CacheService:
    def __init__(self):
        self._redis  = None
        self._memory = {}   # fallback
        self._connect()

    def _connect(self):
        try:
            import redis
            self._redis = redis.from_url(settings.redis_url, decode_responses=True)
            self._redis.ping()
            print("✅ Redis connected")
        except Exception as e:
            print(f"⚠️  Redis unavailable, using in-memory cache: {e}")
            self._redis = None

    def get(self, key: str) -> Optional[Any]:
        try:
            if self._redis:
                val = self._redis.get(key)
                return json.loads(val) if val else None
            else:
                entry = self._memory.get(key)
                if entry and entry['expires'] > time.time():
                    return entry['value']
                return None
        except:
            return None

    def set(self, key: str, value: Any, ttl: int = 900):
        try:
            if self._redis:
                self._redis.setex(key, ttl, json.dumps(value, default=str))
            else:
                self._memory[key] = {
                    'value':   value,
                    'expires': time.time() + ttl,
                }
        except:
            pass

    def delete(self, key: str):
        try:
            if self._redis:
                self._redis.delete(key)
            else:
                self._memory.pop(key, None)
        except:
            pass

    def clear_pattern(self, pattern: str):
        try:
            if self._redis:
                keys = self._redis.keys(pattern)
                if keys:
                    self._redis.delete(*keys)
        except:
            pass


cache_service = CacheService()
