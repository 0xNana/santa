/** A source link is only shown when this deployment has a configured repository URL. */
export function EditLink({ path }: { path: string }) {
  const repository = process.env.SANTA_REPOSITORY_URL;
  if (!repository?.startsWith("https://github.com/")) return null;
  return <p className="docs-edit"><a className="docs-edit-link" href={`${repository}/blob/main/packages/web/content/docs/${encodeURIComponent(path)}`} target="_blank" rel="noreferrer noopener">Edit this page on GitHub</a></p>;
}
