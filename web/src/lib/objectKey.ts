// Pure helpers shared by the client uploader and the server signing function.
// Object keys are namespaced by user so RLS-style ownership extends to blob storage.

export function objectKeyFor(userId: string, entity: string, id: string): string {
  return `${userId}/${entity}/${id}`
}

export function keyBelongsToUser(key: string, userId: string): boolean {
  return key.startsWith(`${userId}/`)
}
