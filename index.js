/**
 * Host half of the token-cost bundle.
 *
 * Registers one client-visible session projection, `tokenCost`. The projection
 * folds committed assistant usage events into per-route, per-price-class token
 * buckets and exposes a finished cost view to the browser. It adds no tool,
 * service, command, session event, or model-visible content.
 */

import { buildView, emptyState, foldEvent, stateSchema, viewSchema } from './fold.js';

export const inject = ['sessionProjections'];

/** The single projection unit owned by this plugin. */
const DEFINITION = Object.freeze({
  key: 'tokenCost',
  stateVersion: 1,
  stateSchema,
  init: () => emptyState(),
  apply: foldEvent,
  wire: Object.freeze({
    viewSchema,
    view: (state) => buildView(state),
  }),
});

/**
 * Register the token-cost projection on the owning plugin fiber.
 * @param {import('@deepseek-ai/cordis').Context} ctx - host plugin context.
 */
export function apply(ctx) {
  ctx.effect(
    () => ctx.sessionProjections.register(DEFINITION),
    'token-cost: tokenCost projection',
  );
}
