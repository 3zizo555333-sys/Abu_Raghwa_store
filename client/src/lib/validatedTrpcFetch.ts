/**
 * tRPC expects a JSON envelope for every response. Some serverless/proxy
 * failures return an empty or HTML body; detect those before the tRPC link
 * tries Response.json(), so the UI receives one actionable error instead of
 * a native JSON parsing exception.
 */
export async function validatedTrpcFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await globalThis.fetch(input, {
    ...(init ?? {}),
    credentials: "include",
  });

  let body: string;
  try {
    body = await response.clone().text();
  } catch {
    throw new Error("تعذر قراءة استجابة واجهة المتجر. لم تُؤكد العملية؛ أعد المحاولة.");
  }

  const status = `HTTP ${response.status}`;
  if (!body.trim()) {
    throw new Error(response.ok
      ? `أعادت واجهة المتجر استجابة فارغة (${status}). لم تُؤكد العملية؛ أعد المحاولة.`
      : `فشل طلب واجهة المتجر (${status}) دون تفاصيل استجابة. لم تُؤكد العملية؛ أعد المحاولة.`);
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(`أعادت واجهة المتجر استجابة غير JSON (${status}). لم تُؤكد العملية؛ أعد المحاولة.`);
  }

  try {
    JSON.parse(body);
  } catch {
    throw new Error(`استجابة واجهة المتجر غير مكتملة أو غير صالحة (${status}). لم تُؤكد العملية؛ أعد المحاولة.`);
  }

  return response;
}
