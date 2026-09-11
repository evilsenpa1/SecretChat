# SecretChat

[English](README.md) | [Українська](README.uk.md)

A small pet project for a secure browser chat. Users authenticate through an HTTP API, create shared chats, and exchange messages in real time over WebSockets.

SecretChat is designed as a learning project for private communication: the server manages users, chats, and connections, while the message format stays simple for client applications.

## Features

- user registration and authentication;
- JWT authentication through cookies;
- chat creation and editing;
- adding members to a chat;
- real-time messaging over WebSockets;
- asynchronous PostgreSQL access;
- a separate React client powered by Vite.

## Tech stack

**Backend:** Python 3.13+, FastAPI, WebSockets, SQLAlchemy, Alembic, PostgreSQL, Pydantic, `cryptography`.

**Frontend:** React, Vite, JavaScript.

## Getting started

### 1. Configure the environment

Create a `.env` file in the project root:

```env
DB_USER=postgres
DB_PASSWORD=your_password
DB_HOST=localhost
DB_PORT=5432
DB_NAME=secretchat
DEBUG=true
JWT_SECRET_KEY=change-me-to-a-long-random-secret
```

Install the Python dependencies and activate the virtual environment. For example, with `uv`:

```bash
uv sync
```

### 2. Start the backend

```bash
uv run uvicorn main:app --reload
```

The API will be available at `http://127.0.0.1:8000`.

### 3. Start the frontend

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
| `POST` | `/auth` | Log in and receive auth cookies |
| `GET` | `/user/{id}` | Get a user |
| `POST` | `/chat` | Create a chat |
| `GET` | `/chat` | Get the current user's chats |
| `GET` | `/chat/{chat_id}` | Get a chat by ID |
| `PATCH` | `/chat` | Update a chat |

## WebSocket protocol

After authentication, the client connects to:

```text
ws://127.0.0.1:8000/ws
```

The authentication cookies must be sent with the WebSocket connection.

### Client message

Each message contains an event type and message data. The client generates `client_msg_id` to match the sent message with the server response.

```json
{
  "type": "message",
  "data": {
    "chat_id": 123,
    "client_msg_id": "5b1e...uuid",
    "body": "Hello!"
  }
}
```

### Server message

The server broadcasts the event to members of the corresponding chat:

```json
{
  "type": "message",
  "data": {
    "id": 456,
    "chat_id": 123,
    "client_msg_id": "5b1e...uuid",
    "body": "Hello!"
  }
}
```

## Project structure

```text
.
├── chat/       # WebSocket connections, chats, and messages
├── users/      # Users, registration, and authentication
├── core/       # Settings, dependencies, and database
├── frontend/   # React client
└── main.py     # FastAPI entry point
```

## Encryption status

SecretChat is evolving as a secure communication project. WebSocket access is protected by authentication, and the `cryptography` dependency is ready for future encryption work. In production, the connection should run over `wss://` behind an HTTPS proxy, with end-to-end message encryption implemented separately if the server must not access message contents.

## Roadmap ideas

- full end-to-end message encryption;
- message history and pagination;
- delivery and read statuses;
- a typing indicator;
- direct messages and group chats;