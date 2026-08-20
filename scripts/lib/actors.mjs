/**
 * Every actor whose effects are worth walking: world actors plus the actors of unlinked tokens.
 *
 * Unlinked tokens keep their own copy of their effects rather than sharing the world actor's, so a
 * sweep that skipped them would leave exactly the tokens most likely to be mid-combat untouched.
 *
 * Everything here is already in memory, so this reads nothing from the database.
 *
 * @returns {Set<object>}
 */
export function allActors() {
  const actors = new Set(game.actors.contents);
  for (const scene of game.scenes) {
    for (const token of scene.tokens) {
      if (!token.actorLink && token.actor) actors.add(token.actor);
    }
  }
  return actors;
}
