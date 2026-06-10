const getBackendBaseUrl = () =>
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5555";

// Proxy serveur → backend pour la carte publique d'un utilisateur (login).
// Évite un appel direct navigateur → backend (le REST n'expose pas de CORS).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const res = await fetch(`${getBackendBaseUrl()}/users/${id}/card`, {
    cache: "no-store",
  });

  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("content-type") ?? "application/json",
    },
  });
}
