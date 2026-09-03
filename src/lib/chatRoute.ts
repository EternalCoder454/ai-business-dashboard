import { CEO_ID } from "./seed";

/**
 * Whether a department screen is showing its list of conversations or one
 * conversation, decided in one place because two of them disagreed.
 *
 * The shell strips the top bar and the bottom bar on a department route, on the
 * reasoning that a conversation is a detail view: its own header carries a back
 * arrow and its composer owns the bottom edge, the way any messaging app works.
 *
 * That reasoning stopped holding the moment those routes started showing a list
 * first. A list has no back arrow and no composer, so on a phone it arrived
 * with the top bar gone, the bottom bar gone, and nothing on screen that led
 * anywhere: the only way out was the browser's own back button. The shell was
 * deciding from the path alone, and the path cannot tell the two apart.
 *
 * So the rule lives here and both callers ask it, rather than each keeping its
 * own copy to drift out of step with the other.
 */

/** The department a path is showing, or undefined when it is not one. */
export function departmentIdOf(pathname: string): string | undefined {
  if (pathname === "/ceo") return CEO_ID;
  if (!pathname.startsWith("/dept/")) return undefined;
  const id = pathname.slice("/dept/".length).split("/")[0];
  return id ? decodeURIComponent(id) : undefined;
}

/**
 * @param requested the `c` search parameter: a conversation id, "new", or
 *   nothing at all.
 * @param started how many conversations this department has that somebody has
 *   actually said something in. A department with none opens straight into a
 *   chat, because an empty list with a button on it is a click in front of the
 *   thing somebody came to do.
 */
export function showsConversationList(
  requested: string | null | undefined,
  started: number,
): boolean {
  return !requested && started > 0;
}

/* -------------------------------------------------------------------------- *
 * Telling the shell which of the two it is currently showing.
 * -------------------------------------------------------------------------- */

/**
 * An external store rather than a search parameter read in the layout.
 *
 * The obvious version of this asked `useSearchParams()` in the shell, which
 * fails the build: a hook that depends on the query string, used in a layout,
 * bails every page in the group out of prerendering, and the first page without
 * a Suspense boundary of its own stops the build. Nothing above both the shell
 * and the chat owns any other state, so this follows navCollapsed and keeps the
 * one boolean here.
 *
 * Defaults to false, which is the safe way round: a shell that wrongly believes
 * a conversation is open hides the navigation, and a shell that wrongly
 * believes a list is open shows a bar over a chat. The second is untidy, the
 * first strands somebody.
 */
let conversationOpen = false;
const watchers = new Set<() => void>();

export function subscribeConversationOpen(listener: () => void): () => void {
  watchers.add(listener);
  return () => watchers.delete(listener);
}

export function readConversationOpen(): boolean {
  return conversationOpen;
}

export function setConversationOpen(next: boolean): void {
  if (conversationOpen === next) return;
  conversationOpen = next;
  for (const listener of watchers) listener();
}
