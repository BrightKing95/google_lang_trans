# Passive Hover Activation Design

## Problem

Mouse-capture mode starts translation after a 500 ms passive hover. When Chrome reports the detector or translator model as `downloadable` or `downloading`, the engine returns `activation-required`. The controller currently renders that state as a full confirmation card. Closing the card does not suppress the next passive hover, and every new page creates a fresh controller, so the confirmation card feels like an unsolicited recurring popup.

## Goal

Keep mouse-capture mode automatic when Chrome's local models are ready, while preventing a passive hover from opening the full “Prepare and translate” confirmation card. Model preparation must begin only after an explicit user click.

## Chosen Interaction

When a passive hover reaches `activation-required`, render a compact circular translation action beside the hovered text. The action uses the localized “Prepare and translate” label as its accessible name. It does not display explanatory copy, progress, or a close button.

Clicking the compact action retries the same candidate with `userActivated: true`. From that point onward, existing states remain unchanged:

- `preparing` renders the current progress card.
- `translating` renders the current translating card.
- `success`, `same-language`, `unsupported`, and `error` render normally.
- A second `activation-required` reached after the explicit click may render the existing full confirmation card. This covers Chrome's separate detector and translator preparation steps without attempting to bypass the user-activation requirement.

Selection mode remains unchanged because selecting text is an explicit user action.

## Architecture

Add a presentational `activation-available` translation state. `InteractionController` maps `activation-required` to `activation-available` only when the request came from passive hover (`userActivated: false`). The translation engine remains responsible only for model availability and continues returning `activation-required`; it does not gain UI knowledge.

`OverlayRenderer` renders `activation-available` as a compact button that invokes the existing retry action. The current event ownership and hover-transition handling keep the action open while the pointer moves from source text into the extension overlay.

No persistent suppression setting is added. The compact action itself removes the disruptive behavior, while leaving model preparation discoverable on every page. The existing 250 ms hover-close behavior removes it when the pointer leaves.

## Visual and Accessibility Contract

- Compact action target: at least 32 × 32 CSS pixels.
- Use the existing overlay shadow root and positioning logic.
- Show a short decorative translation glyph; expose the localized `prepareTranslation` string through `aria-label` and `title`.
- Preserve visible `:focus-visible` styling.
- Do not add images, fonts, remote resources, permissions, storage keys, or network requests.

## State Flow

```text
passive hover (500 ms)
  -> normal translation request
  -> model ready: existing translation UI
  -> activation required: compact activation action
       -> pointer leaves: existing hover close
       -> user clicks: retry with user activation
            -> existing preparation / translation / result UI
```

## Error Handling

The new state has no independent failure path. After activation, errors continue through the existing retryable or unsupported states. Stale request IDs, outside clicks, Escape, settings changes, navigation, and controller destruction continue invalidating or closing the overlay through existing controller behavior.

## Testing

- Controller test: passive hover maps `activation-required` to `activation-available` and never renders the full confirmation state.
- Controller test: clicking the compact action still retries the last candidate with `userActivated: true` and permits a later full `activation-required` state.
- Renderer test: compact state contains one accessible activation button and omits explanatory confirmation text.
- Existing selection, hover timing, retry, focus, overlay lifecycle, translation engine, build, and dist tests must remain green.

## Acceptance Criteria

- Resting the mouse over text on a new page never opens the full model-confirmation card.
- A compact activation action appears only when Chrome requires explicit preparation.
- Clicking the compact action uses the existing preparation flow and can complete translation.
- Already-prepared models retain automatic mouse-capture translation.
- Selection mode behavior is unchanged.
