import { createHash, timingSafeEqual } from "node:crypto";

const requestTimes = [];
const windowMs = 60_000;
const requestsPerWindow = 10;
const bodyLimit = 12_288;

function problem(status, detail, headers) {
  return Response.json({ detail }, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

function configured() {
  return Boolean(process.env.OPENAI_API_KEY?.trim() && process.env.GEORISK_ASSISTANT_PASSWORD?.trim());
}

function hasAccess(request) {
  const [scheme, credentials] = (request.headers.get("Authorization") ?? "").split(" ");
  if (scheme.toLowerCase() !== "basic" || !credentials) return false;
  const digest = value => createHash("sha256").update(value).digest();
  return timingSafeEqual(
    digest(Buffer.from(credentials, "base64")),
    digest(`georisk:${process.env.GEORISK_ASSISTANT_PASSWORD}`),
  );
}

function unavailable() {
  return problem(503, "ЖИ көмекшісінің серверлік баптауы аяқталмаған.");
}

const providerCodes = new Map([
  ["invalid_api_key", ["key", "OpenAI кілтті қабылдамады. Vercel-дегі OPENAI_API_KEY мәнін жаңа кілтпен ауыстырып, сайтты қайта жариялаңыз."]],
  ["insufficient_quota", ["billing", "OpenAI жобасының сұрау қоры таусылған. OpenAI Platform жүйесіндегі төлем мен пайдалану лимитін тексеріңіз."]],
  ["billing_hard_limit_reached", ["billing", "OpenAI жобасы төлем лимитіне жеткен. OpenAI Platform жүйесіндегі лимитті тексеріңіз."]],
  ["model_not_found", ["model", "OpenAI кілтінің осы модельге рұқсаты жоқ немесе модель аты қате. Vercel-дегі OPENAI_MODEL мәнін тексеріңіз."]],
  ["unsupported_country_region_territory", ["location", "OpenAI Vercel функциясы жұмыс істейтін аймақтан сұрау қабылдамайды."]],
]);

const providerStatuses = new Map([
  [400, ["request", "OpenAI сұрау параметрлерін қабылдамады. Vercel-дегі OPENAI_MODEL мәнін тексеріңіз."]],
  [401, providerCodes.get("invalid_api_key")],
  [403, ["permissions", "OpenAI осы сұрауға рұқсат бермеді. Кілттің жобаға және Chat Completions сұрауларына рұқсатын тексеріңіз."]],
  [404, providerCodes.get("model_not_found")],
  [429, ["rate", "OpenAI сұрау шегіне жетті. Кейінірек қайталаңыз."]],
]);

async function providerFailure(result) {
  const payload = await result.json().catch(() => null);
  const [category, detail] =
    providerCodes.get(payload?.error?.code) ??
    providerStatuses.get(result.status) ??
    ["unavailable", "OpenAI қызметі қазір жауап бермеді. Кейінірек қайталаңыз."];
  console.warn("OpenAI assistant request rejected", { status: result.status, category });
  return problem(category === "rate" ? 429 : 502, detail);
}

export function assistantSession(request) {
  if (!configured()) return unavailable();
  if (!hasAccess(request)) {
    return problem(401, "Көмекшіні пайдалану үшін кіріңіз.", {
      "WWW-Authenticate": 'Basic realm="GeoRisk AI Assistant", charset="UTF-8"',
    });
  }
  return new Response(null, {
    status: 303,
    headers: { Location: "/prediction", "Cache-Control": "no-store" },
  });
}

export async function answerAssistant(request) {
  if (!configured()) return unavailable();
  if (!hasAccess(request)) return problem(401, "Көмекшіні пайдалану үшін кіріңіз.");

  const contentType = request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    return problem(415, "Сұрауды JSON пішімінде жіберіңіз.");
  }
  let body;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw) > bodyLimit) {
      return problem(413, "Сұрау тым ұзын.");
    }
    body = JSON.parse(raw);
  } catch {
    return problem(400, "Сұрауды оқу мүмкін болмады.");
  }
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message || message.length > 4000) {
    return problem(422, "Сұрағыңыз 1–4000 таңбадан тұруы керек.");
  }
  if (body.assessment_id != null) {
    return problem(409, "Сақталған талдауды ашу үшін GeoRisk серверін қосыңыз.");
  }

  const now = Date.now();
  while (requestTimes.length && requestTimes[0] <= now - windowMs) requestTimes.shift();
  if (requestTimes.length >= requestsPerWindow) {
    return problem(429, "Сұрау шегі асып кетті. Кейінірек қайталаңыз.", { "Retry-After": "60" });
  }
  requestTimes.push(now);
  try {
    const result = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Сен GeoRisk AI геология көмекшісісің. Қазақша жауап бер. " +
              "Дала өлшемдеріне және сақталған талдауларға қолжетімділігің жоқ. " +
              "Жауын-шашын, көшкін қаупі, модель көрсеткіштері және өлшемдерді ойдан шығарма. " +
              "Жергілікті дерек қажет болса, оны анық айт. Ресми ескерту берме.",
          },
          { role: "user", content: message },
        ],
        max_completion_tokens: 500,
      }),
      signal: AbortSignal.timeout(18_000),
      redirect: "error",
    });
    if (!result.ok) return await providerFailure(result);

    const data = await result.json();
    const answer = data?.choices?.[0]?.message?.content;
    if (typeof answer !== "string" || !answer.trim()) {
      return problem(502, "ЖИ қызметінен жауап келмеді.");
    }
    return Response.json({ answer }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return problem(502, "ЖИ қызметіне қосылу мүмкін болмады. Кейінірек қайталаңыз.");
  }
}
