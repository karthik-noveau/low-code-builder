import {
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import {
  PutCommand,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { deleteKeys, partitionRows } from "./lifecycle";
import { db, getItem, putItem, deleteItem } from "./database";
import {
  config,
  local,
  insist,
  epoch,
  isConditional,
  HttpError,
} from "./config";

const scrypt = promisify(scryptCallback);
interface User {
  id: string;
  email: string;
  salt: string;
  hash: string;
  generation?: number;
}
interface Session {
  owner: string;
  email: string;
  expires: number;
  generation?: number;
}
const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function localAuthenticate(
  mode: "register" | "login",
  input: Record<string, unknown>,
) {
  insist(local, 404, "Not found.");
  insist(
    input && typeof input === "object" && !Array.isArray(input),
    400,
    "Expected a JSON object.",
  );
  insist(
    typeof input.email === "string" &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) &&
      input.email.length <= 254,
    422,
    "Enter a valid email address.",
  );
  insist(
    typeof input.password === "string" &&
      input.password.length >= 10 &&
      input.password.length <= 128,
    422,
    "Use a password with 10–128 characters.",
  );
  const email = input.email.trim().toLowerCase();
  const key = { pk: `EMAIL#${email}`, sk: "USER" };
  let user = await getItem<User>(key.pk, key.sk);
  if (mode === "register") {
    insist(!user, 409, "An account with this email already exists.");
    const salt = randomBytes(16).toString("hex");
    const hash = ((await scrypt(input.password, salt, 64)) as Buffer).toString(
      "hex",
    );
    user = { id: randomUUID(), email, salt, hash };
    try {
      await db.send(
        new PutCommand({
          TableName: config.table,
          Item: { ...key, ...user },
          ConditionExpression: "attribute_not_exists(pk)",
        }),
      );
    } catch (error) {
      if (isConditional(error))
        throw new HttpError(409, "An account with this email already exists.");
      throw error;
    }
  } else {
    // Do the same expensive hash even when an email is unknown.
    const candidate = (await scrypt(
      input.password,
      user?.salt || "00000000000000000000000000000000",
      64,
    )) as Buffer;
    insist(
      user && timingSafeEqual(candidate, Buffer.from(user.hash, "hex")),
      401,
      "Email or password is incorrect.",
    );
  }
  const token = randomBytes(32).toString("base64url");
  const expires = epoch() + 8 * 3600;
  await putItem({
    pk: `SESSION#${hashToken(token)}`,
    sk: "SESSION",
    owner: user.id,
    email,
    expires,
    generation: user.generation || 0,
  });
  return { token, expires, user: { id: user.id, email } };
}
export async function localSession(token: string) {
  if (!local || !/^[\w-]{43}$/.test(token)) return undefined;
  const session = await getItem<Session>(
    `SESSION#${hashToken(token)}`,
    "SESSION",
  );
  if (!session || session.expires <= epoch()) return undefined;
  const user = await getItem<User>(`EMAIL#${session.email}`, "USER");
  return user?.id === session.owner &&
    (user.generation || 0) === (session.generation || 0)
    ? session
    : undefined;
}
export async function localLogout(token: string) {
  if (/^[\w-]{43}$/.test(token))
    await deleteItem(`SESSION#${hashToken(token)}`, "SESSION");
}

function passwordInput(value: unknown): string {
  insist(
    typeof value === "string" && value.length >= 10 && value.length <= 128,
    422,
    "Use a password with 10–128 characters.",
  );
  return value;
}
async function verifyPassword(session: Session, password: unknown) {
  const user = await getItem<User>(`EMAIL#${session.email}`, "USER");
  insist(
    typeof password === "string" && password.length <= 128,
    422,
    "Enter your current password.",
  );
  const candidate = (await scrypt(
    password,
    user?.salt || "00000000000000000000000000000000",
    64,
  )) as Buffer;
  insist(
    user &&
      user.id === session.owner &&
      timingSafeEqual(candidate, Buffer.from(user.hash, "hex")),
    401,
    "Your current password is incorrect.",
  );
  return user;
}
export async function localRecovery(
  action: "forgot" | "reset",
  input: Record<string, unknown>,
) {
  insist(local, 404, "Not found.");
  if (action === "forgot") {
    insist(
      typeof input.email === "string" && input.email.length <= 254,
      422,
      "Enter your email address.",
    );
    const email = input.email.trim().toLowerCase();
    const user = await getItem<User>(`EMAIL#${email}`, "USER");
    if (user) {
      const token = randomBytes(32).toString("hex");
      await putItem({
        pk: `RESET#${hashToken(token)}`,
        sk: "RESET",
        email,
        owner: user.id,
        generation: user.generation || 0,
        expires: epoch() + 1800,
      });
      // Local mail is private filesystem data, never returned to an unauthenticated API caller.
      const directory = path.join(config.data, "mail");
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeFile(
        path.join(directory, `reset-${randomUUID()}.json`),
        JSON.stringify(
          {
            to: email,
            subject: "Reset your Forma password",
            url: `${config.editorOrigin}/account?reset=${token}`,
            localOnly: true,
          },
          null,
          2,
        ),
        { mode: 0o600 },
      );
    }
    return {
      ok: true,
      message:
        "If that local account exists, a reset email preview has been saved in .local/data/mail/. No email was sent.",
    };
  }
  insist(
    typeof input.token === "string" && /^[a-f0-9]{64}$/.test(input.token),
    422,
    "Invalid reset link.",
  );
  const password = passwordInput(input.password);
  const resetKey = { pk: `RESET#${hashToken(input.token)}`, sk: "RESET" };
  const reset = await getItem<{
    email: string;
    owner: string;
    generation: number;
    expires: number;
  }>(resetKey.pk, resetKey.sk);
  insist(
    reset && reset.expires > epoch(),
    410,
    "This reset link is expired or was already used.",
  );
  const user = await getItem<User>(`EMAIL#${reset.email}`, "USER");
  insist(
    user?.id === reset.owner && (user.generation || 0) === reset.generation,
    410,
    "This reset link is no longer valid.",
  );
  const salt = randomBytes(16).toString("hex"),
    hash = ((await scrypt(password, salt, 64)) as Buffer).toString("hex");
  await db.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: config.table,
            Item: {
              pk: `EMAIL#${user.email}`,
              sk: "USER",
              ...user,
              salt,
              hash,
              generation: reset.generation + 1,
            },
            ConditionExpression:
              "#hash = :hash AND (attribute_not_exists(generation) OR generation = :generation)",
            ExpressionAttributeNames: { "#hash": "hash" },
            ExpressionAttributeValues: {
              ":hash": user.hash,
              ":generation": reset.generation,
            },
          },
        },
        {
          Delete: {
            TableName: config.table,
            Key: resetKey,
            ConditionExpression: "attribute_exists(pk)",
          },
        },
      ],
    }),
  );
  return {
    ok: true,
    message: "Password updated. Sign in again on each device.",
  };
}
export async function localAccountAction(
  session: Session,
  action: "password" | "delete" | "logout-all",
  input: Record<string, unknown>,
) {
  insist(local, 404, "Not found.");
  const user = await verifyPassword(session, input.currentPassword);
  if (action === "password") {
    const password = passwordInput(input.password),
      salt = randomBytes(16).toString("hex"),
      hash = ((await scrypt(password, salt, 64)) as Buffer).toString("hex");
    await db.send(
      new UpdateCommand({
        TableName: config.table,
        Key: { pk: `EMAIL#${user.email}`, sk: "USER" },
        UpdateExpression:
          "SET salt = :salt, #hash = :hash, generation = :generation",
        ConditionExpression:
          "#hash = :previous AND (attribute_not_exists(generation) OR generation = :old)",
        ExpressionAttributeNames: { "#hash": "hash" },
        ExpressionAttributeValues: {
          ":salt": salt,
          ":hash": hash,
          ":generation": (user.generation || 0) + 1,
          ":previous": user.hash,
          ":old": user.generation || 0,
        },
      }),
    );
  } else if (action === "logout-all") {
    await db.send(
      new UpdateCommand({
        TableName: config.table,
        Key: { pk: `EMAIL#${user.email}`, sk: "USER" },
        UpdateExpression: "ADD generation :one",
        ConditionExpression: "#hash = :previous",
        ExpressionAttributeNames: { "#hash": "hash" },
        ExpressionAttributeValues: { ":one": 1, ":previous": user.hash },
      }),
    );
  } else {
    insist(
      input.confirmation === `DELETE ${user.email}`,
      422,
      `Type DELETE ${user.email} to delete your local account.`,
    );
    const rows = await partitionRows(`USER#${user.id}`);
    insist(
      !rows.some((row) => String(row.sk).startsWith("SITE#")),
      409,
      "Delete your owned websites first. Export any records you want to keep.",
    );
    await db.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            ConditionCheck: {
              TableName: config.table,
              Key: { pk: `USER#${user.id}`, sk: "QUOTA" },
              ConditionExpression:
                "attribute_not_exists(siteCount) OR siteCount = :zero",
              ExpressionAttributeValues: { ":zero": 0 },
            },
          },
          {
            Put: {
              TableName: config.table,
              Item: { pk: `USER#${user.id}`, sk: "ACCOUNT", state: "deleting" },
            },
          },
        ],
      }),
    );
    const grants = rows.filter((row) => String(row.sk).startsWith("ACCESS#"));
    await deleteKeys(
      grants.map((row) => ({
        pk: `COMMERCE#${row.siteId}`,
        sk: `MEMBER#${user.id}`,
      })),
    );
    await deleteKeys(
      rows
        .filter((row) => row.sk !== "ACCOUNT")
        .map((row) => ({ pk: String(row.pk), sk: String(row.sk) })),
    );
    await db.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Delete: {
              TableName: config.table,
              Key: { pk: `EMAIL#${user.email}`, sk: "USER" },
              ConditionExpression: "id = :id",
              ExpressionAttributeValues: { ":id": user.id },
            },
          },
          {
            Put: {
              TableName: config.table,
              Item: { pk: `USER#${user.id}`, sk: "ACCOUNT", state: "deleted" },
            },
          },
        ],
      }),
    );
  }
  return { ok: true };
}
