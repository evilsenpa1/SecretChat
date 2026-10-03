const rsaKeyStoragePrefix = "secret-chat-rsa-";
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const rsaOaepAlgorithm = { name: "RSA-OAEP", hash: "SHA-256" };
const aesGcmAlgorithm = { name: "AES-GCM" };

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
    let stored = sessionStorage.getItem(storageKey) || localStorage.getItem(storageKey);

    if (!stored && expectedPublicKey) {
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
                }
            } catch {
                // Ignore legacy key material that cannot be verified for this account.
            }
        }
    }

    if (stored && expectedPublicKey) {
        const storedKeys = JSON.parse(stored);
        const storedPublicKey = await crypto.subtle.importKey(
            "jwk",
            storedKeys.publicKey,
            rsaOaepAlgorithm,
            true,
            ["encrypt"],
        );
        if ((await exportPublicKey(storedPublicKey)) !== expectedPublicKey) {
            throw new Error("Локальная RSA-пара не соответствует чату; импортируйте верную пару");
        }
    }

    if (stored) {
        sessionStorage.setItem(storageKey, stored);
        const keys = JSON.parse(stored);
        return {
            publicKey: await crypto.subtle.importKey(
                "jwk",
                keys.publicKey,
                rsaOaepAlgorithm,
                true,
                ["encrypt"],
            ),
            privateKey: await crypto.subtle.importKey(
                "jwk",
                keys.privateKey,
                rsaOaepAlgorithm,
                true,
                ["decrypt"],
            ),
        };
    }

    if (expectedPublicKey) {
        throw new Error("Для этого чата нужно импортировать RSA-пару");
    }

    const keyPair = await crypto.subtle.generateKey(
        {
            ...rsaOaepAlgorithm,
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
        },
        true,
        ["encrypt", "decrypt"],
    );
    const keys = {
        publicKey: await crypto.subtle.exportKey("jwk", keyPair.publicKey),
        privateKey: await crypto.subtle.exportKey("jwk", keyPair.privateKey),
    };
    sessionStorage.setItem(storageKey, JSON.stringify(keys));
    return keyPair;
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
