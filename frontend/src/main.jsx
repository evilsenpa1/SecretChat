import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createChatKey,
  decryptChatKey,
  decryptMessage,
  encryptMessage,
  exportPublicKey,
  getChatKeyPair,
  getRsaStorageKey,
  importPublicKey,
  wrapChatKey,
} from "./chatCrypto.js";
import "./styles.css";

const API_HOST = window.location.hostname || "127.0.0.1";
const API_URL = `http://${API_HOST}:8080`;
const DEFAULT_URL = `ws://${API_HOST}:8080/ws`;

function formatTime() {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date());
}

function getCookie(name) {
  const cookie = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : "";
}

function App() {
  const socketRef = useRef(null);
  const connectAttemptRef = useRef(false);
  const chatRsaKeysRef = useRef(new Map());
  const chatKeysRef = useRef(new Map());
  const chatKeyVersionsRef = useRef(new Map());
  const messagesRequestRef = useRef(0);
  const loadedChatsRef = useRef(new Set());
  const [payload, setPayload] = useState("Привет из SecretChat");
  const [name, setName] = useState(() => localStorage.getItem("secret-chat-user") || "");
  const [password, setPassword] = useState("");
  const [authStatus, setAuthStatus] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(localStorage.getItem("secret-chat-user")));
  const [chats, setChats] = useState([]);
  const [selectedChatId, setSelectedChatId] = useState("");
  const [chatsLoading, setChatsLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [newChatName, setNewChatName] = useState("");
  const [cryptoStatus, setCryptoStatus] = useState("Готовим уникальные ключи чата...");
  const [chatMetaName, setChatMetaName] = useState("");
  const [chatMetaOwnerId, setChatMetaOwnerId] = useState("");
  const [newMemberId, setNewMemberId] = useState("");
  const [currentUserId, setCurrentUserId] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [invites, setInvites] = useState([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [inviteStatus, setInviteStatus] = useState("");
  const [inviteActionId, setInviteActionId] = useState("");
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [chatStatus, setChatStatus] = useState("");
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState("offline");
  const isConnected = status === "online";
  const selectedChat = chats.find((chat) => String(chat.id) === selectedChatId);
  const visibleEvents = events.filter(
    (event) => event.chatId == null || event.chatId === selectedChatId,
  );

  useEffect(() => {
    if (typeof crypto?.subtle === "undefined") {
      setCryptoStatus("Web Crypto недоступен: нужен HTTPS или localhost");
      return;
    }
    setCryptoStatus("RSA-OAEP 2048 + AES-256-GCM готовы для каждого чата");
  }, []);

  const addEvent = (type, value, extra = {}) => setEvents((current) => [
    ...current.slice(-49), { id: crypto.randomUUID(), type, value, time: formatTime(), ...extra },
  ]);

  const refreshChatKey = async (chatId) => {
    const normalizedChatId = String(chatId);
    const currentKey = chatKeysRef.current.get(normalizedChatId);
    const rsaPair = chatRsaKeysRef.current.get(normalizedChatId);
    if (!rsaPair) return currentKey;

    try {
      const response = await fetch(`${API_URL}/chat/${chatId}/keys`, { credentials: "include" });
      if (!response.ok) return currentKey;
      const keys = await response.json();
      const latestKey = keys.reduce(
        (latest, key) => (!latest || key.version > latest.version ? key : latest),
        null,
      );
      if (!latestKey || latestKey.version <= (chatKeyVersionsRef.current.get(normalizedChatId) || 0)) {
        return currentKey;
      }

      const aesKey = await decryptChatKey(rsaPair.privateKey, latestKey.encrypted_key);
      chatKeysRef.current.set(normalizedChatId, aesKey);
      chatKeyVersionsRef.current.set(normalizedChatId, latestKey.version);
      return aesKey;
    } catch {
      return currentKey;
    }
  };

  const parseServerMessage = async (rawData) => {
    try {
      const message = JSON.parse(rawData);
      if (message?.type !== "message" || !message.data?.client_msg_id) {
        addEvent("in", JSON.stringify(message, null, 2));
        return;
      }

      let displayMessage = message;
      let aesKey = chatKeysRef.current.get(String(message.data.chat_id));
      if (aesKey && message.data?.nonce) {
        try {
          displayMessage = {
            ...message,
            data: {
              ...message.data,
              body: await decryptMessage(aesKey, message.data.body, message.data.nonce),
            },
          };
        } catch {
          aesKey = await refreshChatKey(message.data.chat_id);
          try {
            displayMessage = {
              ...message,
              data: {
                ...message.data,
                body: await decryptMessage(aesKey, message.data.body, message.data.nonce),
              },
            };
          } catch {
            // Keep the encrypted payload visible when no matching key is available.
          }
        }
      }

      setEvents((current) => {
        const existingMessageIndex = current.findIndex(
          (event) => event.messageId === String(message.data.id),
        );
        if (existingMessageIndex !== -1) {
          return current;
        }

        const localIndex = current.findIndex(
          (event) => event.clientMsgId === message.data.client_msg_id,
        );
        if (localIndex === -1) {
          return [...current, {
            id: crypto.randomUUID(),
            type: "in",
            value: JSON.stringify(displayMessage, null, 2),
            time: formatTime(),
            chatId: String(message.data.chat_id),
            messageId: String(message.data.id),
            serverMessage: true,
          }];
        }

        const next = [...current];
        next[localIndex] = {
          ...next[localIndex],
          type: "in",
          value: JSON.stringify(displayMessage, null, 2),
          pending: false,
          chatId: String(message.data.chat_id),
          messageId: String(message.data.id),
          serverMessage: true,
        };
        return next;
      });
    } catch {
      addEvent("in", rawData);
    }
  };

  const loadMessages = async (chatId) => {
    const normalizedChatId = String(chatId);
    if (loadedChatsRef.current.has(normalizedChatId)) {
      setMessagesLoading(false);
      return;
    }

    const requestId = messagesRequestRef.current + 1;
    messagesRequestRef.current = requestId;
    setMessagesLoading(true);
    try {
      const response = await fetch(`${API_URL}/chat/${chatId}/messages`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Не удалось загрузить сообщения");
      }

      const messages = await response.json();
      if (requestId !== messagesRequestRef.current) return;
      const historyEvents = messages.map((message) => ({
        id: `history-${message.id}`,
        type: "in",
        value: JSON.stringify({
          type: "message",
          data: message,
        }, null, 2),
        time: message.created_at
          ? new Intl.DateTimeFormat("ru-RU", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }).format(new Date(message.created_at))
          : "--:--:--",
        chatId: String(message.chat_id),
        messageId: String(message.id),
        historyMessage: true,
      }));

      const aesKey = chatKeysRef.current.get(normalizedChatId);
      if (aesKey) {
        await Promise.all(historyEvents.map(async (event) => {
          try {
            const message = JSON.parse(event.value);
            if (!message.data?.nonce) {
              return;
            }
            message.data.body = await decryptMessage(aesKey, message.data.body, message.data.nonce);
            event.value = JSON.stringify(message, null, 2);
          } catch {
            // Keep legacy plaintext messages visible.
          }
        }));
      }

      loadedChatsRef.current.add(normalizedChatId);
      const historyMessageIds = new Set(historyEvents.map((event) => event.messageId));
      setEvents((current) => {
        const liveChatEvents = current.filter(
          (event) => event.chatId === normalizedChatId
            && !event.historyMessage
            && (!event.messageId || !historyMessageIds.has(event.messageId)),
        );
        return [
          ...current.filter((event) => event.chatId !== normalizedChatId),
          ...liveChatEvents,
          ...historyEvents,
        ].slice(-50);
      });
    } catch (error) {
      if (requestId === messagesRequestRef.current) {
        setChatStatus(error.message);
      }
    } finally {
      if (requestId === messagesRequestRef.current) {
        setMessagesLoading(false);
      }
    }
  };

  const loadProfile = async () => {
    setProfileLoading(true);
    try {
      const response = await fetch(`${API_URL}/user/me`, { credentials: "include" });
      if (response.status === 401) {
        localStorage.removeItem("secret-chat-user");
        setName("");
        setIsAuthenticated(false);
        setAuthStatus("Сессия истекла, войдите снова");
        throw new Error("Не удалось загрузить профиль пользователя: сессия истекла");
      }
      if (!response.ok) {
        throw new Error(`Не удалось загрузить профиль пользователя (${response.status})`);
      }
      const profile = await response.json();
      setCurrentUserId(profile.id);
      setInviteStatus((current) => current.startsWith("Не удалось загрузить профиль пользователя") ? "" : current);
      return profile;
    } catch (error) {
      setCurrentUserId(null);
      setInviteStatus(error.message);
      return null;
    } finally {
      setProfileLoading(false);
    }
  };

  const loadChats = async () => {
    setChatsLoading(true);
    try {
      const response = await fetch(`${API_URL}/chat`, { credentials: "include" });
      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem("secret-chat-user");
          setName("");
          setIsAuthenticated(false);
          setAuthStatus("Сессия истекла, войдите снова");
          throw new Error("Сессия истекла, войдите снова");
        }
        throw new Error("Не удалось загрузить чаты");
      }
      const chatList = await response.json();
      setChats(chatList);
      setSelectedChatId((current) => current || String(chatList[0]?.id || ""));
      await Promise.all(chatList.map(async (chat) => {
        try {
          const ownMember = chat.members?.find((member) => member.name === name);
          const rsaPair = await getChatKeyPair(chat.id, name, ownMember?.public_key);
          chatRsaKeysRef.current.set(String(chat.id), rsaPair);
          const keyResponse = await fetch(`${API_URL}/chat/${chat.id}/keys`, { credentials: "include" });
          const keys = await keyResponse.json();
          const currentKey = keys.find((key) => key.version === chat.current_key_version);
          if (keyResponse.ok && currentKey) {
            const aesKey = await decryptChatKey(rsaPair.privateKey, currentKey.encrypted_key);
            chatKeysRef.current.set(String(chat.id), aesKey);
            chatKeyVersionsRef.current.set(String(chat.id), currentKey.version);
          }
        } catch {
          // A chat can be listed before its key is available.
        }
      }));
      return true;
    } catch (error) {
      setAuthStatus(error.message);
      addEvent("error", error.message);
      return false;
    } finally {
      setChatsLoading(false);
    }
  };

  const loadInvites = async () => {
    setInvitesLoading(true);
    try {
      const response = await fetch(`${API_URL}/chat/invites/me`, { credentials: "include" });
      if (!response.ok) throw new Error("Не удалось загрузить приглашения");
      setInvites(await response.json());
    } catch (error) {
      setInviteStatus(error.message);
    } finally {
      setInvitesLoading(false);
    }
  };

  const sendInvite = async (event) => {
    event.preventDefault();
    if (!selectedChat || !newMemberId) return;
    if (selectedChat.owner?.id !== currentUserId) {
      setInviteStatus("Приглашать участников может только владелец чата");
      return;
    }

    const memberId = Number(newMemberId);
    if (!Number.isSafeInteger(memberId) || memberId <= 0) {
      setInviteStatus("Укажите корректный ID пользователя");
      return;
    }
    if (selectedChat.members?.some((member) => member.id === memberId)) {
      setInviteStatus("Этот пользователь уже состоит в чате");
      return;
    }

    setInviteSubmitting(true);
    setInviteStatus("Отправляем приглашение...");
    try {
      const response = await fetch(`${API_URL}/chat/${selectedChat.id}/invites/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-TOKEN": getCookie("csrf_access_token"),
        },
        credentials: "include",
        body: JSON.stringify({ user_ids: [memberId] }),
      });
      if (!response.ok) {
        throw new Error(response.status === 403
          ? "Приглашать участников может только владелец чата"
          : "Не удалось отправить приглашение");
      }
      setNewMemberId("");
      setInviteStatus(`Приглашение пользователю #${memberId} отправлено`);
    } catch (error) {
      setInviteStatus(error.message);
    } finally {
      setInviteSubmitting(false);
    }
  };

  const acceptInvite = async (invite) => {
    if (!currentUserId) {
      setInviteStatus("Профиль ещё не загружен. Обновите страницу или войдите снова.");
      return;
    }

    setInviteActionId(String(invite.id));
    setInviteStatus("Подготавливаем ключи чата...");
    try {
      const chatResponse = await fetch(`${API_URL}/chat/${invite.chat_id}`, {
        credentials: "include",
      });
      if (!chatResponse.ok) throw new Error("Не удалось загрузить данные чата");
      const chat = await chatResponse.json();
      if (chat.members?.some((member) => member.id === currentUserId)) {
        throw new Error("Вы уже состоите в этом чате");
      }

      const rsaPair = await getChatKeyPair(chat.id, name);
      const publicKey = await exportPublicKey(rsaPair.publicKey);
      const { aesKey } = await createChatKey(rsaPair.publicKey);
      const wrappedKeys = await Promise.all((chat.members || []).map(async (member) => {
        let memberPublicKey;
        try {
          memberPublicKey = await importPublicKey(member.public_key);
        } catch {
          throw new Error(
            `Участник ${member.name} (#${member.id}) имеет некорректный RSA-ключ. `
            + "Чат создан с тестовой заглушкой ключа; его нужно пересоздать с фронтенда.",
          );
        }
        return {
          user_id: member.id,
          encrypted_key: await wrapChatKey(aesKey, memberPublicKey),
        };
      }));
      wrappedKeys.push({
        user_id: currentUserId,
        encrypted_key: await wrapChatKey(aesKey, rsaPair.publicKey),
      });

      const response = await fetch(`${API_URL}/chat/invites/${invite.id}/accept`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-TOKEN": getCookie("csrf_access_token"),
        },
        credentials: "include",
        body: JSON.stringify({
          new_version: chat.current_key_version + 1,
          new_members: [{ member_id: currentUserId, public_key: publicKey }],
          wrapped_keys: wrappedKeys,
        }),
      });
      if (!response.ok) throw new Error("Не удалось принять приглашение");

      const updatedChat = await response.json();
      chatRsaKeysRef.current.set(String(updatedChat.id), rsaPair);
      chatKeysRef.current.set(String(updatedChat.id), aesKey);
      chatKeyVersionsRef.current.set(String(updatedChat.id), updatedChat.current_key_version);
      setChats((current) => [
        ...current.filter((item) => item.id !== updatedChat.id),
        updatedChat,
      ]);
      setInvites((current) => current.filter((item) => item.id !== invite.id));
      setSelectedChatId(String(updatedChat.id));
      setInviteStatus(`Вы присоединились к чату «${updatedChat.name}»`);
    } catch (error) {
      setInviteStatus(error.message);
    } finally {
      setInviteActionId("");
    }
  };

  const declineInvite = async (invite) => {
    setInviteActionId(String(invite.id));
    setInviteStatus("Отклоняем приглашение...");
    try {
      const response = await fetch(`${API_URL}/chat/invites/${invite.id}/decline/`, {
        method: "DELETE",
        headers: { "X-CSRF-TOKEN": getCookie("csrf_access_token") },
        credentials: "include",
      });
      if (!response.ok) throw new Error("Не удалось отклонить приглашение");
      setInvites((current) => current.filter((item) => item.id !== invite.id));
      setInviteStatus("Приглашение отклонено");
    } catch (error) {
      setInviteStatus(error.message);
    } finally {
      setInviteActionId("");
    }
  };

  const createChat = async (event) => {
    event.preventDefault();
    const chatName = newChatName.trim();
    if (!chatName || typeof crypto?.subtle === "undefined") return;

    const temporaryChatId = `temp-${Date.now()}`;
    const temporaryKeyStorageKey = getRsaStorageKey(name, temporaryChatId);

    setChatStatus("Создаём...");
    try {
      const chatRsaPair = await getChatKeyPair(temporaryChatId, name);
      const publicKey = await exportPublicKey(chatRsaPair.publicKey);
      const { aesKey, encryptedKey } = await createChatKey(chatRsaPair.publicKey);
      const response = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-TOKEN": getCookie("csrf_access_token"),
        },
        credentials: "include",
        body: JSON.stringify({
          name: chatName,
          public_key: publicKey,
          encrypted_key: encryptedKey,
        }),
      });
      if (!response.ok) {
        throw new Error(response.status === 401 ? "Сессия истекла" : "Не удалось создать чат");
      }
      const chat = await response.json();
      const storedPair = {
        publicKey: await crypto.subtle.exportKey("jwk", chatRsaPair.publicKey),
        privateKey: await crypto.subtle.exportKey("jwk", chatRsaPair.privateKey),
      };
      const serializedPair = JSON.stringify(storedPair);
      const chatKeyStorageKey = getRsaStorageKey(name, chat.id);
      sessionStorage.setItem(chatKeyStorageKey, serializedPair);
      sessionStorage.removeItem(temporaryKeyStorageKey);
      chatRsaKeysRef.current.set(String(chat.id), chatRsaPair);
      chatKeysRef.current.set(String(chat.id), aesKey);
      setChats((current) => [...current, chat]);
      setSelectedChatId(String(chat.id));
      setNewChatName("");
      setChatStatus(`Чат «${chat.name}» создан`);
      addEvent("system", `Создан чат #${chat.id}: ${chat.name}`);
    } catch (error) {
      sessionStorage.removeItem(temporaryKeyStorageKey);
      setChatStatus(error.message);
      addEvent("error", error.message);
    }
  };

  const patchChatMetadata = async (event) => {
    event.preventDefault();
    if (!selectedChatId) return;

    setChatStatus("Обновляем метаданные...");
    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-TOKEN": getCookie("csrf_access_token"),
        },
        credentials: "include",
        body: JSON.stringify({
          id: Number(selectedChatId),
          name: chatMetaName.trim() || null,
          owner_id: chatMetaOwnerId ? Number(chatMetaOwnerId) : null,
        }),
      });
      if (!response.ok) throw new Error("Не удалось обновить метаданные");
      const chat = await response.json();
      setChats((current) => current.map((item) => item.id === chat.id ? chat : item));
      setChatMetaName("");
      setChatMetaOwnerId("");
      setChatStatus("Метаданные обновлены");
    } catch (error) {
      setChatStatus(error.message);
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
      localStorage.setItem("secret-chat-user", name);
      setIsAuthenticated(true);
      setAuthStatus("Вход выполнен");
      addEvent("system", "Токены получены в cookie");
      await loadProfile();
      if (await loadChats()) connect();
      await loadInvites();
    } catch (error) {
      setAuthStatus(error.message);
      addEvent("error", error.message);
    }
  };

  const connect = () => {
    if (connectAttemptRef.current || isConnected) return;
    connectAttemptRef.current = true;
    const socket = new WebSocket(DEFAULT_URL);
    socketRef.current = socket;
    setStatus("connecting");
    addEvent("system", `Подключение к ${DEFAULT_URL}`);
    socket.onopen = () => {
      setStatus("online");
      addEvent("system", "Соединение установлено");
    };
    socket.onmessage = ({ data }) => parseServerMessage(data);
    socket.onerror = () => addEvent("error", "Ошибка WebSocket");
    socket.onclose = ({ code, reason }) => {
      connectAttemptRef.current = false;
      setStatus("offline");
      socketRef.current = null;
      addEvent("system", `Соединение закрыто · ${code}${reason ? ` · ${reason}` : ""}`);
    };
  };

  const sendMessage = async () => {
    if (
      !socketRef.current
      || socketRef.current.readyState !== WebSocket.OPEN
      || !selectedChatId
      || !payload.trim()
    ) {
      return;
    }
    const aesKey = await refreshChatKey(selectedChatId);
    if (!aesKey) {
      addEvent("error", "Ключ AES этого чата ещё не расшифрован");
      return;
    }
    const clientMsgId = crypto.randomUUID();
    try {
      const { body, nonce } = await encryptMessage(aesKey, payload);
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        return;
      }
      const message = {
        type: "message",
        data: { chat_id: Number(selectedChatId), client_msg_id: clientMsgId, body, nonce },
      };
      socketRef.current.send(JSON.stringify(message));
      addEvent("out", JSON.stringify({ ...message, data: { ...message.data, body: payload } }, null, 2), {
        clientMsgId,
        pending: true,
        chatId: selectedChatId,
      });
    } catch (error) {
      addEvent("error", error.message);
    }
  };

  useEffect(() => {
    let active = true;
    if (localStorage.getItem("secret-chat-user")) {
      loadProfile();
      loadChats().then((loaded) => {
        if (active && loaded) connect();
      });
      loadInvites();
    }
    return () => {
      active = false;
      socketRef.current?.close();
    };
  }, []);
  useEffect(() => {
    if (selectedChatId) loadMessages(selectedChatId);
  }, [selectedChatId]);

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
          <div className="panel-heading">
            <div>
              <span className="section-number">01</span>
              <h2>Вход</h2>
            </div>
            <span className="lock">COOKIE AUTH</span>
          </div>
          <label className="field-label" htmlFor="user-name">Имя пользователя</label>
          <input
            id="user-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
          <label className="field-label" htmlFor="user-password">Пароль</label>
          <input
            id="user-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <button className="send-button" type="submit">
            Войти <span>↗</span>
          </button>
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
        <div className="topbar-actions">
          <div className="user-pill">
            Аккаунт: <strong>{name || "guest"}</strong>
          </div>
          <div className={`status-pill ${status}`}>
            <i /> {status === "online" ? "online" : status === "connecting" ? "connecting" : "offline"}
          </div>
        </div>
      </section>
      <section className="workspace">
        <aside className="panel controls-panel">
          <div className="panel-heading">
            <div>
              <span className="section-number">01</span>
              <h2>Чат</h2>
            </div>
            <span className="lock">AUTHENTICATED</span>
          </div>
          <label className="field-label">Ваши чаты</label>
          <div className="chat-list" aria-label="Список чатов">
            {!chats.length && (
              <div className="chat-list-empty">
                {chatsLoading ? "Загрузка чатов..." : "Чаты не найдены"}
              </div>
            )}
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
                  <span className="chat-item-copy">
                    <strong>{chat.name}</strong>
                    <small>CHANNEL #{chat.id}</small>
                  </span>
                  <span className="chat-item-count">{messageCount}</span>
                </button>
              );
            })}
          </div>
          <form className="create-chat-form" onSubmit={createChat}>
            <label className="field-label" htmlFor="new-chat-name">Новый чат</label>
            <div className="create-chat-row">
              <input
                id="new-chat-name"
                value={newChatName}
                onChange={(event) => setNewChatName(event.target.value)}
                placeholder="Название чата"
                maxLength="100"
              />
              <button
                className="secondary-button"
                type="submit"
                disabled={!newChatName.trim() || typeof crypto?.subtle === "undefined"}
              >
                Создать
              </button>
            </div>
            <p className="crypto-status">{cryptoStatus}</p>
            {chatStatus && <p className="auth-status">{chatStatus}</p>}
          </form>
          <div className="panel-heading management-heading">
            <div>
              <span className="section-number">02</span>
              <h2>Приглашения</h2>
            </div>
            <button
              className="text-button"
              type="button"
              onClick={loadInvites}
              disabled={invitesLoading}
              aria-label="Обновить приглашения"
              title="Обновить приглашения"
            >
              {invitesLoading ? "..." : "Обновить"}
            </button>
          </div>
          <div className="invite-list" aria-live="polite">
            {invitesLoading && !invites.length && <p className="invite-empty">Загружаем приглашения...</p>}
            {!invitesLoading && !invites.length && <p className="invite-empty">Новых приглашений нет</p>}
            {invites.map((invite) => (
              <article className="invite-item" key={invite.id}>
                <div className="invite-copy">
                  <strong>{invite.chat_name}</strong>
                  <small>Чат #{invite.chat_id} · приглашение #{invite.id}</small>
                </div>
                <div className="invite-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => acceptInvite(invite)}
                    disabled={Boolean(inviteActionId) || profileLoading || !currentUserId}
                    title={profileLoading ? "Загружаем профиль" : !currentUserId ? "Не удалось получить ID аккаунта" : "Принять приглашение"}
                  >
                    Принять
                  </button>
                  <button
                    className="text-button danger-button"
                    type="button"
                    onClick={() => declineInvite(invite)}
                    disabled={Boolean(inviteActionId)}
                  >
                    Отклонить
                  </button>
                </div>
              </article>
            ))}
          </div>
          {!profileLoading && !currentUserId && invites.length > 0 && (
            <p className="invite-note">Не удалось загрузить ID аккаунта. Обновите страницу или войдите снова.</p>
          )}
          {inviteStatus && <p className="invite-status" role="status">{inviteStatus}</p>}
          <div className="panel-heading management-heading">
            <div>
              <span className="section-number">02A</span>
              <h2>Состав чата</h2>
            </div>
            <span className="lock">OWNER TOOLS</span>
          </div>
          <form className="management-form" onSubmit={patchChatMetadata}>
            <label className="field-label" htmlFor="chat-meta-name">Новое имя</label>
            <input
              id="chat-meta-name"
              value={chatMetaName}
              onChange={(event) => setChatMetaName(event.target.value)}
              placeholder={selectedChat?.name || "Без изменения"}
            />
            <label className="field-label" htmlFor="chat-meta-owner">
              Новый owner_id
            </label>
            <input
              id="chat-meta-owner"
              type="number"
              min="1"
              value={chatMetaOwnerId}
              onChange={(event) => setChatMetaOwnerId(event.target.value)}
              placeholder={String(selectedChat?.owner?.id || "Без изменения")}
            />
            <button
              className="secondary-button"
              type="submit"
              disabled={!selectedChatId || (!chatMetaName.trim() && !chatMetaOwnerId)}
            >
              PATCH метаданных
            </button>
          </form>
          {selectedChat?.owner?.name === name && (
            <form className="management-form" onSubmit={sendInvite}>
              <label className="field-label" htmlFor="new-member-id">
                ID пользователя для приглашения
              </label>
              <div className="create-chat-row">
                <input
                  id="new-member-id"
                  type="number"
                  min="1"
                  value={newMemberId}
                  onChange={(event) => setNewMemberId(event.target.value)}
                  placeholder="ID пользователя"
                  required
                />
                <button
                  className="secondary-button"
                  type="submit"
                  disabled={!selectedChatId || !newMemberId || inviteSubmitting}
                >
                  {inviteSubmitting ? "Отправка..." : "Пригласить"}
                </button>
              </div>
              {inviteStatus && <p className="invite-status" role="status">{inviteStatus}</p>}
            </form>
          )}
          <div className="panel-heading message-heading">
            <div>
              <span className="section-number">03</span>
              <h2>Отправка</h2>
            </div>
          </div>
          <div className="active-chat-banner">
            <span className="active-chat-mark" aria-hidden="true">//</span>
            <span>Сейчас в чате <strong>{selectedChat?.name || "не выбран"}</strong></span>
          </div>
          <label className="field-label" htmlFor="message">Сообщение для выбранного чата</label>
          <textarea
            id="message"
            value={payload}
            onChange={(event) => setPayload(event.target.value)}
            rows="5"
          />
          <button className="send-button" onClick={sendMessage} disabled={!isConnected || !selectedChatId}>
            Отправить сообщение <span>→</span>
          </button>
          <p className="mode-note">
            Сообщение отправляется с client_msg_id и заменяется ответом сервера после сохранения.
          </p>
        </aside>
        <section className="panel log-panel">
          <div className="panel-heading log-heading">
            <div>
              <span className="section-number">04</span>
              <h2>{selectedChat?.name || "Журнал событий"}</h2>
            </div>
            <button
              className="clear-button"
              onClick={() => setEvents((current) => current.filter(
                (event) => event.chatId != null && event.chatId !== selectedChatId,
              ))}
              disabled={!visibleEvents.length || messagesLoading}
            >
              Очистить чат
            </button>
          </div>
          <div className="event-list">
            {messagesLoading && (
              <div className="empty-state">
                <div className="signal-art" aria-hidden="true"><span>SYNCING</span></div>
                <strong>Загрузка канала</strong>
                <span>Получаем сохранённые сообщения.</span>
              </div>
            )}
            {!messagesLoading && !visibleEvents.length && (
              <div className="empty-state">
                <div className="signal-art" aria-hidden="true"><span>NO SIGNAL</span></div>
                <strong>Канал чист</strong>
                <span>Выберите чат и отправьте первый кадр.</span>
              </div>
            )}
            {!messagesLoading && visibleEvents.map((event) => (
              <article className={`event ${event.type}`} key={event.id}>
                <div className="event-meta">
                  <span>{event.type === "in" ? "IN" : event.type === "out" ? "OUT" : event.type.toUpperCase()}</span>
                  <time>{event.time}</time>
                </div>
                <pre>{event.value}</pre>
              </article>
            ))}
          </div>
        </section>
      </section>
      <footer><span>SECRETCHAT</span><span>FASTAPI / REACT / WEBSOCKET</span></footer>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<StrictMode><App /></StrictMode>);
