#!/usr/bin/env python3
"""Test the /api/simulate endpoint"""

import json
import urllib.request

# Test data
data = {
    "business_id": "4e3997dd-5783-4e37-8066-a319cccf3549",
    "twin_layer": None,
    "sim": {
        "useCase": "pricing",
        "businessId": "4e3997dd-5783-4e37-8066-a319cccf3549",
        "experimentLabel": "Test Simulation",
        "priceChangePct": "10",
        "priceScope": "all",
        "nlDescription": "Test price increase"
    }
}

# Make POST request
url = "http://127.0.0.1:8765/api/simulate"
req = urllib.request.Request(
    url,
    data=json.dumps(data).encode('utf-8'),
    headers={'Content-Type': 'application/json'},
    method='POST'
)

try:
    with urllib.request.urlopen(req) as response:
        result = json.loads(response.read().decode('utf-8'))
        print("SUCCESS!")
        print(json.dumps(result, indent=2))
except urllib.error.HTTPError as e:
    print(f"ERROR {e.code}: {e.read().decode('utf-8')}")
except Exception as e:
    print(f"ERROR: {e}")
