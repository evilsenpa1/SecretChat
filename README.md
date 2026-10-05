# SecretChat

[English](README.md) | [Українська](README.uk.md)

A small pet project for a secure browser chat. Users authenticate through an HTTP API, create shared chats, and exchange messages in real time over WebSockets.

SecretChat is designed as a learning project for private communication. The server manages users, chats, and connections; the browser client encrypts message contents and manages chat keys.

## Features

- user registration and authentication;
- JWT authentication through cookies;
- chat creation and editing;
- invitations, member removal, and chat-key rotation;
- browser-side message encryption with AES-GCM and RSA-OAEP-wrapped chat keys;
- real-time messaging over WebSockets;
- asynchronous PostgreSQL access;
- a separate React client powered by Vite.

## Tech stack

**Backend:** Python 3.13+, FastAPI, WebSockets, SQLAlchemy, Alembic, PostgreSQL, Pydantic, `bcrypt` for password hashing.

**Frontend:** React, Vite, JavaScript, browser Web Crypto API (AES-GCM and RSA-OAEP).

## Getting started

### 1. Configure the environment

Create `.env` from the example file in the project root:

```bash
cp .env.example .env
```

### 2. Run with Docker Compose

Start PostgreSQL:

```bash
docker compose up -d db
```

Apply the migrations:

```bash
docker compose run --rm backend alembic upgrade head
```

Build and start the backend and frontend:

```bash
docker compose up -d --build backend frontend
```

The API will be available at `http://127.0.0.1:8080`, and the frontend at `http://localhost:5173`.

View service logs or stop the services:

```bash
docker compose logs -f backend
docker compose down
```

### 3. Run locally

Start only PostgreSQL with Docker Compose:

```bash
docker compose up -d db
```

Create `.env` from `.env.example` and replace the placeholder secrets. When the backend runs on your host, set `POSTGRES_HOST=127.0.0.1` and `POSTGRES_PORT=5433` to connect to the Compose database. The Compose backend uses `POSTGRES_HOST=db` and `POSTGRES_PORT=5432`.

Install the Python dependencies and activate the virtual environment. For example, with `uv`:

```bash
uv sync
```

Apply existing migrations:

```bash
uv run alembic upgrade head
```

Create a new migration after changing the SQLAlchemy models:

```bash
uv run alembic revision --autogenerate -m "describe the change"
```

Start the backend:

```bash
uv run uvicorn main:app --reload
```

The API will be available at `http://127.0.0.1:8000`.

Start the frontend in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

The Vite client will be available at `http://localhost:5173`.

## Main HTTP routes

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/user` | Create a user |
| `GET` | `/user/me` | Get the current user |
| `GET` | `/user/{id}` | Get a user |
| `POST` | `/auth/login` | Log in and receive auth cookies |
| `POST` | `/auth/refresh` | Refresh auth cookies |
| `POST` | `/chat` | Create a chat |
| `GET` | `/chat` | Get the current user's chats |
| `GET` | `/chat/{chat_id}` | Get a chat by ID |
| `PATCH` | `/chat` | Update a chat |
| `DELETE` | `/chat/{chat_id}` | Delete a chat |
| `GET` | `/chat/{chat_id}/keys` | Get wrapped key versions for the current member |
| `GET` | `/chat/{chat_id}/keys/{version}` | Get a specific wrapped key version |
| `POST` | `/chat/{chat_id}/invites/` | Invite users to a chat |
| `POST` | `/chat/invites/{invite_id}/accept` | Accept an invitation and rotate the chat key |
| `GET` | `/chat/invites/me` | Get the current user's invitations |
| `DELETE` | `/chat/invites/{invite_id}/decline/` | Decline an invitation |
| `DELETE` | `/chat/{chat_id}/members?member_id={member_id}` | Remove members and rotate the chat key (requires a key-rotation payload) |
| `GET` | `/chat/{chat_id}/messages` | Get encrypted message history |

## WebSocket protocol

After authentication, the client connects to `ws://127.0.0.1:8000/ws` when running locally, or `ws://127.0.0.1:8080/ws` with Docker Compose:

```text
ws://127.0.0.1:8000/ws
```

The authentication cookies must be sent with the WebSocket connection.

### Multi-process deployment status

WebSocket connections are currently stored in process-local memory, so messages are broadcast only to clients connected to the same backend process. Running multiple backend workers or replicas requires Redis Pub/Sub to synchronize WebSocket events across processes; this integration is not implemented yet. The Redis service in `docker-compose.yml` is commented out, and the current setup assumes a single backend process.

### Client message

Each message contains an event type and message data. The client generates `client_msg_id` to match the sent message with the server response. The browser encrypts the message body with the current chat AES key before sending it; `body` and `nonce` below are Base64-encoded ciphertext and a 12-byte AES-GCM nonce.

```json
{
  "type": "message",
  "data": {
    "chat_id": 123,
    "client_msg_id": "5b1e...uuid",
    "body": "<base64-ciphertext>",
    "nonce": "<base64-12-byte-nonce>"
  }
}
```

### Server message

The server stores and broadcasts the encrypted event to members of the corresponding chat. It adds `key_version` so clients can select the matching AES key:

```json
{
  "type": "message",
  "data": {
    "id": 456,
    "chat_id": 123,
    "client_msg_id": "5b1e...uuid",
    "body": "<base64-ciphertext>",
    "nonce": "<base64-12-byte-nonce>",
    "key_version": 2
  }
}
```

## Project structure

```text
.
├── chat/       # WebSocket connections, chats, and messages
├── users/      # Users, registration, and authentication
├── core/       # Settings, dependencies, and database
├── alembic/    # Database migrations
├── frontend/   # React client and browser crypto
└── main.py     # FastAPI entry point
```

## Encryption and key storage

- Message encryption uses the browser's built-in Web Crypto API. The browser encrypts message bodies with AES-256-GCM. Each message uses a fresh random nonce; the server stores the ciphertext, nonce, and chat-key version.
- Each chat has versioned AES keys. The client wraps each key for chat members with RSA-OAEP using 2048-bit RSA keys and SHA-256.
- Accepting an invitation or removing a member rotates the chat key. Clients fetch only the wrapped keys available to the authenticated member through `GET /chat/{chat_id}/keys`.
- Private RSA keys stay in the browser and are stored in IndexedDB as non-extractable `CryptoKey` objects. The server stores public keys and per-member wrapped AES keys, not private RSA keys.
- Older JWK keys in browser storage are migrated to IndexedDB only when their public key matches the chat, then the plaintext Web Storage copy is removed.
- The IndexedDB key is **not encrypted with the account password**. Non-extractable prevents exporting the key through Web Crypto, but same-origin JavaScript can still use it; this is not protection against XSS or compromised client code.
- Browser storage is origin-specific: for example, `localhost:5173` and `localhost:5174` have separate keys. Encrypted key backup and restore are not implemented. If browser storage is cleared or the origin changes, the server cannot recover the private key or decrypt old messages.
- In production, serve the frontend over HTTPS and use `wss://` for WebSocket connections.

## Roadmap ideas

- encrypted key backup and restore;
- password-based key-vault unlock;
- message history and pagination;
- delivery and read statuses;
- a typing indicator;
- direct messages and group chats;
