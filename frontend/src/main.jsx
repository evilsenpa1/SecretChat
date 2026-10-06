import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createChatKey,
  decryptChatKey,
  decryptMessage,
  deleteChatKeyPair,
  deleteChatKeyPairs,
  encryptMessage,
  exportPublicKey,
  getChatKeyPair,
  importPublicKey,
  moveChatKeyPair,
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

let refreshRequest;

async function refreshSession() {
  if (!refreshRequest) {
    refreshRequest = fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "X-CSRF-TOKEN": getCookie("csrf_refresh_token") },
    })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        refreshRequest = null;
      });
  }
  return refreshRequest;
}

async function apiFetch(url, options = {}) {
  const requestOptions = { ...options, credentials: "include" };
  const response = await fetch(url, requestOptions);
  if (response.status !== 401 || !(await refreshSession())) return response;

  const headers = new Headers(requestOptions.headers);
  if (headers.has("X-CSRF-TOKEN")) {
    headers.set("X-CSRF-TOKEN", getCookie("csrf_access_token"));
  }
  return fetch(url, { ...requestOptions, headers });
}

function getMessageBody(value) {
  try {
    const message = JSON.parse(value);
    return message?.type === "message" && typeof message.data?.body === "string"
      ? message.data.body
      : null;
  } catch {
    return null;
  }
}

