import { answerAssistant, assistantSession } from "../server/assistant.mjs";

const routes = {
  GET: /^\/api\/(health|model\/status|regions|assessments|alerts|reports\/\d+|export\/assessments\.csv)$/,
  POST: /^\/api\/(predict|assistant|datasets\/upload)$/,
  PATCH: /^\/api\/alerts\/\d+$/,
};

function problem(status, detail) {
  return Response.json({ detail }, { status, headers: { "Cache-Control": "no-store" } });
}

async function proxy(request) {
  const incoming = new URL(request.url);
  const login = request.method === "GET" && incoming.pathname === "/api/session";
  const pathname = login ? "/api/regions" : incoming.pathname;
  if (!routes[request.method]?.test(pathname)) {
    return problem(404, "API мекенжайы табылмады.");
  }

  const origin = request.headers.get("Origin");
  if (request.method !== "GET" && origin && origin !== incoming.origin) {
    return problem(403, "Сұрауды осы сайттан жіберіңіз.");
  }

  const backendOrigin = process.env.GEORISK_API_ORIGIN?.trim();
  if (!backendOrigin && login) return assistantSession(request);
  if (!backendOrigin && pathname === "/api/assistant") return answerAssistant(request);

  let backend;
  try {
    backend = new URL(backendOrigin);
    if (backend.protocol !== "https:" || backend.username || backend.password ||
        backend.pathname !== "/" || backend.search || backend.hash) {
      throw new Error("Expected HTTPS origin");
    }
  } catch {
    return problem(503, "Бұл нұсқада GeoRisk API әлі қосылмаған.");
  }

  const target = new URL(pathname, backend);
  if (!login) {
    target.search = incoming.search;
  }
  const headers = new Headers();
  for (const name of ["Content-Type", "Accept", "Authorization"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  try {
    const options = {
      method: request.method,
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    };
    if (request.body) {
      options.body = request.body;
      options.duplex = "half";
    }
    const upstream = await fetch(target, options);
    if (login && upstream.ok) {
      await upstream.body?.cancel();
      return new Response(null, { status: 303, headers: { Location: "/", "Cache-Control": "no-store" } });
    }
    if (upstream.status >= 300 && upstream.status < 400) {
      await upstream.body?.cancel();
      return problem(502, "GeoRisk API күтпеген мекенжайға бағыттады.");
    }
    if (upstream.status === 401 && !login) {
      await upstream.body?.cancel();
      return problem(401, "Деректерді көру үшін серверге кіріңіз.");
    }

    const outgoing = new Headers({ "Cache-Control": "no-store" });
    for (const name of ["Content-Type", "Content-Disposition", "WWW-Authenticate"]) {
      const value = upstream.headers.get(name);
      if (value) outgoing.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers: outgoing });
  } catch {
    return problem(502, "GeoRisk API-мен байланысу мүмкін болмады.");
  }
}

export function GET(request) {
  return proxy(request);
}

export function POST(request) {
  return proxy(request);
}

export function PATCH(request) {
  return proxy(request);
}
