const rsaKeyStoragePrefix = "secret-chat-rsa-";
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const rsaOaepAlgorithm = { name: "RSA-OAEP", hash: "SHA-256" };
const aesGcmAlgorithm = { name: "AES-GCM" };
const keyDatabaseName = "secret-chat-keys";
const keyStoreName = "rsa-pairs";
let keyDatabasePromise;

function openKeyDatabase() {
    if (!globalThis.indexedDB) {
        throw new Error("Браузер не поддерживает защищённое хранилище ключей");
    }
    if (!keyDatabasePromise) {
        keyDatabasePromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(keyDatabaseName, 1);
            request.onupgradeneeded = () => request.result.createObjectStore(keyStoreName);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error("Хранилище ключей заблокировано другой вкладкой"));
        }).catch((error) => {
            keyDatabasePromise = null;
            throw error;
        });
    }
    return keyDatabasePromise;
}

async function readStoredKeyPair(storageKey) {
    const database = await openKeyDatabase();
    return new Promise((resolve, reject) => {
        const request = database.transaction(keyStoreName, "readonly")
            .objectStore(keyStoreName)
            .get(storageKey);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function writeStoredKeyPair(storageKey, keyPair) {
    const database = await openKeyDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(keyStoreName, "readwrite");
        transaction.objectStore(keyStoreName).put(keyPair, storageKey);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error("Не удалось сохранить RSA-ключ"));
    });
}

async function removeStoredKeyPair(storageKey) {
    const database = await openKeyDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(keyStoreName, "readwrite");
        transaction.objectStore(keyStoreName).delete(storageKey);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error("Не удалось удалить RSA-ключ"));
    });
}

function removeLegacyKeyPair(storageKey) {
    sessionStorage.removeItem(storageKey);
    localStorage.removeItem(storageKey);
}

function bytesToBase64(bytes) {
    let binary = "";
    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });
    return btoa(binary);
}

function base64ToBytes(value) {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function getRsaStorageKey(username, chatId) {
    return `${rsaKeyStoragePrefix}${encodeURIComponent(username || "guest")}-${chatId}`;
}

export async function getChatKeyPair(chatId, username, expectedPublicKey) {
    const storageKey = getRsaStorageKey(username, chatId);
    const legacyStorageKey = `${rsaKeyStoragePrefix}${chatId}`;
    let keyPair = await readStoredKeyPair(storageKey);
    let stored = null;
    let usedLegacyKey = false;

    if (!keyPair) {
        stored = sessionStorage.getItem(storageKey) || localStorage.getItem(storageKey);
    }

    if (!keyPair && !stored && expectedPublicKey) {
        const legacyStored = sessionStorage.getItem(legacyStorageKey)
            || localStorage.getItem(legacyStorageKey);
        if (legacyStored) {
            try {
                const legacyKeys = JSON.parse(legacyStored);
                const legacyPublicKey = await crypto.subtle.importKey(
                    "jwk",
                    legacyKeys.publicKey,
                    rsaOaepAlgorithm,
                    true,
                    ["encrypt"],
                );
                if ((await exportPublicKey(legacyPublicKey)) === expectedPublicKey) {
                    stored = legacyStored;
                    usedLegacyKey = true;
                }
            } catch {
                // Ignore legacy key material that cannot be verified for this account.
            }
        }
    }

    if (stored) {
        try {
            const storedKeys = JSON.parse(stored);
            keyPair = {
                publicKey: await crypto.subtle.importKey(
                    "jwk",
                    storedKeys.publicKey,
                    rsaOaepAlgorithm,
                    true,
                    ["encrypt"],
                ),
                privateKey: await crypto.subtle.importKey(
                    "jwk",
                    storedKeys.privateKey,
                    rsaOaepAlgorithm,
                    false,
                    ["decrypt"],
                ),
            };
        } catch {
            throw new Error("Сохранённая RSA-пара повреждена; импортируйте резервную копию");
        }
    }

    if (keyPair) {
        if (expectedPublicKey && (await exportPublicKey(keyPair.publicKey)) !== expectedPublicKey) {
            throw new Error("Локальная RSA-пара не соответствует чату; импортируйте верную пару");
        }
        await writeStoredKeyPair(storageKey, keyPair);
        removeLegacyKeyPair(storageKey);
        if (usedLegacyKey) removeLegacyKeyPair(legacyStorageKey);
        return keyPair;
    }

    if (expectedPublicKey) {
        throw new Error("Для этого чата нет приватного RSA-ключа на этом origin; импортируйте резервную копию");
    }

    keyPair = await crypto.subtle.generateKey(
        {
            ...rsaOaepAlgorithm,
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
        },
        false,
        ["encrypt", "decrypt"],
    );
    await writeStoredKeyPair(storageKey, keyPair);
    return keyPair;
}

export async function moveChatKeyPair(chatId, newChatId, username) {
    const sourceStorageKey = getRsaStorageKey(username, chatId);
    const destinationStorageKey = getRsaStorageKey(username, newChatId);
    const keyPair = await readStoredKeyPair(sourceStorageKey);
    if (!keyPair) throw new Error("Не найден временный RSA-ключ нового чата");

    await writeStoredKeyPair(destinationStorageKey, keyPair);
    await removeStoredKeyPair(sourceStorageKey);
    removeLegacyKeyPair(sourceStorageKey);
    return keyPair;
}

export async function deleteChatKeyPair(chatId, username) {
    const storageKey = getRsaStorageKey(username, chatId);
    await removeStoredKeyPair(storageKey);
    removeLegacyKeyPair(storageKey);
}

export async function deleteChatKeyPairs(username) {
    const prefix = `${rsaKeyStoragePrefix}${encodeURIComponent(username || "guest")}-`;
    const database = await openKeyDatabase();
    await new Promise((resolve, reject) => {
        const transaction = database.transaction(keyStoreName, "readwrite");
        const objectStore = transaction.objectStore(keyStoreName);
        const request = objectStore.getAllKeys();
        request.onsuccess = () => {
            request.result
                .filter((key) => typeof key === "string" && key.startsWith(prefix))
                .forEach((key) => objectStore.delete(key));
        };
        request.onerror = () => reject(request.error);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error("Не удалось удалить RSA-ключи"));
    });

    for (const storage of [sessionStorage, localStorage]) {
        for (let index = storage.length - 1; index >= 0; index -= 1) {
            const key = storage.key(index);
            if (key?.startsWith(prefix)) storage.removeItem(key);
        }
    }
}

