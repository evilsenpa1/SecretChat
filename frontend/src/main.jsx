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

const translations = {
  en: {
    "WEBSOCKET LAB · LOCAL CLIENT": "WEBSOCKET LAB · LOCAL CLIENT",
    "COOKIE AUTH": "COOKIE AUTH",
    "online": "online",
    "connecting": "connecting",
    "offline": "offline",
    "SYNCING": "SYNCING",
    "NO SIGNAL": "NO SIGNAL",
    "Готовим уникальные ключи чата...": "Preparing unique chat keys...",
    "Web Crypto недоступен: нужен HTTPS или localhost": "Web Crypto is unavailable. HTTPS or localhost is required.",
    "RSA-OAEP 2048 + AES-256-GCM готовы для каждого чата": "RSA-OAEP 2048 + AES-256-GCM are ready for each chat",
    "Приватный RSA-ключ этого чата не загружен": "This chat's private RSA key is not loaded",
    "Не удалось загрузить ключи чата ({status})": "Could not load chat keys ({status})",
    "Приватный RSA-ключ не соответствует ключу этой версии": "The private RSA key does not match this key version",
    "Для этой учётной записи нет AES-ключа версии {version}": "No AES key for version {version} is available for this account",
    "чата": "chat",
    "{reason}. Проверьте восстановление RSA-ключа и ротацию ключей.": "{reason}. Check RSA key recovery and key rotation.",
    "Не удалось загрузить сообщения": "Could not load messages",
    "Сессия истекла, войдите снова": "Your session expired. Please sign in again.",
    "Не удалось загрузить профиль пользователя: сессия истекла": "Could not load your profile: session expired",
    "Не удалось загрузить профиль пользователя ({status})": "Could not load your profile ({status})",
    "Не удалось загрузить профиль пользователя": "Could not load your profile",
    "Не удалось загрузить чаты": "Could not load chats",
    "В списке участников нет вашего публичного ключа": "Your public key is missing from the member list",
    "Не удалось загрузить приглашения": "Could not load invitations",
    "Приглашать участников может только владелец чата": "Only the chat owner can invite members",
    "Укажите корректный ID пользователя": "Enter a valid user ID",
    "Этот пользователь уже состоит в чате": "This user is already a member of the chat",
    "Отправляем приглашение...": "Sending invitation...",
    "Не удалось отправить приглашение": "Could not send invitation",
    "Приглашение пользователю #{userId} отправлено": "Invitation sent to user #{userId}",
    "Удалять участников может только владелец чата": "Only the chat owner can remove members",
    "Удалить {member} из чата «{chat}»?": "Remove {member} from chat “{chat}”?",
    "Обновляем ключ чата «{chat}»...": "Updating the key for chat “{chat}”...",
    "В чате должен остаться его владелец": "The chat owner must remain in the chat",
    "Не удалось удалить участника": "Could not remove member",
    "{member} удалён из чата; ключ обновлён": "{member} was removed from the chat; the key was updated",
    "{member} удалён из чата #{chatId}": "{member} was removed from chat #{chatId}",
    "Профиль ещё не загружен. Обновите страницу или войдите снова.": "Your profile has not loaded yet. Refresh the page or sign in again.",
    "Подготавливаем ключи чата...": "Preparing chat keys...",
    "Не удалось загрузить данные чата": "Could not load chat details",
    "Вы уже состоите в этом чате": "You are already a member of this chat",
    "Участник {member} (#{memberId}) имеет некорректный RSA-ключ. ": "Member {member} (#{memberId}) has an invalid RSA key. ",
    "Чат создан с тестовой заглушкой ключа; его нужно пересоздать с фронтенда.": "The chat was created with a placeholder key. Recreate it from the frontend.",
    "Не удалось принять приглашение": "Could not accept invitation",
    "Вы присоединились к чату «{chat}»": "You joined chat “{chat}”",
    "Отклоняем приглашение...": "Declining invitation...",
    "Не удалось отклонить приглашение": "Could not decline invitation",
    "Приглашение отклонено": "Invitation declined",
    "Создаём...": "Creating...",
    "Сессия истекла": "Session expired",
    "Не удалось создать чат": "Could not create chat",
    "Чат «{chat}» создан": "Chat “{chat}” created",
    "Создан чат #{chatId}: {chat}": "Created chat #{chatId}: {chat}",
    "Удалить чат может только его владелец": "Only the chat owner can delete it",
    "Удалить чат «{chat}»? Это действие нельзя отменить.": "Delete chat “{chat}”? This action cannot be undone.",
    "Удаляем чат «{chat}»...": "Deleting chat “{chat}”...",
    "Не удалось удалить чат": "Could not delete chat",
    "Чат «{chat}» удалён": "Chat “{chat}” deleted",
    "Удалён чат #{chatId}: {chat}": "Deleted chat #{chatId}: {chat}",
    "Обновляем метаданные...": "Updating chat details...",
    "Не удалось обновить метаданные": "Could not update chat details",
    "Метаданные обновлены": "Chat details updated",
    "Входим...": "Signing in...",
    "Неверное имя или пароль": "Incorrect username or password",
    "Вход выполнен": "Signed in successfully",
    "Токены получены в cookie": "Authentication cookies received",
    "Создаём аккаунт...": "Creating account...",
    "Пользователь с таким именем уже существует": "A user with this name already exists",
    "Проверьте имя и пароль": "Check the username and password",
    "Не удалось создать аккаунт ({status})": "Could not create account ({status})",
    "Аккаунт создан. Теперь войдите.": "Account created. You can now sign in.",
    "Удалить аккаунт без возможности восстановления? Локальные RSA-ключи этого аккаунта тоже будут удалены.": "Delete your account permanently? This account's local RSA keys will also be deleted.",
    "Удаляем аккаунт...": "Deleting account...",
    "Не удалось удалить аккаунт ({status})": "Could not delete account ({status})",
    "Аккаунт удалён, но локальные ключи удалить не удалось": "Account deleted, but local keys could not be removed",
    "Аккаунт удалён": "Account deleted",
    "Подключение к {url}": "Connecting to {url}",
    "Соединение установлено": "Connection established",
    "Ошибка WebSocket": "WebSocket error",
    "Соединение закрыто · {code}{reason}": "Connection closed · {code}{reason}",
    "Не удалось определить версию AES-ключа чата": "Could not determine the chat AES key version",
    "AES-ключ версии {version} недоступен": "AES key version {version} is unavailable",
    "Создайте аккаунт для защищённого общения.": "Create an account for secure conversations.",
    "Войдите, чтобы загрузить ваши чаты.": "Sign in to load your chats.",
    "Регистрация": "Sign up",
    "Вход": "Sign in",
    "Имя пользователя": "Username",
    "Пароль": "Password",
    "Подождите...": "Please wait...",
    "Создать аккаунт": "Create account",
    "Уже есть аккаунт? Войти": "Already have an account? Sign in",
    "Нет аккаунта? Зарегистрироваться": "No account? Sign up",
    "Небольшая лаборатория для проверки входящих и исходящих кадров.": "A small lab for inspecting incoming and outgoing frames.",
    "Аккаунт:": "Account:",
    "guest": "guest",
    "Удаляем...": "Deleting...",
    "Удалить аккаунт": "Delete account",
    "Ваши чаты": "Your chats",
    "Загрузка чатов...": "Loading chats...",
    "Чаты не найдены": "No chats found",
    "{count} members": "{count} members",
    "Удалить чат {chat}": "Delete chat {chat}",
    "Создать чат": "Create chat",
    "Название чата": "Chat name",
    "Создать": "Create",
    "Приглашения": "Invitations",
    "Обновить приглашения": "Refresh invitations",
    "Обновить": "Refresh",
    "Загружаем приглашения...": "Loading invitations...",
    "Новых приглашений нет": "No new invitations",
    "Чат #{chatId} · приглашение #{inviteId}": "Chat #{chatId} · invitation #{inviteId}",
    "Загружаем профиль": "Loading profile",
    "Не удалось получить ID аккаунта": "Could not get account ID",
    "Принять приглашение": "Accept invitation",
    "Принять": "Accept",
    "Отклонить": "Decline",
    "Не удалось загрузить ID аккаунта. Обновите страницу или войдите снова.": "Could not load account ID. Refresh the page or sign in again.",
    "Сообщения чата": "Chat messages",
    "Выберите чат": "Select a chat",
    "Чат #{chatId} · {count} участников": "Chat #{chatId} · {count} members",
    "История сообщений": "Message history",
    "Очистить": "Clear",
    "Загрузка сообщений": "Loading messages",
    "Пока тихо": "Nothing here yet",
    "Отправьте первое сообщение.": "Send the first message.",
    "ВХОДЯЩЕЕ": "INCOMING",
    "ВЫ": "YOU",
    "Данные пакета": "Packet data",
    "Сообщение": "Message",
    "Напишите сообщение...": "Write a message...",
    "Сначала выберите чат": "Select a chat first",
    "Нет соединения": "Disconnected",
    "Отправить": "Send",
    "Участники": "Members",
    "Участники выбранного чата": "Selected chat members",
    "Выберите чат, чтобы увидеть участников": "Select a chat to see its members",
    "ВЛАДЕЛЕЦ": "OWNER",
    "Тестовая комната": "Test room",
    "Удалить {member} из чата": "Remove {member} from chat",
    "Удалить участника": "Remove member",
    "Добавить участника": "Add a member",
    "ID пользователя": "User ID",
    "Например, 12": "For example, 12",
    "Отправка...": "Sending...",
    "Отправить приглашение": "Send invitation",
    "Настройки чата": "Chat settings",
    "Название": "Name",
    "Новый ID владельца": "New owner ID",
    "Сохранить": "Save",
    "Выберите язык": "Choose language",
  },
  uk: {
    "WEBSOCKET LAB · LOCAL CLIENT": "ЛАБОРАТОРІЯ WEBSOCKET · ЛОКАЛЬНИЙ КЛІЄНТ",
    "COOKIE AUTH": "COOKIE-АВТЕНТИФІКАЦІЯ",
    "online": "у мережі",
    "connecting": "з’єднання",
    "offline": "не в мережі",
    "SYNCING": "СИНХРОНІЗАЦІЯ",
    "NO SIGNAL": "НЕМАЄ СИГНАЛУ",
    "Готовим уникальные ключи чата...": "Готуємо унікальні ключі чату...",
    "Web Crypto недоступен: нужен HTTPS или localhost": "Web Crypto недоступний: потрібен HTTPS або localhost",
    "RSA-OAEP 2048 + AES-256-GCM готовы для каждого чата": "RSA-OAEP 2048 + AES-256-GCM готові для кожного чату",
    "Приватный RSA-ключ этого чата не загружен": "Приватний RSA-ключ цього чату не завантажено",
    "Не удалось загрузить ключи чата ({status})": "Не вдалося завантажити ключі чату ({status})",
    "Приватный RSA-ключ не соответствует ключу этой версии": "Приватний RSA-ключ не відповідає ключу цієї версії",
    "Для этой учётной записи нет AES-ключа версии {version}": "Для цього облікового запису немає AES-ключа версії {version}",
    "чата": "чату",
    "{reason}. Проверьте восстановление RSA-ключа и ротацию ключей.": "{reason}. Перевірте відновлення RSA-ключа та ротацію ключів.",
    "Не удалось загрузить сообщения": "Не вдалося завантажити повідомлення",
    "Сессия истекла, войдите снова": "Сеанс завершився. Увійдіть знову.",
    "Не удалось загрузить профиль пользователя: сессия истекла": "Не вдалося завантажити профіль: сеанс завершився",
    "Не удалось загрузить профиль пользователя ({status})": "Не вдалося завантажити профіль користувача ({status})",
    "Не удалось загрузить профиль пользователя": "Не вдалося завантажити профіль користувача",
    "Не удалось загрузить чаты": "Не вдалося завантажити чати",
    "В списке участников нет вашего публичного ключа": "У списку учасників немає вашого відкритого ключа",
    "Не удалось загрузить приглашения": "Не вдалося завантажити запрошення",
    "Приглашать участников может только владелец чата": "Запрошувати учасників може лише власник чату",
    "Укажите корректный ID пользователя": "Вкажіть коректний ID користувача",
    "Этот пользователь уже состоит в чате": "Цей користувач уже є учасником чату",
    "Отправляем приглашение...": "Надсилаємо запрошення...",
    "Не удалось отправить приглашение": "Не вдалося надіслати запрошення",
    "Приглашение пользователю #{userId} отправлено": "Запрошення користувачу #{userId} надіслано",
    "Удалять участников может только владелец чата": "Видаляти учасників може лише власник чату",
    "Удалить {member} из чата «{chat}»?": "Видалити {member} із чату «{chat}»?",
    "Обновляем ключ чата «{chat}»...": "Оновлюємо ключ чату «{chat}»...",
    "В чате должен остаться его владелец": "Власник має залишитися в чаті",
    "Не удалось удалить участника": "Не вдалося видалити учасника",
    "{member} удалён из чата; ключ обновлён": "{member} видалено з чату; ключ оновлено",
    "{member} удалён из чата #{chatId}": "{member} видалено з чату #{chatId}",
    "Профиль ещё не загружен. Обновите страницу или войдите снова.": "Профіль ще не завантажено. Оновіть сторінку або увійдіть знову.",
    "Подготавливаем ключи чата...": "Готуємо ключі чату...",
    "Не удалось загрузить данные чата": "Не вдалося завантажити дані чату",
    "Вы уже состоите в этом чате": "Ви вже є учасником цього чату",
    "Участник {member} (#{memberId}) имеет некорректный RSA-ключ. ": "Учасник {member} (#{memberId}) має некоректний RSA-ключ. ",
    "Чат создан с тестовой заглушкой ключа; его нужно пересоздать с фронтенда.": "Чат створено з тестовим ключем-заглушкою; його потрібно створити заново через фронтенд.",
    "Не удалось принять приглашение": "Не вдалося прийняти запрошення",
    "Вы присоединились к чату «{chat}»": "Ви приєдналися до чату «{chat}»",
    "Отклоняем приглашение...": "Відхиляємо запрошення...",
    "Не удалось отклонить приглашение": "Не вдалося відхилити запрошення",
    "Приглашение отклонено": "Запрошення відхилено",
    "Создаём...": "Створюємо...",
    "Сессия истекла": "Сеанс завершився",
    "Не удалось создать чат": "Не вдалося створити чат",
    "Чат «{chat}» создан": "Чат «{chat}» створено",
    "Создан чат #{chatId}: {chat}": "Створено чат #{chatId}: {chat}",
    "Удалить чат может только его владелец": "Видалити чат може лише його власник",
    "Удалить чат «{chat}»? Это действие нельзя отменить.": "Видалити чат «{chat}»? Цю дію неможливо скасувати.",
    "Удаляем чат «{chat}»...": "Видаляємо чат «{chat}»...",
    "Не удалось удалить чат": "Не вдалося видалити чат",
    "Чат «{chat}» удалён": "Чат «{chat}» видалено",
    "Удалён чат #{chatId}: {chat}": "Видалено чат #{chatId}: {chat}",
    "Обновляем метаданные...": "Оновлюємо дані чату...",
    "Не удалось обновить метаданные": "Не вдалося оновити дані чату",
    "Метаданные обновлены": "Дані чату оновлено",
    "Входим...": "Входимо...",
    "Неверное имя или пароль": "Неправильне ім’я або пароль",
    "Вход выполнен": "Вхід виконано",
    "Токены получены в cookie": "Токени отримано в cookie",
    "Создаём аккаунт...": "Створюємо обліковий запис...",
    "Пользователь с таким именем уже существует": "Користувач із таким ім’ям уже існує",
    "Проверьте имя и пароль": "Перевірте ім’я та пароль",
    "Не удалось создать аккаунт ({status})": "Не вдалося створити обліковий запис ({status})",
    "Аккаунт создан. Теперь войдите.": "Обліковий запис створено. Тепер увійдіть.",
    "Удалить аккаунт без возможности восстановления? Локальные RSA-ключи этого аккаунта тоже будут удалены.": "Видалити обліковий запис назавжди? Локальні RSA-ключі цього облікового запису також буде видалено.",
    "Удаляем аккаунт...": "Видаляємо обліковий запис...",
    "Не удалось удалить аккаунт ({status})": "Не вдалося видалити обліковий запис ({status})",
    "Аккаунт удалён, но локальные ключи удалить не удалось": "Обліковий запис видалено, але не вдалося видалити локальні ключі",
    "Аккаунт удалён": "Обліковий запис видалено",
    "Подключение к {url}": "Підключення до {url}",
    "Соединение установлено": "З’єднання встановлено",
    "Ошибка WebSocket": "Помилка WebSocket",
    "Соединение закрыто · {code}{reason}": "З’єднання закрито · {code}{reason}",
    "Не удалось определить версию AES-ключа чата": "Не вдалося визначити версію AES-ключа чату",
    "AES-ключ версии {version} недоступен": "AES-ключ версії {version} недоступний",
    "Создайте аккаунт для защищённого общения.": "Створіть обліковий запис для захищеного спілкування.",
    "Войдите, чтобы загрузить ваши чаты.": "Увійдіть, щоб завантажити ваші чати.",
    "Регистрация": "Реєстрація",
    "Вход": "Вхід",
    "Имя пользователя": "Ім’я користувача",
    "Пароль": "Пароль",
    "Подождите...": "Зачекайте...",
    "Создать аккаунт": "Створити обліковий запис",
    "Уже есть аккаунт? Войти": "Вже маєте обліковий запис? Увійти",
    "Нет аккаунта? Зарегистрироваться": "Немає облікового запису? Зареєструватися",
    "Небольшая лаборатория для проверки входящих и исходящих кадров.": "Невелика лабораторія для перегляду вхідних і вихідних кадрів.",
    "Аккаунт:": "Обліковий запис:",
    "guest": "гість",
    "Удаляем...": "Видаляємо...",
    "Удалить аккаунт": "Видалити обліковий запис",
    "Ваши чаты": "Ваші чати",
    "Загрузка чатов...": "Завантаження чатів...",
    "Чаты не найдены": "Чатів не знайдено",
    "{count} members": "{count} учасн.",
    "Удалить чат {chat}": "Видалити чат {chat}",
    "Создать чат": "Створити чат",
    "Название чата": "Назва чату",
    "Создать": "Створити",
    "Приглашения": "Запрошення",
    "Обновить приглашения": "Оновити запрошення",
    "Обновить": "Оновити",
    "Загружаем приглашения...": "Завантажуємо запрошення...",
    "Новых приглашений нет": "Нових запрошень немає",
    "Чат #{chatId} · приглашение #{inviteId}": "Чат #{chatId} · запрошення #{inviteId}",
    "Загружаем профиль": "Завантажуємо профіль",
    "Не удалось получить ID аккаунта": "Не вдалося отримати ID облікового запису",
    "Принять приглашение": "Прийняти запрошення",
    "Принять": "Прийняти",
    "Отклонить": "Відхилити",
    "Не удалось загрузить ID аккаунта. Обновите страницу или войдите снова.": "Не вдалося завантажити ID облікового запису. Оновіть сторінку або увійдіть знову.",
    "Сообщения чата": "Повідомлення чату",
    "Выберите чат": "Оберіть чат",
    "Чат #{chatId} · {count} участников": "Чат #{chatId} · {count} учасників",
    "История сообщений": "Історія повідомлень",
    "Очистить": "Очистити",
    "Загрузка сообщений": "Завантаження повідомлень",
    "Пока тихо": "Поки тихо",
    "Отправьте первое сообщение.": "Надішліть перше повідомлення.",
    "ВХОДЯЩЕЕ": "ВХІДНЕ",
    "ВЫ": "ВИ",
    "Данные пакета": "Дані пакета",
    "Сообщение": "Повідомлення",
    "Напишите сообщение...": "Напишіть повідомлення...",
    "Сначала выберите чат": "Спочатку оберіть чат",
    "Нет соединения": "Немає з’єднання",
    "Отправить": "Надіслати",
    "Участники": "Учасники",
    "Участники выбранного чата": "Учасники вибраного чату",
    "Выберите чат, чтобы увидеть участников": "Оберіть чат, щоб побачити учасників",
    "ВЛАДЕЛЕЦ": "ВЛАСНИК",
    "Тестовая комната": "Тестова кімната",
    "Удалить {member} из чата": "Видалити {member} з чату",
    "Удалить участника": "Видалити учасника",
    "Добавить участника": "Додати учасника",
    "ID пользователя": "ID користувача",
    "Например, 12": "Наприклад, 12",
    "Отправка...": "Надсилання...",
    "Отправить приглашение": "Надіслати запрошення",
    "Настройки чата": "Налаштування чату",
    "Название": "Назва",
    "Новый ID владельца": "Новий ID власника",
    "Сохранить": "Зберегти",
    "Выберите язык": "Оберіть мову",
  },
};