function App() {
  const socketRef = useRef(null);
  const connectAttemptRef = useRef(false);
  const chatRsaKeysRef = useRef(new Map());
  const chatKeysRef = useRef(new Map());
  const chatKeyVersionsRef = useRef(new Map());
  const messagesRequestRef = useRef(0);
  const loadedChatsRef = useRef(new Set());
  const [payload, setPayload] = useState("");
  const [name, setName] = useState(() => localStorage.getItem("secret-chat-user") || "");
  const [password, setPassword] = useState("");
  const [authStatus, setAuthStatus] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(localStorage.getItem("secret-chat-user")));
  const [chats, setChats] = useState([]);
  const [selectedChatId, setSelectedChatId] = useState("");
  const [deletingChatId, setDeletingChatId] = useState("");
  const [chatsLoading, setChatsLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [newChatName, setNewChatName] = useState("");
  const [cryptoStatus, setCryptoStatus] = useState("Готовим уникальные ключи чата...");
  const [chatMetaName, setChatMetaName] = useState("");
  const [chatMetaOwnerId, setChatMetaOwnerId] = useState("");
  const [newMemberId, setNewMemberId] = useState("");
  const [deletingMemberId, setDeletingMemberId] = useState("");
  const [currentUserId, setCurrentUserId] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
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

  const clearInMemoryChatState = () => {
    socketRef.current?.close();
    socketRef.current = null;
    connectAttemptRef.current = false;
    chatRsaKeysRef.current.clear();
    chatKeysRef.current.clear();
    chatKeyVersionsRef.current.clear();
    loadedChatsRef.current.clear();
    messagesRequestRef.current += 1;
    setCurrentUserId(null);
    setChats([]);
    setSelectedChatId("");
    setEvents([]);
    setMessagesLoading(false);
    setStatus("offline");
  };

  const refreshChatKeys = async (chatId, expectedVersion) => {
    const normalizedChatId = String(chatId);
    const currentKeys = chatKeysRef.current.get(normalizedChatId) || new Map();
    const rsaPair = chatRsaKeysRef.current.get(normalizedChatId);
    if (!rsaPair) throw new Error("Приватный RSA-ключ этого чата не загружен");

    const response = await apiFetch(`${API_URL}/chat/${chatId}/keys`);
    if (!response.ok) {
      throw new Error(`Не удалось загрузить ключи чата (${response.status})`);
    }
    const keys = await response.json();
    const updatedKeys = new Map(currentKeys);
    let expectedKeyFailed = false;
    await Promise.all(keys.map(async (key) => {
      const version = Number(key.version);
      if (updatedKeys.has(version)) return;
      try {
        updatedKeys.set(version, await decryptChatKey(rsaPair.privateKey, key.encrypted_key));
      } catch {
        if (version === Number(expectedVersion)) expectedKeyFailed = true;
      }
    }));

    const versionToUse = expectedVersion == null
      ? Math.max(...updatedKeys.keys())
      : Number(expectedVersion);
    if (!Number.isFinite(versionToUse) || !updatedKeys.has(versionToUse)) {
      const reason = expectedKeyFailed
        ? "Приватный RSA-ключ не соответствует ключу этой версии"
        : `Для этой учётной записи нет AES-ключа версии ${expectedVersion ?? "чата"}`;
      throw new Error(`${reason}. Проверьте восстановление RSA-ключа и ротацию ключей.`);
    }

    chatKeyVersionsRef.current.set(normalizedChatId, versionToUse);
    chatKeysRef.current.set(normalizedChatId, updatedKeys);
    return updatedKeys;
  };

  const getChatKey = (chatId, version) => {
    const normalizedChatId = String(chatId);
    const keys = chatKeysRef.current.get(normalizedChatId);
    if (!keys?.size) return undefined;
    if (version != null) return keys.get(Number(version));

    const currentVersion = chatKeyVersionsRef.current.get(normalizedChatId);
    return currentVersion == null ? undefined : keys.get(currentVersion);
  };

  const parseServerMessage = async (rawData) => {
    try {
      const message = JSON.parse(rawData);
      if (message?.type !== "message" || !message.data?.client_msg_id) {
        addEvent("in", JSON.stringify(message, null, 2));
        return;
      }

      let displayMessage = message;
      const keyVersion = Number.isInteger(message.data.key_version)
        ? message.data.key_version
        : null;
      let aesKey = getChatKey(message.data.chat_id, keyVersion);
      if (!aesKey && message.data?.nonce) {
        try {
          await refreshChatKeys(message.data.chat_id, keyVersion);
          aesKey = getChatKey(message.data.chat_id, keyVersion);
        } catch (error) {
          addEvent("error", error.message, { chatId: String(message.data.chat_id) });
        }
      }
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
          // Keep the encrypted payload visible when no matching key is available.
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
      const response = await apiFetch(`${API_URL}/chat/${chatId}/messages`, {
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

      const chatKeys = chatKeysRef.current.get(normalizedChatId) || new Map();
      await Promise.all(historyEvents.map(async (event) => {
        try {
          const message = JSON.parse(event.value);
          if (!message.data?.nonce) return;
          const keyVersion = Number.isInteger(message.data.key_version)
            ? message.data.key_version
            : null;
          const aesKey = keyVersion == null
            ? getChatKey(chatId)
            : chatKeys.get(keyVersion);
          if (!aesKey) return;
          message.data.body = await decryptMessage(aesKey, message.data.body, message.data.nonce);
          event.value = JSON.stringify(message, null, 2);
        } catch {
          // Keep legacy plaintext messages and messages without an available key visible.
        }
      }));

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
      const response = await apiFetch(`${API_URL}/user/me`);
      if (response.status === 401) {
        clearInMemoryChatState();
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
      const response = await apiFetch(`${API_URL}/chat`);
      if (!response.ok) {
        if (response.status === 401) {
          clearInMemoryChatState();
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
      const keyWarnings = [];
      await Promise.all(chatList.map(async (chat) => {
        try {
          const ownMember = chat.members?.find((member) => member.id === currentUserId)
            || chat.members?.find((member) => member.name === name);
          if (!ownMember?.public_key) {
            throw new Error("В списке участников нет вашего публичного ключа");
          }
          const rsaPair = await getChatKeyPair(chat.id, name, ownMember?.public_key);
          chatRsaKeysRef.current.set(String(chat.id), rsaPair);
          await refreshChatKeys(chat.id, chat.current_key_version);
        } catch (error) {
          keyWarnings.push(`«${chat.name}»: ${error.message}`);
        }
      }));
      if (keyWarnings.length) setChatStatus(keyWarnings.join("\n"));
      setSelectedChatId((current) => current || String(chatList[0]?.id || ""));
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
      const response = await apiFetch(`${API_URL}/chat/invites/me`);
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
      const response = await apiFetch(`${API_URL}/chat/${selectedChat.id}/invites/`, {
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

  const deleteMember = async (member) => {
    if (!selectedChat || selectedChat.owner?.id !== currentUserId) {
      setChatStatus("Удалять участников может только владелец чата");
      return;
    }
    if (member.id === selectedChat.owner.id) return;
    if (!window.confirm(`Удалить ${member.name} из чата «${selectedChat.name}»?`)) return;

    setDeletingMemberId(String(member.id));
    setChatStatus(`Обновляем ключ чата «${selectedChat.name}»...`);
    try {
      const remainingMembers = selectedChat.members.filter((item) => item.id !== member.id);
      const ownerMember = remainingMembers.find((item) => item.id === currentUserId);
      if (!ownerMember) throw new Error("В чате должен остаться его владелец");

      const ownerPublicKey = await importPublicKey(ownerMember.public_key);
      const { aesKey, encryptedKey } = await createChatKey(ownerPublicKey);
      const wrappedKeys = await Promise.all(remainingMembers.map(async (item) => ({
        user_id: item.id,
        encrypted_key: item.id === currentUserId
          ? encryptedKey
          : await wrapChatKey(aesKey, await importPublicKey(item.public_key)),
      })));
      const response = await apiFetch(
        `${API_URL}/chat/${selectedChat.id}/members?member_id=${member.id}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-TOKEN": getCookie("csrf_access_token"),
          },
          credentials: "include",
          body: JSON.stringify({
            member_ids: [member.id],
            new_version: selectedChat.current_key_version + 1,
            wrapped_keys: wrappedKeys,
          }),
        },
      );
      if (!response.ok) {
        throw new Error(response.status === 403
          ? "Удалять участников может только владелец чата"
          : "Не удалось удалить участника");
      }

      const updatedChat = await response.json();
      const normalizedChatId = String(updatedChat.id);
      const updatedKeys = new Map(chatKeysRef.current.get(normalizedChatId) || []);
      updatedKeys.set(updatedChat.current_key_version, aesKey);
      chatKeysRef.current.set(normalizedChatId, updatedKeys);
      chatKeyVersionsRef.current.set(normalizedChatId, updatedChat.current_key_version);
      setChats((current) => current.map((item) => item.id === updatedChat.id ? updatedChat : item));
      setChatStatus(`${member.name} удалён из чата; ключ обновлён`);
      addEvent("system", `${member.name} удалён из чата #${updatedChat.id}`, {
        chatId: normalizedChatId,
      });
    } catch (error) {
      setChatStatus(error.message);
    } finally {
      setDeletingMemberId("");
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
      const chatResponse = await apiFetch(`${API_URL}/chat/${invite.chat_id}`, {
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

      const response = await apiFetch(`${API_URL}/chat/invites/${invite.id}/accept`, {
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
      chatKeysRef.current.set(
        String(updatedChat.id),
        new Map([[updatedChat.current_key_version, aesKey]]),
      );
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
      const response = await apiFetch(`${API_URL}/chat/invites/${invite.id}/decline/`, {
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

    setChatStatus("Создаём...");
    try {
      const chatRsaPair = await getChatKeyPair(temporaryChatId, name);
      const publicKey = await exportPublicKey(chatRsaPair.publicKey);
      const { aesKey, encryptedKey } = await createChatKey(chatRsaPair.publicKey);
      const response = await apiFetch(`${API_URL}/chat`, {
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
      await moveChatKeyPair(temporaryChatId, chat.id, name);
      chatRsaKeysRef.current.set(String(chat.id), chatRsaPair);
      chatKeysRef.current.set(String(chat.id), new Map([[chat.current_key_version, aesKey]]));
      setChats((current) => [...current, chat]);
      setSelectedChatId(String(chat.id));
      setNewChatName("");
      setChatStatus(`Чат «${chat.name}» создан`);
      addEvent("system", `Создан чат #${chat.id}: ${chat.name}`);
    } catch (error) {
      try {
        await deleteChatKeyPair(temporaryChatId, name);
      } catch {
        // Keep the original key if IndexedDB cleanup is unavailable.
      }
      setChatStatus(error.message);
      addEvent("error", error.message);
    }
  };

  const deleteChat = async (chat) => {
    if (chat.owner?.id !== currentUserId) {
      setChatStatus("Удалить чат может только его владелец");
      return;
    }
    if (!window.confirm(`Удалить чат «${chat.name}»? Это действие нельзя отменить.`)) return;

    const chatId = String(chat.id);
    setDeletingChatId(chatId);
    setChatStatus(`Удаляем чат «${chat.name}»...`);
    try {
      const response = await apiFetch(`${API_URL}/chat/${chat.id}`, {
        method: "DELETE",
        headers: { "X-CSRF-TOKEN": getCookie("csrf_access_token") },
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(response.status === 403
          ? "Удалить чат может только его владелец"
          : "Не удалось удалить чат");
      }

      const remainingChats = chats.filter((item) => String(item.id) !== chatId);
      setChats(remainingChats);
      setEvents((current) => current.filter((event) => event.chatId !== chatId));
      loadedChatsRef.current.delete(chatId);
      chatRsaKeysRef.current.delete(chatId);
      chatKeysRef.current.delete(chatId);
      chatKeyVersionsRef.current.delete(chatId);
      await deleteChatKeyPair(chat.id, name);

      if (selectedChatId === chatId) {
        messagesRequestRef.current += 1;
        setMessagesLoading(false);
        setSelectedChatId(String(remainingChats[0]?.id || ""));
      }
      setChatStatus(`Чат «${chat.name}» удалён`);
      addEvent("system", `Удалён чат #${chat.id}: ${chat.name}`);
    } catch (error) {
      setChatStatus(error.message);
    } finally {
      setDeletingChatId("");
    }
  };

  const patchChatMetadata = async (event) => {
    event.preventDefault();
    if (!selectedChatId) return;

    setChatStatus("Обновляем метаданные...");
    try {
      const response = await apiFetch(`${API_URL}/chat`, {
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
    clearInMemoryChatState();
    setAuthStatus("Входим...");
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
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

  const deleteAccount = async () => {
    if (!currentUserId || deletingAccount) return;
    const confirmed = window.confirm(
      "Удалить аккаунт без возможности восстановления? Локальные RSA-ключи этого аккаунта тоже будут удалены.",
    );
    if (!confirmed) return;

    setDeletingAccount(true);
    setAuthStatus("Удаляем аккаунт...");
    try {
      const response = await apiFetch(`${API_URL}/user/${currentUserId}`, {
        method: "DELETE",
        headers: { "X-CSRF-TOKEN": getCookie("csrf_access_token") },
      });
      if (!response.ok) throw new Error(`Не удалось удалить аккаунт (${response.status})`);

      let keyCleanupFailed = false;
      try {
        await deleteChatKeyPairs(name);
      } catch {
        keyCleanupFailed = true;
      }
      clearInMemoryChatState();
      localStorage.removeItem("secret-chat-user");
      setName("");
      setPassword("");
      setInvites([]);
      setIsAuthenticated(false);
      setAuthStatus(keyCleanupFailed
        ? "Аккаунт удалён, но локальные ключи удалить не удалось"
        : "Аккаунт удалён");
    } catch (error) {
      setAuthStatus(error.message);
    } finally {
      setDeletingAccount(false);
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
      if (socketRef.current !== socket) return;
      setStatus("online");
      addEvent("system", "Соединение установлено");
    };
    socket.onmessage = ({ data }) => {
      if (socketRef.current === socket) parseServerMessage(data);
    };
    socket.onerror = () => {
      if (socketRef.current === socket) addEvent("error", "Ошибка WebSocket");
    };
    socket.onclose = ({ code, reason }) => {
      if (socketRef.current !== socket) return;
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
    try {
      const expectedVersion = selectedChat?.current_key_version;
      if (expectedVersion == null) throw new Error("Не удалось определить версию AES-ключа чата");
      await refreshChatKeys(selectedChatId, expectedVersion);
      const aesKey = getChatKey(selectedChatId, expectedVersion);
      if (!aesKey) throw new Error(`AES-ключ версии ${expectedVersion} недоступен`);

      const clientMsgId = crypto.randomUUID();
      const { body, nonce } = await encryptMessage(aesKey, payload);
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        return;
      }
      const message = {
        type: "message",
        data: { chat_id: Number(selectedChatId), client_msg_id: clientMsgId, body, nonce },
      };
      socketRef.current.send(JSON.stringify(message));
      setPayload("");
      addEvent("out", JSON.stringify({ ...message, data: { ...message.data, body: payload } }, null, 2), {
        clientMsgId,
        pending: true,
        chatId: selectedChatId,
      });
    } catch (error) {
      addEvent("error", error.message, { chatId: selectedChatId });
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
          <button
            className="text-button danger-button delete-account-button"
            type="button"
            onClick={deleteAccount}
            disabled={deletingAccount || profileLoading || !currentUserId}
          >
            {deletingAccount ? "Удаляем..." : "Удалить аккаунт"}
          </button>
          <div className={`status-pill ${status}`}>
            <i /> {status === "online" ? "online" : status === "connecting" ? "connecting" : "offline"}
          </div>
        </div>
      </section>
      <section className="workspace">
        <aside className="panel chat-sidebar">
          <div className="panel-heading sidebar-heading">
            <div>
              <span className="section-number">01</span>
              <h2>Ваши чаты</h2>
            </div>
            <span className="lock">{chats.length}</span>
          </div>
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
                <div className="chat-list-entry" key={chat.id}>
                  <button
                    className={`chat-item ${chatId === selectedChatId ? "active" : ""}`}
                    type="button"
                    onClick={() => setSelectedChatId(chatId)}
                  >
                    <span className="chat-item-icon">//</span>
                    <span className="chat-item-copy">
                      <strong>{chat.name}</strong>
                      <small>#{chat.id} · {chat.members?.length || 0} участников</small>
                    </span>
                    <span className="chat-item-count">{messageCount}</span>
                  </button>
                  {chat.owner?.id === currentUserId && (
                    <button
                      className="chat-delete-button"
                      type="button"
                      onClick={() => deleteChat(chat)}
                      disabled={Boolean(deletingChatId)}
                      aria-label={`Удалить чат ${chat.name}`}
                      title="Удалить чат"
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <form className="create-chat-form" onSubmit={createChat}>
            <label className="field-label" htmlFor="new-chat-name">Создать чат</label>
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
          </form>
          <div className="inbox-heading">
            <h3>Приглашения</h3>
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
        </aside>

        <div className="chat-column">
          <section className="panel log-panel" aria-label="Сообщения чата">
            <div className="chat-toolbar">
              <div className="chat-title-group">
                <span className="active-chat-mark" aria-hidden="true">//</span>
                <div>
                  <h2>{selectedChat?.name || "Выберите чат"}</h2>
                  <p>{selectedChat ? `Чат #${selectedChat.id} · ${selectedChat.members?.length || 0} участников` : "История сообщений"}</p>
                </div>
              </div>
              <button
                className="clear-button"
                type="button"
                onClick={() => setEvents((current) => current.filter(
                  (event) => event.chatId != null && event.chatId !== selectedChatId,
                ))}
                disabled={!visibleEvents.length || messagesLoading}
              >
                Очистить
              </button>
            </div>
            <div className="event-list">
              {messagesLoading && (
                <div className="empty-state">
                  <div className="signal-art" aria-hidden="true"><span>SYNCING</span></div>
                  <strong>Загрузка сообщений</strong>
                </div>
              )}
              {!messagesLoading && !visibleEvents.length && (
                <div className="empty-state">
                  <div className="signal-art" aria-hidden="true"><span>NO SIGNAL</span></div>
                  <strong>Пока тихо</strong>
                  <span>Отправьте первое сообщение.</span>
                </div>
              )}
              {!messagesLoading && visibleEvents.map((event) => {
                const messageBody = getMessageBody(event.value);
                return (
                  <article
                    className={`event ${event.type}${messageBody !== null ? " message-event" : ""}`}
                    key={event.id}
                  >
                    <div className="event-meta">
                      <span>{event.type === "in" ? "ВХОДЯЩЕЕ" : event.type === "out" ? "ВЫ" : event.type.toUpperCase()}</span>
                      <time>{event.time}</time>
                    </div>
                    {messageBody !== null ? (
                      <>
                        <p className="message-body">{messageBody}</p>
                        <details className="event-payload">
                          <summary>Данные пакета</summary>
                          <pre>{event.value}</pre>
                        </details>
                      </>
                    ) : (
                      <pre>{event.value}</pre>
                    )}
                  </article>
                );
              })}
            </div>
          </section>

          <form
            className="panel composer-panel"
            onSubmit={(event) => {
              event.preventDefault();
              sendMessage();
            }}
          >
            <textarea
              id="message"
              aria-label="Сообщение"
              placeholder={selectedChatId ? "Напишите сообщение..." : "Сначала выберите чат"}
              value={payload}
              onChange={(event) => setPayload(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
                event.preventDefault();
                if (isConnected && selectedChatId && payload.trim()) sendMessage();
              }}
              rows="2"
              disabled={!selectedChatId}
            />
            <div className="composer-actions">
              <span className={`composer-connection ${isConnected ? "online" : ""}`}>
                {isConnected ? "Соединение установлено" : "Нет соединения"}
              </span>
              <button className="send-button" type="submit" disabled={!isConnected || !selectedChatId || !payload.trim()}>
                Отправить <span>↑</span>
              </button>
            </div>
          </form>
        </div>

        <aside className="panel details-panel">
          <div className="panel-heading sidebar-heading">
            <div>
              <span className="section-number">02</span>
              <h2>Участники</h2>
            </div>
            <span className="lock">{selectedChat?.members?.length || 0}</span>
          </div>
          <div className="member-list" aria-label="Участники выбранного чата">
            {!selectedChat?.members?.length && (
              <p className="invite-empty">Выберите чат, чтобы увидеть участников</p>
            )}
            {selectedChat?.members?.map((member) => (
              <div className="member-item" key={member.id}>
                <span className="member-avatar" aria-hidden="true">{member.name.slice(0, 1).toUpperCase()}</span>
                <div className="invite-copy">
                  <strong>{member.name}</strong>
                  <small>{member.id === selectedChat.owner?.id ? "ВЛАДЕЛЕЦ" : `ID ${member.id}`}</small>
                </div>
                {selectedChat.owner?.id === currentUserId && member.id !== currentUserId && (
                  <button
                    className="text-button danger-button member-remove"
                    type="button"
                    onClick={() => deleteMember(member)}
                    disabled={Boolean(deletingMemberId)}
                    aria-label={`Удалить ${member.name} из чата`}
                    title="Удалить участника"
                  >
                    {deletingMemberId === String(member.id) ? "..." : "×"}
                  </button>
                )}
              </div>
            ))}
          </div>

          {selectedChat?.owner?.id === currentUserId && (
            <div className="owner-tools">
              <details className="management-disclosure">
                <summary>Добавить участника</summary>
                <form className="management-form" onSubmit={sendInvite}>
                  <label className="field-label" htmlFor="new-member-id">ID пользователя</label>
                  <input
                    id="new-member-id"
                    type="number"
                    min="1"
                    value={newMemberId}
                    onChange={(event) => setNewMemberId(event.target.value)}
                    placeholder="Например, 12"
                    required
                  />
                  <button
                    className="secondary-button"
                    type="submit"
                    disabled={!newMemberId || inviteSubmitting}
                  >
                    {inviteSubmitting ? "Отправка..." : "Отправить приглашение"}
                  </button>
                </form>
              </details>
              <details className="management-disclosure">
                <summary>Настройки чата</summary>
                <form className="management-form" onSubmit={patchChatMetadata}>
                  <label className="field-label" htmlFor="chat-meta-name">Название</label>
                  <input
                    id="chat-meta-name"
                    value={chatMetaName}
                    onChange={(event) => setChatMetaName(event.target.value)}
                    placeholder={selectedChat.name}
                    disabled={!selectedChatId}
                  />
                  <label className="field-label" htmlFor="chat-meta-owner">Новый ID владельца</label>
                  <input
                    id="chat-meta-owner"
                    type="number"
                    min="1"
                    value={chatMetaOwnerId}
                    onChange={(event) => setChatMetaOwnerId(event.target.value)}
                    placeholder={String(selectedChat.owner?.id || "ID пользователя")}
                    disabled={!selectedChatId}
                  />
                  <button
                    className="secondary-button"
                    type="submit"
                    disabled={!selectedChatId || (!chatMetaName.trim() && !chatMetaOwnerId)}
                  >
                    Сохранить
                  </button>
                </form>
              </details>
            </div>
          )}
          {chatStatus && <p className="invite-status" role="status">{chatStatus}</p>}
        </aside>
      </section>
      <footer><span>SECRETCHAT</span><span>FASTAPI / REACT / WEBSOCKET</span></footer>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<StrictMode><App /></StrictMode>);
