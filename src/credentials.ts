import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { AsyncEntry } from "@napi-rs/keyring";

import type { CredentialStore } from "./list-todos";

export const KEYRING_SERVICE = "icourse163.mcp";
export const KEYRING_ACCOUNT = "cookie";

const FILE_MODE = 0o600;
const DIR_MODE = 0o700;

export type WritableCredentialStore = CredentialStore & {
  setCookie(cookie: string): Promise<void>;
  clearCookie(): Promise<void>;
};

export function defaultSessionFilePath(
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): string {
  const xdg = env.XDG_CONFIG_HOME?.trim();
  if (xdg != null && xdg.length > 0) {
    return join(xdg, "icourse163-mcp", "session");
  }
  return join(home, ".config", "icourse163-mcp", "session");
}

export function createFileCredentialStore(options: {
  path?: string;
  env?: NodeJS.ProcessEnv;
  homedir?: string;
} = {}): WritableCredentialStore {
  const path =
    options.path ??
    defaultSessionFilePath(options.env ?? process.env, options.homedir ?? homedir());

  return {
    async getCookie() {
      try {
        const raw = await readFile(path, "utf8");
        const trimmed = raw.trim();
        return trimmed.length === 0 ? null : trimmed;
      } catch (error) {
        if (isNotFound(error)) {
          return null;
        }
        throw error;
      }
    },
    async setCookie(cookie: string) {
      await mkdir(dirname(path), { recursive: true, mode: DIR_MODE });
      try {
        await chmodIfPresent(dirname(path), DIR_MODE);
      } catch {
        // Directory mode is best-effort on platforms that ignore mkdir mode.
      }
      const tmp = `${path}.${randomBytes(8).toString("hex")}.tmp`;
      await writeFile(tmp, cookie, { encoding: "utf8", mode: FILE_MODE });
      try {
        await chmodIfPresent(tmp, FILE_MODE);
        await rename(tmp, path);
        await chmodIfPresent(path, FILE_MODE);
      } catch (error) {
        await unlink(tmp).catch(() => undefined);
        throw error;
      }
    },
    async clearCookie() {
      try {
        await unlink(path);
      } catch (error) {
        if (!isNotFound(error)) {
          throw error;
        }
      }
    },
  };
}

export function createKeyringCredentialStore(options: {
  fallback?: WritableCredentialStore;
  service?: string;
  account?: string;
} = {}): WritableCredentialStore {
  const fallback = options.fallback;
  const entry = new AsyncEntry(
    options.service ?? KEYRING_SERVICE,
    options.account ?? KEYRING_ACCOUNT,
  );

  return {
    async getCookie() {
      try {
        const value = await entry.getPassword();
        if (value != null && value.trim() !== "") {
          return value;
        }
      } catch (error) {
        logStoreError("Failed to read icourse163 cookie from keychain", error);
      }
      if (fallback != null) {
        return fallback.getCookie();
      }
      return null;
    },
    async setCookie(cookie: string) {
      try {
        await entry.setPassword(cookie);
        return;
      } catch (error) {
        logStoreError(
          "Failed to write icourse163 cookie to keychain; using file fallback if available",
          error,
        );
        if (fallback == null) {
          const detail = error instanceof Error ? error.message : String(error);
          throw new Error(`Failed to write icourse163 cookie to keychain: ${detail}`, {
            cause: error,
          });
        }
        await fallback.setCookie(cookie);
      }
    },
    async clearCookie() {
      try {
        await entry.deletePassword();
      } catch (error) {
        logStoreError("Failed to clear icourse163 cookie from keychain", error);
      }
      if (fallback != null) {
        await fallback.clearCookie();
      }
    },
  };
}

export function createLocalCredentialStore(options: {
  env?: NodeJS.ProcessEnv;
  homedir?: string;
} = {}): WritableCredentialStore {
  const env = options.env ?? process.env;
  const home = options.homedir ?? homedir();
  return createKeyringCredentialStore({
    fallback: createFileCredentialStore({ env, homedir: home }),
  });
}

function logStoreError(prefix: string, error: unknown): void {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`${prefix}: ${detail}`);
}

function isNotFound(error: unknown): boolean {
  return (
    error != null &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

async function chmodIfPresent(path: string, mode: number): Promise<void> {
  try {
    const info = await stat(path);
    if (!info.isFile() && !info.isDirectory()) {
      return;
    }
    await chmod(path, mode);
  } catch {
    // chmod is best-effort (Windows, some FS).
  }
}
