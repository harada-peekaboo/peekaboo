const crypto = require("crypto");

const DEFAULT_PASSWORD_HASH = "efd6a8959cbb86226a7382b57b7f18e89b72576ce048d267182a0bceebf8a1e9";
const STORE_NAME = "peekaboo-reception-admin";
const STATE_KEY = "admin-state";
const APP_VERSION = "server-sync-health-20260714";

const DEFAULT_SETTINGS = {
  recipientEmail: "recruit@peek-a-boo.co.jp",
  recruitmentStatus: "open",
  closedMessage: "現在、レセプション職の募集は行っておりません。募集再開までしばらくお待ちください。",
  mailSubject: "PEEK-A-BOO レセプション職 応募",
  successMessage: "ご応募ありがとうございます。内容を確認のうえ、担当者よりご連絡いたします。"
};

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(payload)
  };
}

function parseBody(event) {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch {
    return {};
  }
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password || "")).digest("hex");
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function sessionSecret() {
  return process.env.ADMIN_SESSION_SECRET || "peekaboo-reception-local-session-secret";
}

function signToken(payload) {
  const body = base64url(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", sessionSecret())
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
}

function verifyToken(token) {
  if (!token || !token.includes(".")) return false;
  const [body, signature] = token.split(".");
  const expected = crypto
    .createHmac("sha256", sessionSecret())
    .update(body)
    .digest("base64url");

  const given = Buffer.from(signature || "");
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !crypto.timingSafeEqual(given, wanted)) {
    return false;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return payload.exp && payload.exp > Date.now();
  } catch {
    return false;
  }
}

function getToken(event) {
  const auth = event.headers.authorization || event.headers.Authorization || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : "";
}

function requireAdmin(event) {
  return verifyToken(getToken(event));
}

function getEnvValue(names) {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function blobConfigMessage(siteID, token) {
  return [
    "Netlify Blobsの接続情報がFunctions側で見えていません。",
    `siteID: ${siteID ? "あり" : "なし"}`,
    `token: ${token ? "あり" : "なし"}`,
    "NetlifyのEnvironment variablesで、NETLIFY_BLOBS_TOKEN を追加してください。",
    "siteIDがなしの場合だけ、NETLIFY_SITE_ID も追加してください。",
    "変数のScopesはFunctionsを含めてください。",
    "追加後はDeploysからTrigger deploy > Deploy siteで再デプロイしてください。"
  ].join(" ");
}

async function getBlobStore() {
  const { getStore } = await import("@netlify/blobs");
  const siteID = getEnvValue([
    "NETLIFY_SITE_ID",
    "SITE_ID",
    "NETLIFY_BLOBS_SITE_ID",
    "BLOBS_SITE_ID"
  ]);
  const token = getEnvValue([
    "NETLIFY_BLOBS_TOKEN",
    "NETLIFY_AUTH_TOKEN",
    "NETLIFY_TOKEN",
    "BLOBS_TOKEN"
  ]);

  if (siteID && token) {
    return getStore(STORE_NAME, {
      siteID,
      token
    });
  }

  throw new Error(blobConfigMessage(siteID, token));
}

async function readState() {
  const store = await getBlobStore();
  const state = await store.get(STATE_KEY, { type: "json" });
  if (!state) {
    const initialState = {
      passwordHash: DEFAULT_PASSWORD_HASH,
      settings: DEFAULT_SETTINGS
    };
    await store.setJSON(STATE_KEY, initialState);
    return initialState;
  }

  return {
    passwordHash: state.passwordHash || DEFAULT_PASSWORD_HASH,
    settings: { ...DEFAULT_SETTINGS, ...(state.settings || {}) }
  };
}

async function writeState(state) {
  const store = await getBlobStore();
  await store.setJSON(STATE_KEY, {
    passwordHash: state.passwordHash || DEFAULT_PASSWORD_HASH,
    settings: { ...DEFAULT_SETTINGS, ...(state.settings || {}) }
  });
}

function sanitizeSettings(input) {
  const settings = {
    recipientEmail: String(input.recipientEmail || "").trim(),
    recruitmentStatus: input.recruitmentStatus === "closed" ? "closed" : "open",
    closedMessage: String(input.closedMessage || "").trim(),
    mailSubject: String(input.mailSubject || "").trim(),
    successMessage: String(input.successMessage || "").trim()
  };

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.recipientEmail)) {
    throw new Error("応募先メールアドレスを正しく入力してください。");
  }

  for (const key of ["closedMessage", "mailSubject", "successMessage"]) {
    if (!settings[key]) throw new Error("未入力の設定があります。");
  }

  return settings;
}

function routePath(event) {
  let pathname = event.path || "/";
  pathname = pathname.replace(/^\/\.netlify\/functions\/api/, "");
  pathname = pathname.replace(/^\/api/, "");
  pathname = pathname.replace(/^\/+/, "/");
  return pathname || "/";
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return json(204, {});
  }

  const method = event.httpMethod;
  const pathname = routePath(event);

  try {
    if (method === "GET" && ["/health", "/api/health"].includes(pathname)) {
      const siteID = getEnvValue([
        "NETLIFY_SITE_ID",
        "SITE_ID",
        "NETLIFY_BLOBS_SITE_ID",
        "BLOBS_SITE_ID"
      ]);
      const token = getEnvValue([
        "NETLIFY_BLOBS_TOKEN",
        "NETLIFY_AUTH_TOKEN",
        "NETLIFY_TOKEN",
        "BLOBS_TOKEN"
      ]);

      return json(200, {
        ok: true,
        version: APP_VERSION,
        functions: true,
        blobsConfig: {
          siteID: Boolean(siteID),
          token: Boolean(token)
        }
      });
    }

    if (method === "GET" && pathname === "/settings") {
      const state = await readState();
      return json(200, { settings: state.settings });
    }

    if (method === "POST" && pathname === "/admin/login") {
      const body = parseBody(event);
      const state = await readState();
      if (hashPassword(body.password) !== state.passwordHash) {
        return json(401, { error: "パスワードが違います。" });
      }

      const token = signToken({
        role: "admin",
        exp: Date.now() + 1000 * 60 * 60 * 4
      });
      return json(200, { token, settings: state.settings });
    }

    if (!requireAdmin(event)) {
      return json(401, { error: "unauthorized" });
    }

    if (method === "GET" && pathname === "/admin/settings") {
      const state = await readState();
      return json(200, { settings: state.settings });
    }

    if (method === "POST" && pathname === "/admin/settings") {
      const body = parseBody(event);
      const state = await readState();
      state.settings = sanitizeSettings(body.settings || {});
      await writeState(state);
      return json(200, { settings: state.settings });
    }

    if (method === "POST" && pathname === "/admin/reset-settings") {
      const state = await readState();
      state.settings = DEFAULT_SETTINGS;
      await writeState(state);
      return json(200, { settings: state.settings });
    }

    if (method === "POST" && pathname === "/admin/password") {
      const body = parseBody(event);
      const newPassword = String(body.newPassword || "");
      if (newPassword.length < 8) {
        return json(400, { error: "パスワードは8文字以上で入力してください。" });
      }

      const state = await readState();
      state.passwordHash = hashPassword(newPassword);
      await writeState(state);
      return json(200, { ok: true });
    }

    return json(404, { error: "not found" });
  } catch (error) {
    return json(500, { error: error.message || "server error" });
  }
};
