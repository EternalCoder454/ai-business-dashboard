import next from "eslint-config-next";

/**
 * Deliberately narrow.
 *
 * This exists for one rule: react-hooks/exhaustive-deps. A memo in the store
 * shipped without one of its dependencies, which meant a project created in
 * local mode did not appear until something unrelated happened to change the
 * value. TypeScript cannot see that, `next build` does not fail on it, and it
 * is the exact class of bug this rule catches.
 *
 * exhaustive-deps is a warning in Next's own config, and a warning nobody reads
 * is the same as no rule at all, so it is raised to an error here.
 */
export default [
  ...next,
  {
    rules: {
      "react-hooks/exhaustive-deps": "error",

      /**
       * A warning rather than an error, on purpose.
       *
       * Every occurrence here is one of two legitimate shapes: reading
       * localStorage on mount, which cannot happen during render without
       * breaking hydration, and adopting a store value into local draft state
       * until the field is first edited. Both genuinely need an effect. The
       * rule is still worth having visible, because a real cascading setState
       * would look identical in the output and deserves a second look.
       */
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    ignores: [".next/**", ".next-build/**", "node_modules/**", "drizzle/**"],
  },
];
