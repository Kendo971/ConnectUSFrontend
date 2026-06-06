import Image from "next/image";

type User = {
  firstName: string;
  lastName: string;
  email: string;
  statusInSchool?: string;
  isAdmin?: boolean;
  phoneNumber?: string;
  currentCourse?: string;
};

async function getUser(): Promise<User> {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5555";
  const res = await fetch(`${baseUrl}/users/1`, { cache: "no-store" });

  if (!res.ok) {
    throw new Error(`Backend error: ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as User;
}

export default async function Home() {
  const user = await getUser();
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 font-sans dark:bg-black">
      <main className="w-full max-w-2xl rounded-xl bg-white p-8 shadow-sm dark:bg-zinc-950">
        <div className="flex items-center justify-between gap-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
              ConnectUS
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Backend branché : utilisateur récupéré depuis l'API
            </p>
          </div>
          <Image
            className="dark:invert"
            src="/next.svg"
            alt="Next.js logo"
            width={80}
            height={16}
            priority
          />
        </div>

        <section className="mt-8 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="text-lg font-medium text-black dark:text-zinc-50">User #1</h2>
          <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <div>
              <span className="font-medium">Nom :</span> {user.firstName} {user.lastName}
            </div>
            <div>
              <span className="font-medium">Email :</span> {user.email}
            </div>
            {user.statusInSchool ? (
              <div>
                <span className="font-medium">Statut :</span> {user.statusInSchool}
              </div>
            ) : null}
            {typeof user.isAdmin === "boolean" ? (
              <div>
                <span className="font-medium">Admin :</span> {user.isAdmin ? "oui" : "non"}
              </div>
            ) : null}
            {user.phoneNumber ? (
              <div>
                <span className="font-medium">Téléphone :</span> {user.phoneNumber}
              </div>
            ) : null}
            {user.currentCourse ? (
              <div>
                <span className="font-medium">Cours :</span> {user.currentCourse}
              </div>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}
