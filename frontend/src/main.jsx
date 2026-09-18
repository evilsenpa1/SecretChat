import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const API_HOST = window.location.hostname || "127.0.0.1";
const API_URL = `http://${API_HOST}:8000`;
const DEFAULT_URL = `ws://${API_HOST}:8000/ws`;

function formatTime() {
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date());
}

function getCookie(name) {
  const cookie = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : "";
}

function App() {
  const socketRef = useRef(null);
  const [mode, setMode] = useState("json");
  const [url, setUrl] = useState(DEFAULT_URL);
  const [payload, setPayload] = useState("Привет из SecretChat");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [authStatus, setAuthStatus] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [chats, setChats] = useState([]);
  const [selectedChatId, setSelectedChatId] = useState("");
  const [chatsLoading, setChatsLoading] = useState(false);
  const [newChatName, setNewChatName] = useState("");
  const [chatStatus, setChatStatus] = useState("");
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState("offline");
  const isConnected = status === "online";
  const selectedChat = chats.find((chat) => String(chat.id) === selectedChatId);
  const visibleEvents = events.filter(
    (event) => event.chatId == null || event.chatId === selectedChatId,
  );

  const addEvent = (type, value, extra = {}) => setEvents((current) => [
    ...current.slice(-49), { id: crypto.randomUUID(), type, value, time: formatTime(), ...extra },
  ]);

  const parseServerMessage = (rawData) => {
    try {
      const message = JSON.parse(rawData);
      if (message?.type !== "message" || !message.data?.client_msg_id) {
        addEvent("in", JSON.stringify(message, null, 2));
        return;
      }

      setEvents((current) => {
        const localIndex = current.findIndex(
          (event) => event.clientMsgId === message.data.client_msg_id,
        );
        if (localIndex === -1) {
          return [...current, {
            id: crypto.randomUUID(),
            type: "in",
            value: JSON.stringify(message, null, 2),
            time: formatTime(),
            chatId: String(message.data.chat_id),
            serverMessage: true,
          }];
        }

        const next = [...current];
        next[localIndex] = {
          ...next[localIndex],
          type: "in",
          value: JSON.stringify(message, null, 2),
          pending: false,
          chatId: String(message.data.chat_id),
          serverMessage: true,
        };
        return next;
      });
    } catch {
      addEvent("in", rawData);
    }
  };

  const loadChats = async () => {
    setChatsLoading(true);
    try {
      const response = await fetch(`${API_URL}/chat`, { credentials: "include" });
      if (!response.ok) throw new Error("Не удалось загрузить чаты");
      const chatList = await response.json();
      setChats(chatList);
      setSelectedChatId((current) => current || String(chatList[0]?.id || ""));
    } catch (error) {
      setAuthStatus(error.message);
      addEvent("error", error.message);
    } finally {
      setChatsLoading(false);
    }
  };

  const createChat = async (event) => {
    event.preventDefault();
    const chatName = newChatName.trim();
    if (!chatName) return;

    setChatStatus("Создаём...");
    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-TOKEN": getCookie("csrf_access_token"),
        },
        credentials: "include",
        body: JSON.stringify({ name: chatName }),
      });
      if (!response.ok) {
        throw new Error(response.status === 401 ? "Сессия истекла" : "Не удалось создать чат");
      }
      const chat = await response.json();
      setChats((current) => [...current, chat]);
      setSelectedChatId(String(chat.id));
      setNewChatName("");
      setChatStatus(`Чат «${chat.name}» создан`);
      addEvent("system", `Создан чат #${chat.id}: ${chat.name}`);
    } catch (error) {
      setChatStatus(error.message);
      addEvent("error", error.message);
    }
  };

  const login = async (event) => {
    event.preventDefault();
    setAuthStatus("Входим...");
    try {
      const response = await fetch(`${API_URL}/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, password }),
      });
      if (!response.ok) throw new Error("Неверное имя или пароль");
      setIsAuthenticated(true);
      setAuthStatus("Вход выполнен");
      addEvent("system", "Токены получены в cookie");
      await loadChats();
    } catch (error) {
      setAuthStatus(error.message);
      addEvent("error", error.message);
    }
  };

  const connect = () => {
    if (isConnected || !url.trim()) return;
    const socket = new WebSocket(url.trim());
    socketRef.current = socket;
    setStatus("connecting");
    addEvent("system", `Подключение к ${url.trim()}`);
    socket.onopen = () => { setStatus("online"); addEvent("system", "Соединение установлено"); };
    socket.onmessage = ({ data }) => parseServerMessage(data);
    socket.onerror = () => addEvent("error", "Ошибка WebSocket");
    socket.onclose = ({ code, reason }) => {
      setStatus("offline"); socketRef.current = null;
      addEvent("system", `Соединение закрыто · ${code}${reason ? ` · ${reason}` : ""}`);
    };
  };

  const disconnect = () => socketRef.current?.close(1000, "Закрыто пользователем");

  const sendMessage = () => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN || !selectedChatId || !payload.trim()) return;
    const clientMsgId = crypto.randomUUID();
    const message = {
      type: "message",
      data: { chat_id: Number(selectedChatId), client_msg_id: clientMsgId, body: payload },
    };
    socketRef.current.send(JSON.stringify(message));
    addEvent("out", JSON.stringify(message, null, 2), {
      clientMsgId,
      pending: true,
      chatId: selectedChatId,
    });
  };

  useEffect(() => () => socketRef.current?.close(), []);

  if (!isAuthenticated) {
    return (
      <main className="shell auth-shell">
        <section className="hero">
          <div className="brand-mark">SC</div>
          <div>
            <p className="eyebrow">WEBSOCKET LAB · LOCAL CLIENT</p>
            <h1>SecretChat <span>sign in</span></h1>
            <p className="subtitle">Войдите, чтобы загрузить ваши чаты.</p>
          </div>
        </section>
        <form className="panel auth-card login-form" onSubmit={login}>
          <div className="panel-heading"><div><span className="section-number">01</span><h2>Вход</h2></div><span className="lock">COOKIE AUTH</span></div>
          <label className="field-label" htmlFor="user-name">Имя пользователя</label>
          <input id="user-name" value={name} onChange={(event) => setName(event.target.value)} required />
          <label className="field-label" htmlFor="user-password">Пароль</label>
          <input id="user-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          <button className="send-button" type="submit">Войти <span>↗</span></button>
          {authStatus && <p className="auth-status">{authStatus}</p>}
        </form>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="hero">
        <div className="brand-mark">SC</div>
        <div>
          <p className="eyebrow">WEBSOCKET LAB · LOCAL CLIENT</p>
          <h1>SecretChat <span>test room</span></h1>
          <p className="subtitle">Небольшая лаборатория для проверки входящих и исходящих кадров.</p>
        </div>
        <div className={`status-pill ${status}`}><i /> {status === "online" ? "online" : status === "connecting" ? "connecting" : "offline"}</div>
      </section>

      <section className="workspace">
        <aside className="panel controls-panel">
          <div className="panel-heading"><div><span className="section-number">01</span><h2>Чат</h2></div><span className="lock">AUTHENTICATED</span></div>
          <label className="field-label">Ваши чаты</label>
          <div className="chat-list" aria-label="Список чатов">
            {!chats.length && <div className="chat-list-empty">{chatsLoading ? "Загрузка чатов..." : "Чаты не найдены"}</div>}
            {chats.map((chat) => {
              const chatId = String(chat.id);
              const messageCount = events.filter((event) => event.chatId === chatId).length;
              return (
                <button
                  className={`chat-item ${chatId === selectedChatId ? "active" : ""}`}
                  key={chat.id}
                  type="button"
                  onClick={() => setSelectedChatId(chatId)}
                >
                  <span className="chat-item-icon">//</span>
                  <span className="chat-item-copy"><strong>{chat.name}</strong><small>CHANNEL #{chat.id}</small></span>
                  <span className="chat-item-count">{messageCount}</span>
                </button>
              );
            })}
          </div>
          <form className="create-chat-form" onSubmit={createChat}>
            <label className="field-label" htmlFor="new-chat-name">Новый чат</label>
            <div className="create-chat-row">
              <input id="new-chat-name" value={newChatName} onChange={(event) => setNewChatName(event.target.value)} placeholder="Название чата" maxLength="100" />
              <button className="secondary-button" type="submit" disabled={!newChatName.trim()}>Создать</button>
            </div>
            {chatStatus && <p className="auth-status">{chatStatus}</p>}
          </form>
          <div className="panel-heading connection-heading"><div><span className="section-number">02</span><h2>Подключение</h2></div></div>
          <label className="field-label" htmlFor="socket-url">WebSocket URL</label>
          <input id="socket-url" value={url} onChange={(event) => setUrl(event.target.value)} disabled={isConnected} />
          <div className="button-row"><button className="primary-button" onClick={connect} disabled={isConnected || status === "connecting"}>Подключить <span>↗</span></button><button className="secondary-button" onClick={disconnect} disabled={!isConnected}>Отключить</button></div>
          <div className="hint"><span>i</span> Cookie `access_token` и `csrf_access_token` браузер добавит автоматически, если backend доступен на этом origin.</div>

          <div className="panel-heading message-heading"><div><span className="section-number">03</span><h2>Отправка</h2></div></div>
          <div className="active-chat-banner"><span className="active-chat-mark" aria-hidden="true">//</span><span>Сейчас в чате <strong>{selectedChat?.name || "не выбран"}</strong></span></div>
          <label className="field-label" htmlFor="message">Сообщение для выбранного чата</label>
          <textarea id="message" value={payload} onChange={(event) => setPayload(event.target.value)} rows="5" />
          <button className="send-button" onClick={sendMessage} disabled={!isConnected || !selectedChatId}>Отправить сообщение <span>→</span></button>
          <p className="mode-note">Сообщение отправляется с client_msg_id и заменяется ответом сервера после сохранения.</p>
        </aside>

        <section className="panel log-panel">
          <div className="panel-heading log-heading"><div><span className="section-number">04</span><h2>{selectedChat?.name || "Журнал событий"}</h2></div><button className="clear-button" onClick={() => setEvents((current) => current.filter((event) => event.chatId != null && event.chatId !== selectedChatId))} disabled={!visibleEvents.length}>Очистить чат</button></div>
          <div className="event-list">
            {!visibleEvents.length && <div className="empty-state"><div className="signal-art" aria-hidden="true"><span>NO SIGNAL</span></div><strong>Канал чист</strong><span>Выберите чат и отправьте первый кадр.</span></div>}
            {visibleEvents.map((event) => <article className={`event ${event.type}`} key={event.id}><div className="event-meta"><span>{event.type === "in" ? "IN" : event.type === "out" ? "OUT" : event.type.toUpperCase()}</span><time>{event.time}</time></div><pre>{event.value}</pre></article>)}
          </div>
        </section>
      </section>
      <footer><span>SECRETCHAT</span><span>FASTAPI / REACT / WEBSOCKET</span></footer>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<StrictMode><App /></StrictMode>);