import Link from "next/link";

export default async function UnavailablePage({
  searchParams,
}: {
  searchParams?: Promise<{ feature?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const feature = sp.feature ?? "Fonctionnalité";

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 font-sans dark:bg-black">
      <main className="w-full max-w-xl rounded-xl bg-white p-8 shadow-sm dark:bg-zinc-950">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          {feature}
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Fonctionnalité indisponible pour le moment.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/chat"
            className="flex h-12 items-center justify-center rounded-md bg-black px-4 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Retour messagerie
          </Link>
          <Link
            href="/"
            className="flex h-12 items-center justify-center rounded-md border border-zinc-200 bg-white px-4 text-sm font-medium text-black hover:bg-zinc-50 dark:border-zinc-800 dark:bg-black dark:text-white dark:hover:bg-zinc-900"
          >
            Accueil
          </Link>
        </div>
      </main>
    </div>
  );
}
