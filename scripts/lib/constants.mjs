/**
 * The Foundry module id. Never change this once the module has been installed anywhere - Foundry
 * tracks modules by id, so renaming it makes every world treat this as a different module and lose
 * its settings.
 */
export const MODULE_ID = "tricky-homebrew-rules";

/** Display name, used in user-facing notifications. */
export const MODULE_TITLE = "Tricky Homebrew Rules";

/**
 * Class added to a dialog whose body should scroll once it outgrows the window.
 *
 * A DialogV2 is sized to its content (`.application.dialog { height: auto }`), but the browser caps
 * the `<dialog>` element itself at roughly the window height, and Foundry gives every window
 * `.window-content { overflow: hidden }`. A form taller than that cap is therefore clipped with no
 * scrollbar: the aura settings ran 2189px of content into a 1253px window, and the rows above the
 * cut sat at a negative offset where nothing could reach them. The matching rule in
 * `styles/tricky-homebrew-rules.css` caps the dialog body and scrolls it instead, which changes
 * nothing on a dialog that already fits.
 */
export const SCROLLING_DIALOG = "tricky-scrolling-dialog";
