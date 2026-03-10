# WillChain Bot — HTTP API Reference

Base URL: `http://127.0.0.1:{API_PORT}` (default: 3001)

## Authentication

No authentication required. CORS restricted to `ALLOWED_ORIGIN` (default: `https://willchain.net`).

## Rate Limiting

30 requests per minute per IP address. Returns `429 Too Many Requests` when exceeded.

---

## Endpoints

### POST /verify-link

Verify an EIP-712 wallet link signature.

**Request Body** (max 1KB):

```json
{
  "tgid": 123456789,
  "addr": "0x1234...abcd",
  "nonce": "0xabc123...def456",
  "sig": "0x..."
}
```

| Field  | Type   | Description                              |
|--------|--------|------------------------------------------|
| `tgid` | number | Telegram user ID                         |
| `addr` | string | Ethereum address (checksummed or lower)  |
| `nonce` | string | bytes32 nonce from `/link` command       |
| `sig`  | string | EIP-712 signature from `eth_signTypedData_v4` |

**EIP-712 Domain:**

```json
{
  "name": "WillChain",
  "version": "1",
  "chainId": 84532
}
```

**EIP-712 Types:**

```json
{
  "WalletLink": [
    { "name": "wallet", "type": "address" },
    { "name": "telegramId", "type": "uint256" },
    { "name": "nonce", "type": "bytes32" }
  ]
}
```

**Responses:**

| Status | Body                                      | Condition                     |
|--------|-------------------------------------------|-------------------------------|
| 200    | `{ "ok": true }`                          | Signature valid, wallet linked |
| 400    | `{ "error": "Missing required fields..." }` | Missing tgid/addr/nonce/sig   |
| 400    | `{ "error": "Invalid Ethereum address" }` | Address fails `isAddress()`   |
| 400    | `{ "error": "Challenge not found or expired..." }` | No pending challenge or TTL (5min) expired |
| 400    | `{ "error": "Challenge mismatch" }`       | Address or nonce doesn't match |
| 400    | `{ "error": "..." }`                      | EIP-712 verification failed   |
| 413    | `{ "error": "Payload too large" }`        | Body > 1KB                    |

---

### GET /successors/:address

List owner wallets where `:address` is the designated successor.

**Parameters:**

| Param     | Type   | Description                  |
|-----------|--------|------------------------------|
| `address` | string | Ethereum address (0x-prefixed, 40 hex chars) |

**Response:**

```json
{
  "owners": ["0xabc...def", "0x123...456"]
}
```

Address matching is case-insensitive.

---

### GET /health

Detailed liveness/readiness check with active RPC ping.

**Response (200 OK):**

```json
{
  "ok": true,
  "uptime": 3600,
  "bot": true,
  "contract": true,
  "rpc": true,
  "rpcBlock": 12345678,
  "lastEventBlock": 12345670,
  "blockLagMs": 5000,
  "blockLagAlert": false,
  "ts": "2026-03-07T12:00:00.000Z"
}
```

| Field           | Type    | Description                                          |
|-----------------|---------|------------------------------------------------------|
| `ok`            | boolean | Overall health status                                |
| `uptime`        | number  | Seconds since bot started                            |
| `bot`           | boolean | Telegram bot initialized                             |
| `contract`      | boolean | Contract connection established                      |
| `rpc`           | boolean/null | Active RPC ping result (null if no provider)    |
| `rpcBlock`      | number/null  | Latest block from RPC ping                      |
| `lastEventBlock`| number/null  | Last processed event block                      |
| `blockLagMs`    | number/null  | Ms since last event block update                |
| `blockLagAlert` | boolean | True if no new blocks for >10 minutes                |
| `ts`            | string  | ISO timestamp                                        |

**Returns 503** if any critical component is not ready:
- Bot not initialized
- Contract not connected
- Block lag alert active
- RPC ping failed

---

## Configuration

| Env Variable      | Default                  | Description                    |
|-------------------|--------------------------|--------------------------------|
| `API_PORT`        | `3001`                   | HTTP server port               |
| `FRONTEND_URL`    | `https://willchain.net`  | CORS allowed origin            |
| `TRUST_PROXY`     | `false`                  | Trust `x-forwarded-for` header |

## Security Notes

- Server binds to `127.0.0.1` only (not `0.0.0.0`)
- Body size limited to 1KB
- CORS restricted to single origin
- Rate limited: 30 req/min per IP
- Challenge nonces expire after 5 minutes
- One pending challenge per Telegram user (UPSERT)
