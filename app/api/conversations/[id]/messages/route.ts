const getBackendBaseUrl = () => process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5555";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestingUserId = request.headers.get("x-requesting-user-id");
  if (!requestingUserId) {
    return new Response("Missing x-requesting-user-id", { status: 400 });
  }

  const { id } = await params;
  const url = new URL(request.url);
  const qs = url.searchParams.toString();
  const backendUrl = `${getBackendBaseUrl()}/conversations/${id}/messages${qs ? `?${qs}` : ""}`;

  const res = await fetch(backendUrl, {
    headers: {
      "x-requesting-user-id": requestingUserId,
    },
    cache: "no-store",
  });

  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") ?? "application/json" },
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestingUserId = request.headers.get("x-requesting-user-id");
  if (!requestingUserId) {
    return new Response("Missing x-requesting-user-id", { status: 400 });
  }

  const { id } = await params;
  const body = await request.text();

  const res = await fetch(`${getBackendBaseUrl()}/conversations/${id}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-requesting-user-id": requestingUserId,
    },
    body,
  });

  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") ?? "application/json" },
  });
}