function translate(language, source, values = {}) {
  const translated = translations[language][source] || source;
  return translated.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""));
}

function LanguageSwitcher({ language, onChange }) {
  return (
    <div className="language-switch" role="group" aria-label={language === "en" ? "Choose language" : "Оберіть мову"}>
      {["en", "uk"].map((option) => (
        <button
          className={language === option ? "active" : ""}
          type="button"
          key={option}
          aria-pressed={language === option}
          title={option === "en" ? "English" : "Українська"}
          onClick={() => onChange(option)}
        >
          {option === "en" ? "EN" : "UA"}
        </button>
      ))}
    </div>
  );
}

function formatTime(language) {
  return new Intl.DateTimeFormat(language === "en" ? "en-GB" : "uk-UA", {
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
    refreshRequest = fetch(`${API_URL}/users/refresh-jwt`, {
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
  const [language, setLanguage] = useState(() => localStorage.getItem("secret-chat-language") === "en" ? "en" : "uk");
  const t = (source, values) => translate(language, source, values);
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
  const [isRegistering, setIsRegistering] = useState(false);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(localStorage.getItem("secret-chat-user")));
  const [chats, setChats] = useState([]);
  const [selectedChatId, setSelectedChatId] = useState("");
  const [deletingChatId, setDeletingChatId] = useState("");
  const [chatsLoading, setChatsLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [newChatName, setNewChatName] = useState("");
  const [cryptoStatus, setCryptoStatus] = useState(() => t("Готовим уникальные ключи чата..."));
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
  const changeLanguage = (nextLanguage) => {
    setLanguage(nextLanguage);
    setAuthStatus("");
    setChatStatus("");
    setInviteStatus("");
  };

  useEffect(() => {
    localStorage.setItem("secret-chat-language", language);
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    if (typeof crypto?.subtle === "undefined") {
      setCryptoStatus(t("Web Crypto недоступен: нужен HTTPS или localhost"));
      return;
    }
    setCryptoStatus(t("RSA-OAEP 2048 + AES-256-GCM готовы для каждого чата"));
  }, [language]);

  const addEvent = (type, value, extra = {}) => setEvents((current) => [
    ...current.slice(-49), { id: crypto.randomUUID(), type, value, time: formatTime(language), ...extra },
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
    if (!rsaPair) throw new Error(t("Приватный RSA-ключ этого чата не загружен"));

    const response = await apiFetch(`${API_URL}/chats/${chatId}/keys`);
    if (!response.ok) {
      throw new Error(t("Не удалось загрузить ключи чата ({status})", { status: response.status }));
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
        ? t("Приватный RSA-ключ не соответствует ключу этой версии")
        : t("Для этой учётной записи нет AES-ключа версии {version}", {
          version: expectedVersion ?? t("чата"),
        });
      throw new Error(t("{reason}. Проверьте восстановление RSA-ключа и ротацию ключей.", { reason }));
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
            time: formatTime(language),
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
      const response = await apiFetch(`${API_URL}/chats/${chatId}/messages`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(t("Не удалось загрузить сообщения"));
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
          ? new Intl.DateTimeFormat(language === "en" ? "en-GB" : "uk-UA", {
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
      const response = await apiFetch(`${API_URL}/users/me`);
      if (response.status === 401) {
        clearInMemoryChatState();
        localStorage.removeItem("secret-chat-user");
        setName("");
        setIsAuthenticated(false);
        setAuthStatus(t("Сессия истекла, войдите снова"));
        throw new Error(t("Не удалось загрузить профиль пользователя: сессия истекла"));
      }
      if (!response.ok) {
        throw new Error(t("Не удалось загрузить профиль пользователя ({status})", { status: response.status }));
      }
      const profile = await response.json();
      setCurrentUserId(profile.id);
      setInviteStatus((current) => current.startsWith(t("Не удалось загрузить профиль пользователя")) ? "" : current);
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
      const response = await apiFetch(`${API_URL}/chats`);
      if (!response.ok) {
        if (response.status === 401) {
          clearInMemoryChatState();
          localStorage.removeItem("secret-chat-user");
          setName("");
          setIsAuthenticated(false);
          setAuthStatus(t("Сессия истекла, войдите снова"));
          throw new Error(t("Сессия истекла, войдите снова"));
        }
        throw new Error(t("Не удалось загрузить чаты"));
      }
      const chatList = await response.json();
      setChats(chatList);
      const keyWarnings = [];
      await Promise.all(chatList.map(async (chat) => {
        try {
          const ownMember = chat.members?.find((member) => member.id === currentUserId)
            || chat.members?.find((member) => member.name === name);
          if (!ownMember?.public_key) {
            throw new Error(t("В списке участников нет вашего публичного ключа"));
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
      const response = await apiFetch(`${API_URL}/chats/invites/me`);
      if (!response.ok) throw new Error(t("Не удалось загрузить приглашения"));
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
      setInviteStatus(t("Приглашать участников может только владелец чата"));
      return;
    }

    const memberId = Number(newMemberId);
    if (!Number.isSafeInteger(memberId) || memberId <= 0) {
      setInviteStatus(t("Укажите корректный ID пользователя"));
      return;
    }
    if (selectedChat.members?.some((member) => member.id === memberId)) {
      setInviteStatus(t("Этот пользователь уже состоит в чате"));
      return;
    }

    setInviteSubmitting(true);
    setInviteStatus(t("Отправляем приглашение..."));
    try {
      const response = await apiFetch(`${API_URL}/chats/${selectedChat.id}/invites`, {
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
          ? t("Приглашать участников может только владелец чата")
          : t("Не удалось отправить приглашение"));
      }
      setNewMemberId("");
      setInviteStatus(t("Приглашение пользователю #{userId} отправлено", { userId: memberId }));
    } catch (error) {
      setInviteStatus(error.message);
    } finally {
      setInviteSubmitting(false);
    }
  };

  const deleteMember = async (member) => {
    if (!selectedChat || selectedChat.owner?.id !== currentUserId) {
      setChatStatus(t("Удалять участников может только владелец чата"));
      return;
    }
    if (member.id === selectedChat.owner.id) return;
    if (!window.confirm(t("Удалить {member} из чата «{chat}»?", { member: member.name, chat: selectedChat.name }))) return;

    setDeletingMemberId(String(member.id));
    setChatStatus(t("Обновляем ключ чата «{chat}»...", { chat: selectedChat.name }));
    try {
      const remainingMembers = selectedChat.members.filter((item) => item.id !== member.id);
      const ownerMember = remainingMembers.find((item) => item.id === currentUserId);
      if (!ownerMember) throw new Error(t("В чате должен остаться его владелец"));

      const ownerPublicKey = await importPublicKey(ownerMember.public_key);
      const { aesKey, encryptedKey } = await createChatKey(ownerPublicKey);
      const wrappedKeys = await Promise.all(remainingMembers.map(async (item) => ({
        user_id: item.id,
        encrypted_key: item.id === currentUserId
          ? encryptedKey
          : await wrapChatKey(aesKey, await importPublicKey(item.public_key)),
      })));
      const response = await apiFetch(
        `${API_URL}/chats/${selectedChat.id}/members?member_id=${member.id}`,
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
          ? t("Удалять участников может только владелец чата")
          : t("Не удалось удалить участника"));
      }

      const updatedChat = await response.json();
      const normalizedChatId = String(updatedChat.id);
      const updatedKeys = new Map(chatKeysRef.current.get(normalizedChatId) || []);
      updatedKeys.set(updatedChat.current_key_version, aesKey);
      chatKeysRef.current.set(normalizedChatId, updatedKeys);
      chatKeyVersionsRef.current.set(normalizedChatId, updatedChat.current_key_version);
      setChats((current) => current.map((item) => item.id === updatedChat.id ? updatedChat : item));
      setChatStatus(t("{member} удалён из чата; ключ обновлён", { member: member.name }));
      addEvent("system", t("{member} удалён из чата #{chatId}", { member: member.name, chatId: updatedChat.id }), {
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
      setInviteStatus(t("Профиль ещё не загружен. Обновите страницу или войдите снова."));
      return;
    }

    setInviteActionId(String(invite.id));
    setInviteStatus(t("Подготавливаем ключи чата..."));
    try {
      const chatResponse = await apiFetch(`${API_URL}/chats/${invite.chat_id}`, {
        credentials: "include",
      });
      if (!chatResponse.ok) throw new Error(t("Не удалось загрузить данные чата"));
      const chat = await chatResponse.json();
      if (chat.members?.some((member) => member.id === currentUserId)) {
        throw new Error(t("Вы уже состоите в этом чате"));
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
            t("Участник {member} (#{memberId}) имеет некорректный RSA-ключ. ", { member: member.name, memberId: member.id })
            + t("Чат создан с тестовой заглушкой ключа; его нужно пересоздать с фронтенда."),
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

      const response = await apiFetch(`${API_URL}/chats/invites/${invite.id}/accept`, {
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
      if (!response.ok) throw new Error(t("Не удалось принять приглашение"));

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
      setInviteStatus(t("Вы присоединились к чату «{chat}»", { chat: updatedChat.name }));
    } catch (error) {
      setInviteStatus(error.message);
    } finally {
      setInviteActionId("");
    }
  };

  const declineInvite = async (invite) => {
    setInviteActionId(String(invite.id));
    setInviteStatus(t("Отклоняем приглашение..."));
    try {
      const response = await apiFetch(`${API_URL}/chats/invites/${invite.id}/decline`, {
        method: "DELETE",
        headers: { "X-CSRF-TOKEN": getCookie("csrf_access_token") },
        credentials: "include",
      });
      if (!response.ok) throw new Error(t("Не удалось отклонить приглашение"));
      setInvites((current) => current.filter((item) => item.id !== invite.id));
      setInviteStatus(t("Приглашение отклонено"));
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

    setChatStatus(t("Создаём..."));
    try {
      const chatRsaPair = await getChatKeyPair(temporaryChatId, name);
      const publicKey = await exportPublicKey(chatRsaPair.publicKey);
      const { aesKey, encryptedKey } = await createChatKey(chatRsaPair.publicKey);
      const response = await apiFetch(`${API_URL}/chats`, {
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
        throw new Error(response.status === 401 ? t("Сессия истекла") : t("Не удалось создать чат"));
      }
      const chat = await response.json();
      await moveChatKeyPair(temporaryChatId, chat.id, name);
      chatRsaKeysRef.current.set(String(chat.id), chatRsaPair);
      chatKeysRef.current.set(String(chat.id), new Map([[chat.current_key_version, aesKey]]));
      setChats((current) => [...current, chat]);
      setSelectedChatId(String(chat.id));
      setNewChatName("");
      setChatStatus(t("Чат «{chat}» создан", { chat: chat.name }));
      addEvent("system", t("Создан чат #{chatId}: {chat}", { chatId: chat.id, chat: chat.name }));
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
      setChatStatus(t("Удалить чат может только его владелец"));
      return;
    }
    if (!window.confirm(t("Удалить чат «{chat}»? Это действие нельзя отменить.", { chat: chat.name }))) return;

    const chatId = String(chat.id);
    setDeletingChatId(chatId);
    setChatStatus(t("Удаляем чат «{chat}»...", { chat: chat.name }));
    try {
      const response = await apiFetch(`${API_URL}/chats/${chat.id}`, {
        method: "DELETE",
        headers: { "X-CSRF-TOKEN": getCookie("csrf_access_token") },
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(response.status === 403
          ? t("Удалить чат может только его владелец")
          : t("Не удалось удалить чат"));
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
      setChatStatus(t("Чат «{chat}» удалён", { chat: chat.name }));
      addEvent("system", t("Удалён чат #{chatId}: {chat}", { chatId: chat.id, chat: chat.name }));
    } catch (error) {
      setChatStatus(error.message);
    } finally {
      setDeletingChatId("");
    }
  };

  const patchChatMetadata = async (event) => {
    event.preventDefault();
    if (!selectedChatId) return;

    setChatStatus(t("Обновляем метаданные..."));
    try {
      const response = await apiFetch(`${API_URL}/chats/${selectedChatId}`, {
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
      if (!response.ok) throw new Error(t("Не удалось обновить метаданные"));
      const chat = await response.json();
      setChats((current) => current.map((item) => item.id === chat.id ? chat : item));
      setChatMetaName("");
      setChatMetaOwnerId("");
      setChatStatus(t("Метаданные обновлены"));
    } catch (error) {
      setChatStatus(error.message);
    }
  };

  const login = async (event) => {
    event.preventDefault();
    clearInMemoryChatState();
    setAuthStatus(t("Входим..."));
    try {
      const response = await fetch(`${API_URL}/users/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, password }),
      });
      if (!response.ok) throw new Error(t("Неверное имя или пароль"));
      localStorage.setItem("secret-chat-user", name);
      setIsAuthenticated(true);
      setAuthStatus(t("Вход выполнен"));
      addEvent("system", t("Токены получены в cookie"));
      await loadProfile();
      if (await loadChats()) connect();
      await loadInvites();
    } catch (error) {
      setAuthStatus(error.message);
      addEvent("error", error.message);
    }
  };

  const register = async (event) => {
    event.preventDefault();
    setAuthSubmitting(true);
    setAuthStatus(t("Создаём аккаунт..."));
    try {
      const response = await fetch(`${API_URL}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), password }),
      });
      if (!response.ok) {
        if (response.status === 409) throw new Error(t("Пользователь с таким именем уже существует"));
        if (response.status === 422) throw new Error(t("Проверьте имя и пароль"));
        throw new Error(t("Не удалось создать аккаунт ({status})", { status: response.status }));
      }
      setName(name.trim());
      setPassword("");
      setIsRegistering(false);
      setAuthStatus(t("Аккаунт создан. Теперь войдите."));
    } catch (error) {
      setAuthStatus(error.message);
    } finally {
      setAuthSubmitting(false);
    }
  };

  const deleteAccount = async () => {
    if (!currentUserId || deletingAccount) return;
    const confirmed = window.confirm(
      t("Удалить аккаунт без возможности восстановления? Локальные RSA-ключи этого аккаунта тоже будут удалены."),
    );
    if (!confirmed) return;

    setDeletingAccount(true);
    setAuthStatus(t("Удаляем аккаунт..."));
    try {
      const response = await apiFetch(`${API_URL}/users/${currentUserId}`, {
        method: "DELETE",
        headers: { "X-CSRF-TOKEN": getCookie("csrf_access_token") },
      });
      if (!response.ok) throw new Error(t("Не удалось удалить аккаунт ({status})", { status: response.status }));

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
        ? t("Аккаунт удалён, но локальные ключи удалить не удалось")
        : t("Аккаунт удалён"));
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
    addEvent("system", t("Подключение к {url}", { url: DEFAULT_URL }));
    socket.onopen = () => {
      if (socketRef.current !== socket) return;
      setStatus("online");
      addEvent("system", t("Соединение установлено"));
    };
    socket.onmessage = ({ data }) => {
      if (socketRef.current === socket) parseServerMessage(data);
    };
    socket.onerror = () => {
      if (socketRef.current === socket) addEvent("error", t("Ошибка WebSocket"));
    };
    socket.onclose = ({ code, reason }) => {
      if (socketRef.current !== socket) return;
      connectAttemptRef.current = false;
      setStatus("offline");
      socketRef.current = null;
      addEvent("system", t("Соединение закрыто · {code}{reason}", { code, reason: reason ? ` · ${reason}` : "" }));
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
      if (expectedVersion == null) throw new Error(t("Не удалось определить версию AES-ключа чата"));
      await refreshChatKeys(selectedChatId, expectedVersion);
      const aesKey = getChatKey(selectedChatId, expectedVersion);
      if (!aesKey) throw new Error(t("AES-ключ версии {version} недоступен", { version: expectedVersion }));

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
            <p className="eyebrow">{t("WEBSOCKET LAB · LOCAL CLIENT")}</p>
            <h1>SecretChat <span>{isRegistering ? t("Создать аккаунт") : t("Вход")}</span></h1>
            <p className="subtitle">
              {isRegistering ? t("Создайте аккаунт для защищённого общения.") : t("Войдите, чтобы загрузить ваши чаты.")}
            </p>
          </div>
          <LanguageSwitcher language={language} onChange={changeLanguage} />
        </section>
        <form className="panel auth-card login-form" onSubmit={isRegistering ? register : login}>
          <div className="panel-heading">
            <div>
              <span className="section-number">01</span>
              <h2>{isRegistering ? t("Регистрация") : t("Вход")}</h2>
            </div>
            <span className="lock">{t("COOKIE AUTH")}</span>
          </div>
          <label className="field-label" htmlFor="user-name">{t("Имя пользователя")}</label>
          <input
            id="user-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={20}
            autoComplete="username"
            required
          />
          <label className="field-label" htmlFor="user-password">{t("Пароль")}</label>
          <input
            id="user-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={isRegistering ? "new-password" : "current-password"}
            required
          />
          <button className="send-button" type="submit" disabled={authSubmitting}>
            {authSubmitting ? t("Подождите...") : isRegistering ? t("Создать аккаунт") : t("Вход")} <span>↗</span>
          </button>
          {authStatus && <p className="auth-status">{authStatus}</p>}
          <button
            className="text-button"
            type="button"
            onClick={() => {
              setIsRegistering((current) => !current);
              setAuthStatus("");
            }}
            disabled={authSubmitting}
          >
            {isRegistering ? t("Уже есть аккаунт? Войти") : t("Нет аккаунта? Зарегистрироваться")}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="hero">
        <div className="brand-mark">SC</div>
        <div>
          <p className="eyebrow">{t("WEBSOCKET LAB · LOCAL CLIENT")}</p>
          <h1>SecretChat <span>{t("Тестовая комната")}</span></h1>
          <p className="subtitle">{t("Небольшая лаборатория для проверки входящих и исходящих кадров.")}</p>
        </div>
        <div className="topbar-actions">
          <div className="user-pill">
            {t("Аккаунт:")} <strong>{name || t("guest")}</strong>
          </div>
          <button
            className="text-button danger-button delete-account-button"
            type="button"
            onClick={deleteAccount}
            disabled={deletingAccount || profileLoading || !currentUserId}
          >
            {deletingAccount ? t("Удаляем...") : t("Удалить аккаунт")}
          </button>
          <div className={`status-pill ${status}`}>
            <i /> {t(status)}
          </div>
          <LanguageSwitcher language={language} onChange={changeLanguage} />
        </div>
      </section>
      <section className="workspace">
        <aside className="panel chat-sidebar">
          <div className="panel-heading sidebar-heading">
            <div>
              <span className="section-number">01</span>
              <h2>{t("Ваши чаты")}</h2>
            </div>
            <span className="lock">{chats.length}</span>
          </div>
          <div className="chat-list" aria-label={t("Ваши чаты")}>
            {!chats.length && (
              <div className="chat-list-empty">
                {chatsLoading ? t("Загрузка чатов...") : t("Чаты не найдены")}
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
                      <small>#{chat.id} · {t("{count} members", { count: chat.members?.length || 0 })}</small>
                    </span>
                    <span className="chat-item-count">{messageCount}</span>
                  </button>
                  {chat.owner?.id === currentUserId && (
                    <button
                      className="chat-delete-button"
                      type="button"
                      onClick={() => deleteChat(chat)}
                      disabled={Boolean(deletingChatId)}
                      aria-label={t("Удалить чат {chat}", { chat: chat.name })}
                      title={t("Удалить чат {chat}", { chat: chat.name })}
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <form className="create-chat-form" onSubmit={createChat}>
            <label className="field-label" htmlFor="new-chat-name">{t("Создать чат")}</label>
            <div className="create-chat-row">
              <input
                id="new-chat-name"
                value={newChatName}
                onChange={(event) => setNewChatName(event.target.value)}
                placeholder={t("Название чата")}
                maxLength="100"
              />
              <button
                className="secondary-button"
                type="submit"
                disabled={!newChatName.trim() || typeof crypto?.subtle === "undefined"}
              >
                {t("Создать")}
              </button>
            </div>
            <p className="crypto-status">{cryptoStatus}</p>
          </form>
          <div className="inbox-heading">
            <h3>{t("Приглашения")}</h3>
            <button
              className="text-button"
              type="button"
              onClick={loadInvites}
              disabled={invitesLoading}
              aria-label={t("Обновить приглашения")}
              title={t("Обновить приглашения")}
            >
              {invitesLoading ? "..." : t("Обновить")}
            </button>
          </div>
          <div className="invite-list" aria-live="polite">
            {invitesLoading && !invites.length && <p className="invite-empty">{t("Загружаем приглашения...")}</p>}
            {!invitesLoading && !invites.length && <p className="invite-empty">{t("Новых приглашений нет")}</p>}
            {invites.map((invite) => (
              <article className="invite-item" key={invite.id}>
                <div className="invite-copy">
                  <strong>{invite.chat_name}</strong>
                  <small>{t("Чат #{chatId} · приглашение #{inviteId}", { chatId: invite.chat_id, inviteId: invite.id })}</small>
                </div>
                <div className="invite-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => acceptInvite(invite)}
                    disabled={Boolean(inviteActionId) || profileLoading || !currentUserId}
                    title={profileLoading ? t("Загружаем профиль") : !currentUserId ? t("Не удалось получить ID аккаунта") : t("Принять приглашение")}
                  >
                    {t("Принять")}
                  </button>
                  <button
                    className="text-button danger-button"
                    type="button"
                    onClick={() => declineInvite(invite)}
                    disabled={Boolean(inviteActionId)}
                  >
                    {t("Отклонить")}
                  </button>
                </div>
              </article>
            ))}
          </div>
          {!profileLoading && !currentUserId && invites.length > 0 && (
            <p className="invite-note">{t("Не удалось загрузить ID аккаунта. Обновите страницу или войдите снова.")}</p>
          )}
          {inviteStatus && <p className="invite-status" role="status">{inviteStatus}</p>}
        </aside>

        <div className="chat-column">
          <section className="panel log-panel" aria-label={t("Сообщения чата")}>
            <div className="chat-toolbar">
              <div className="chat-title-group">
                <span className="active-chat-mark" aria-hidden="true">//</span>
                <div>
                  <h2>{selectedChat?.name || t("Выберите чат")}</h2>
                  <p>{selectedChat
                    ? t("Чат #{chatId} · {count} участников", {
                      chatId: selectedChat.id,
                      count: selectedChat.members?.length || 0,
                    })
                    : t("История сообщений")}</p>
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
                {t("Очистить")}
              </button>
            </div>
            <div className="event-list">
              {messagesLoading && (
                <div className="empty-state">
                  <div className="signal-art" aria-hidden="true"><span>{t("SYNCING")}</span></div>
                  <strong>{t("Загрузка сообщений")}</strong>
                </div>
              )}
              {!messagesLoading && !visibleEvents.length && (
                <div className="empty-state">
                  <div className="signal-art" aria-hidden="true"><span>{t("NO SIGNAL")}</span></div>
                  <strong>{t("Пока тихо")}</strong>
                  <span>{t("Отправьте первое сообщение.")}</span>
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
                      <span>{event.type === "in" ? t("ВХОДЯЩЕЕ") : event.type === "out" ? t("ВЫ") : event.type.toUpperCase()}</span>
                      <time>{event.time}</time>
                    </div>
                    {messageBody !== null ? (
                      <>
                        <p className="message-body">{messageBody}</p>
                        <details className="event-payload">
                          <summary>{t("Данные пакета")}</summary>
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
              aria-label={t("Сообщение")}
              placeholder={selectedChatId ? t("Напишите сообщение...") : t("Сначала выберите чат")}
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
                {isConnected ? t("Соединение установлено") : t("Нет соединения")}
              </span>
              <button className="send-button" type="submit" disabled={!isConnected || !selectedChatId || !payload.trim()}>
                {t("Отправить")} <span>↑</span>
              </button>
            </div>
          </form>
        </div>

        <aside className="panel details-panel">
          <div className="panel-heading sidebar-heading">
            <div>
              <span className="section-number">02</span>
              <h2>{t("Участники")}</h2>
            </div>
            <span className="lock">{selectedChat?.members?.length || 0}</span>
          </div>
          <div className="member-list" aria-label={t("Участники выбранного чата")}>
            {!selectedChat?.members?.length && (
              <p className="invite-empty">{t("Выберите чат, чтобы увидеть участников")}</p>
            )}
            {selectedChat?.members?.map((member) => (
              <div className="member-item" key={member.id}>
                <span className="member-avatar" aria-hidden="true">{member.name.slice(0, 1).toUpperCase()}</span>
                <div className="invite-copy">
                  <strong>{member.name}</strong>
                  <small>{member.id === selectedChat.owner?.id ? t("ВЛАДЕЛЕЦ") : `ID ${member.id}`}</small>
                </div>
                {selectedChat.owner?.id === currentUserId && member.id !== currentUserId && (
                  <button
                    className="text-button danger-button member-remove"
                    type="button"
                    onClick={() => deleteMember(member)}
                    disabled={Boolean(deletingMemberId)}
                    aria-label={t("Удалить {member} из чата", { member: member.name })}
                    title={t("Удалить участника")}
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
                <summary>{t("Добавить участника")}</summary>
                <form className="management-form" onSubmit={sendInvite}>
                  <label className="field-label" htmlFor="new-member-id">{t("ID пользователя")}</label>
                  <input
                    id="new-member-id"
                    type="number"
                    min="1"
                    value={newMemberId}
                    onChange={(event) => setNewMemberId(event.target.value)}
                    placeholder={t("Например, 12")}
                    required
                  />
                  <button
                    className="secondary-button"
                    type="submit"
                    disabled={!newMemberId || inviteSubmitting}
                  >
                    {inviteSubmitting ? t("Отправка...") : t("Отправить приглашение")}
                  </button>
                </form>
              </details>
              <details className="management-disclosure">
                <summary>{t("Настройки чата")}</summary>
                <form className="management-form" onSubmit={patchChatMetadata}>
                  <label className="field-label" htmlFor="chat-meta-name">{t("Название")}</label>
                  <input
                    id="chat-meta-name"
                    value={chatMetaName}
                    onChange={(event) => setChatMetaName(event.target.value)}
                    placeholder={selectedChat.name}
                    disabled={!selectedChatId}
                  />
                  <label className="field-label" htmlFor="chat-meta-owner">{t("Новый ID владельца")}</label>
                  <input
                    id="chat-meta-owner"
                    type="number"
                    min="1"
                    value={chatMetaOwnerId}
                    onChange={(event) => setChatMetaOwnerId(event.target.value)}
                    placeholder={String(selectedChat.owner?.id || t("ID пользователя"))}
                    disabled={!selectedChatId}
                  />
                  <button
                    className="secondary-button"
                    type="submit"
                    disabled={!selectedChatId || (!chatMetaName.trim() && !chatMetaOwnerId)}
                  >
                    {t("Сохранить")}
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
