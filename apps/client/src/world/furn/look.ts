// The redrawn furniture's look in the world (docs/plan/67-the-furniture.md, decision 3: cel, as the
// people): its vertices go into World3's shared lit buffers like every other thing's, marked by their
// colour's alpha (CEL_ALPHA: an opaque material shows none of it, a faded copy a thousandth less), and
// the lit material shades what's marked with the people's bands (look/yulit.ts CEL). One material, one
// merge, as before.

/** A redrawn thing's vertex alpha. */
export const CEL_ALPHA = 0.999;
