import type { PhotoCreditFacts } from "./format";

/** The credit Google requires wherever one of its photos shows. Sits inside a positioned frame. */
export function PhotoCredit({ credit }: { credit: PhotoCreditFacts }) {
  const { author, authorUri } = credit;
  return (
    <span className="absolute right-3 bottom-3 max-w-[calc(100%-24px)] truncate rounded-pill bg-ink/45 px-2.5 py-1 text-micro text-white backdrop-blur-[10px]">
      From Google
      {author ? (
        <>
          {" · "}
          {authorUri ? (
            <a href={authorUri} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
              {author}
            </a>
          ) : (
            author
          )}
        </>
      ) : null}
    </span>
  );
}
