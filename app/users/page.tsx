import Link from "next/link";
import { redirect } from "next/navigation";

type User = {
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  statusInSchool: "STUDENT" | "ALUMNI" | "TEACHER";
  isAdmin: boolean;
  phoneNumber?: string;
  photoUrl?: string;
  rgpdPreferences?: Record<string, unknown>;
  currentCourse?: string;
  studentClass?: "I1" | "I2" | "I3" | "M1" | "M2";
};

const getBaseUrl = () => process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5555";

async function createUser(formData: FormData): Promise<void> {
  "use server";

  const baseUrl = getBaseUrl();
  const requestingUserId = Number(formData.get("requestingUserId") ?? "1");

  const statusInSchool = String(formData.get("statusInSchool") ?? "TEACHER") as User["statusInSchool"];
  const studentClassRaw = String(formData.get("studentClass") ?? "");

  const body: User = {
    firstName: String(formData.get("firstName") ?? "").trim(),
    lastName: String(formData.get("lastName") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    passwordHash: String(formData.get("passwordHash") ?? "").trim(),
    statusInSchool,
    isAdmin: String(formData.get("isAdmin") ?? "false") === "true",
    phoneNumber: String(formData.get("phoneNumber") ?? "").trim() || undefined,
    currentCourse: String(formData.get("currentCourse") ?? "").trim() || undefined,
    rgpdPreferences: {},
    studentClass:
      statusInSchool === "STUDENT" && studentClassRaw
        ? (studentClassRaw as User["studentClass"])
        : undefined,
  };

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-requesting-user-id": String(requestingUserId),
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    redirect(`/users?error=${encodeURIComponent("Backend injoignable: " + msg)}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    redirect(
      `/users?error=${encodeURIComponent(`${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`)}`,
    );
  }

  const created = (await res.json()) as { id?: number };
  const createdId = created.id ?? "";
  redirect(`/users?createdId=${createdId}`);
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams?: Promise<{ createdId?: string; error?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const createdId = resolvedSearchParams?.createdId;
  const error = resolvedSearchParams?.error;

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-10 font-sans dark:bg-black">
      <main className="mx-auto w-full max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Users
          </h1>
          <Link className="text-sm text-zinc-700 underline dark:text-zinc-300" href="/">
            Retour accueil
          </Link>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100">
            Erreur lors de la création : {error}
          </div>
        ) : null}

        {createdId ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
            <div>Utilisateur créé. Id: {createdId}</div>
            <div className="mt-2">
              <Link className="underline" href={`/users/${createdId}`}>
                Voir le profil
              </Link>
            </div>
          </div>
        ) : null}

        <section className="rounded-xl bg-white p-6 shadow-sm dark:bg-zinc-950">
          <h2 className="text-lg font-medium text-black dark:text-zinc-50">
            Créer un utilisateur
          </h2>
          <form action={createUser} className="mt-4 grid grid-cols-1 gap-3">
            <label className="grid gap-1 text-sm text-zinc-700 dark:text-zinc-300">
              Id utilisateur (admin)
              <input name="requestingUserId" defaultValue="1" className="h-10 rounded-md border border-zinc-200 px-3 dark:border-zinc-800 dark:bg-black" />
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm text-zinc-700 dark:text-zinc-300">
                Prénom
                <input name="firstName" required className="h-10 rounded-md border border-zinc-200 px-3 dark:border-zinc-800 dark:bg-black" />
              </label>
              <label className="grid gap-1 text-sm text-zinc-700 dark:text-zinc-300">
                Nom
                <input name="lastName" required className="h-10 rounded-md border border-zinc-200 px-3 dark:border-zinc-800 dark:bg-black" />
              </label>
            </div>

            <label className="grid gap-1 text-sm text-zinc-700 dark:text-zinc-300">
              Email
              <input name="email" type="email" required className="h-10 rounded-md border border-zinc-200 px-3 dark:border-zinc-800 dark:bg-black" />
            </label>

            <label className="grid gap-1 text-sm text-zinc-700 dark:text-zinc-300">
              Mot de passe (temporaire)
              <input name="passwordHash" required className="h-10 rounded-md border border-zinc-200 px-3 dark:border-zinc-800 dark:bg-black" />
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm text-zinc-700 dark:text-zinc-300">
                Statut
                <select name="statusInSchool" defaultValue="TEACHER" className="h-10 rounded-md border border-zinc-200 px-3 dark:border-zinc-800 dark:bg-black">
                  <option value="STUDENT">STUDENT</option>
                  <option value="ALUMNI">ALUMNI</option>
                  <option value="TEACHER">TEACHER</option>
                </select>
              </label>

              <label className="grid gap-1 text-sm text-zinc-700 dark:text-zinc-300">
                studentClass (obligatoire si STUDENT)
                <select name="studentClass" defaultValue="" className="h-10 rounded-md border border-zinc-200 px-3 dark:border-zinc-800 dark:bg-black">
                  <option value="">(vide)</option>
                  <option value="I1">I1</option>
                  <option value="I2">I2</option>
                  <option value="I3">I3</option>
                  <option value="M1">M1</option>
                  <option value="M2">M2</option>
                </select>
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm text-zinc-700 dark:text-zinc-300">
                Admin ?
                <select name="isAdmin" defaultValue="false" className="h-10 rounded-md border border-zinc-200 px-3 dark:border-zinc-800 dark:bg-black">
                  <option value="false">non</option>
                  <option value="true">oui</option>
                </select>
              </label>

              <label className="grid gap-1 text-sm text-zinc-700 dark:text-zinc-300">
                Téléphone (optionnel)
                <input name="phoneNumber" className="h-10 rounded-md border border-zinc-200 px-3 dark:border-zinc-800 dark:bg-black" />
              </label>
            </div>

            <label className="grid gap-1 text-sm text-zinc-700 dark:text-zinc-300">
              Cours actuel (optionnel)
              <input name="currentCourse" className="h-10 rounded-md border border-zinc-200 px-3 dark:border-zinc-800 dark:bg-black" />
            </label>

            <button type="submit" className="mt-2 h-11 rounded-md bg-black px-4 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200">
              Créer
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
