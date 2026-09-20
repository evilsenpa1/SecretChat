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

Create `.env` from the example file in the project root:

```bash
cp .env.example .env
```

### 2. Run with Docker Compose

Build the images and start PostgreSQL:

```bash
docker compose up -d --build db
```

Apply the migrations:

```bash
docker compose run --rm backend alembic upgrade head
```

Start the backend and frontend:

```bash
docker compose up -d backend frontend
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

Create `.env` from `.env.example` and adjust the database connection values for your local setup.

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
