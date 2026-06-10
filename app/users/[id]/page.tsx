import Link from "next/link";
import { notFound } from "next/navigation";

type User = {
  firstName: string;
  lastName: string;
  email: string;
  statusInSchool?: string;
  isAdmin?: boolean;
  phoneNumber?: string;
  photoUrl?: string;
  rgpdPreferences?: Record<string, unknown>;
  currentCourse?: string;
  studentClass?: string;
};

const getBaseUrl = () => process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5555";

async function getUser(id: string): Promise<User | null> {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/users/${id}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Backend error: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as User;
}

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getUser(id);

  if (!user) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-10 font-sans dark:bg-black">
      <main className="mx-auto w-full max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Profil
          </h1>
          <div className="flex items-center gap-4">
            <Link className="text-sm text-zinc-700 underline dark:text-zinc-300" href="/users">
              Créer un utilisateur
            </Link>
            <Link className="text-sm text-zinc-700 underline dark:text-zinc-300" href="/public">
              Accueil
            </Link>
          </div>
        </div>

        <section className="rounded-xl bg-white p-6 shadow-sm dark:bg-zinc-950">
          <h2 className="text-lg font-medium text-black dark:text-zinc-50">
            {user.firstName} {user.lastName}
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Utilisateur #{id}</p>

          <div className="mt-6 grid grid-cols-1 gap-3 text-sm text-zinc-700 dark:text-zinc-300 sm:grid-cols-2">
            <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Email</div>
              <div className="mt-1 font-medium">{user.email}</div>
            </div>

            {user.statusInSchool ? (
              <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="text-xs text-zinc-500 dark:text-zinc-400">Statut</div>
                <div className="mt-1 font-medium">{user.statusInSchool}</div>
              </div>
            ) : null}

            {typeof user.isAdmin === "boolean" ? (
              <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="text-xs text-zinc-500 dark:text-zinc-400">Admin</div>
                <div className="mt-1 font-medium">{user.isAdmin ? "Oui" : "Non"}</div>
              </div>
            ) : null}

            {user.phoneNumber ? (
              <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="text-xs text-zinc-500 dark:text-zinc-400">Téléphone</div>
                <div className="mt-1 font-medium">{user.phoneNumber}</div>
              </div>
            ) : null}

            {user.currentCourse ? (
              <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="text-xs text-zinc-500 dark:text-zinc-400">Cours</div>
                <div className="mt-1 font-medium">{user.currentCourse}</div>
              </div>
            ) : null}

            {user.studentClass ? (
              <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="text-xs text-zinc-500 dark:text-zinc-400">Classe</div>
                <div className="mt-1 font-medium">{user.studentClass}</div>
              </div>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}
