import { google, gmail_v1 } from "googleapis";

type GmailClient = ReturnType<typeof google.gmail>;

// 多段ネスト MIME にも対応した本文抽出（HTML 優先 → plain テキスト）
function extractBody(parts: gmail_v1.Schema$MessagePart[]): string | null {
  for (const mimeType of ["text/html", "text/plain"]) {
    for (const part of parts) {
      if (part.mimeType === mimeType && part.body?.data) {
        return Buffer.from(part.body.data, "base64").toString("utf-8");
      }
    }
  }
  // 見つからなければ multipart/* 子部品を再帰探索
  for (const part of parts) {
    if (part.parts?.length) {
      const nested = extractBody(part.parts);
      if (nested) return nested;
    }
  }
  return null;
}

// 全メッセージIDのみを取得（本文は取らない）
export async function listVietcombankMessageIds(
  accessToken: string,
): Promise<string[]> {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: "v1", auth });

  const allIds: string[] = [];
  let pageToken: string | undefined;

  do {
    const res = await gmail.users.messages.list({
      userId: "me",
      // サブドメイン全体をカバー＋成功取引のみ
      q: 'from:(@vietcombank.com.vn) ("Thành công" OR "Biên lai chuyển tiền")',
      maxResults: 500,
      ...(pageToken ? { pageToken } : {}),
    });

    for (const m of res.data.messages ?? []) {
      if (m.id) allIds.push(m.id);
    }

    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return allIds;
}

// 指定IDのメール本文を取得
export async function fetchEmailBody(
  accessToken: string,
  messageId: string,
): Promise<string | null> {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: "v1", auth });

  return fetchBodyFromGmail(gmail, messageId);
}

async function fetchBodyFromGmail(
  gmail: GmailClient,
  messageId: string,
): Promise<string | null> {
  const msgResponse = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  const payload = msgResponse.data.payload;
  let body = "";

  if (payload?.parts?.length) {
    body = extractBody(payload.parts) ?? "";
  }

  if (!body && payload?.body?.data) {
    body = Buffer.from(payload.body.data, "base64").toString("utf-8");
  }

  return body || null;
}