export async function exportPublicKey(key) {
    return bytesToBase64(new Uint8Array(await crypto.subtle.exportKey("spki", key)));
}

export async function importPublicKey(value) {
    return crypto.subtle.importKey(
        "spki",
        base64ToBytes(value),
        rsaOaepAlgorithm,
        true,
        ["encrypt"],
    );
}

export async function createChatKey(publicKey) {
    const aesKey = await crypto.subtle.generateKey(
        { ...aesGcmAlgorithm, length: 256 },
        true,
        ["encrypt", "decrypt"],
    );
    const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", aesKey));
    const encryptedKey = await crypto.subtle.encrypt(
        { name: "RSA-OAEP" },
        publicKey,
        rawKey,
    );
    return { aesKey, encryptedKey: bytesToBase64(new Uint8Array(encryptedKey)) };
}

export async function wrapChatKey(aesKey, publicKey) {
    const rawKey = await crypto.subtle.exportKey("raw", aesKey);
    const encryptedKey = await crypto.subtle.encrypt(
        { name: "RSA-OAEP" },
        publicKey,
        rawKey,
    );
    return bytesToBase64(new Uint8Array(encryptedKey));
}

export async function decryptChatKey(privateKey, encryptedKey) {
    const rawKey = await crypto.subtle.decrypt(
        { name: "RSA-OAEP" },
        privateKey,
        base64ToBytes(encryptedKey),
    );
    return crypto.subtle.importKey(
        "raw",
        rawKey,
        aesGcmAlgorithm,
        false,
        ["encrypt", "decrypt"],
    );
}

export async function encryptMessage(aesKey, value) {
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
        { ...aesGcmAlgorithm, iv: nonce },
        aesKey,
        textEncoder.encode(value),
    );
    return {
        body: bytesToBase64(new Uint8Array(encrypted)),
        nonce: bytesToBase64(nonce),
    };
}

export async function decryptMessage(aesKey, value, nonce) {
    const encrypted = base64ToBytes(value);
    const iv = base64ToBytes(nonce || "");
    const plaintext = await crypto.subtle.decrypt(
        { ...aesGcmAlgorithm, iv },
        aesKey,
        encrypted,
    );
    return textDecoder.decode(plaintext);
}
