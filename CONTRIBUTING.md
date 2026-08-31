# Contributing

The source here is published so it can be read and checked, not so it can be
reused. See [LICENSE](LICENSE) for what that means in full.

Contributions are welcome, and the licence carries a narrow permission that
exists specifically to make them possible.

## Before you start

Open an issue first for anything beyond a small fix. A pull request that solves
a problem we were not going to solve, or solves it in a direction we were not
going to take, wastes your time more than ours.

## The terms contributions are accepted on

By submitting a pull request you confirm the following. There is nothing to
sign; opening the pull request is the agreement.

1. **You wrote it, or you have the right to submit it.** It is your original
   work, or it is covered by a licence compatible with this project and you say
   which one in the pull request.

2. **You grant Eterneon Studio a perpetual, worldwide, irrevocable, royalty-free
   licence to use, modify, publish, sublicense, and distribute your
   contribution**, as part of this project or otherwise, under any licence terms
   Eterneon Studio chooses.

3. **You keep your copyright.** This is a licence, not an assignment. You are
   free to use your own contribution elsewhere.

4. **You understand the project's licence.** Your contribution will be published
   under it, which means it will not be open source, and neither you nor anyone
   else will be able to fork this project and build on it afterwards.

Point 2 is the one worth reading twice. Without it, every accepted contribution
would leave someone else holding rights over part of a project that is otherwise
all rights reserved, and the licence would stop meaning anything. If that is not
a trade you want to make, do not contribute; that is a reasonable position and
no hard feelings.

## What happens to your copy

The permission to copy and edit this repository exists so you can prepare a
contribution. Once it is merged, declined, or abandoned, that permission ends
and so does your right to keep running the modified copy. Delete the fork.

## Security

Do not open a public issue for a security problem. Report it privately to the
address in the repository description, and give us a reasonable window before
saying anything publicly.

## Practical notes

- `npm run typecheck`, `npm run lint`, and `npm run build` all need to pass.
- `npm run guard-test` runs without a database and should pass too.
- The suites that touch Postgres (`smoke`, `messages-test`, `admin-test`) need a
  real `DATABASE_URL` and are run by us, not in CI.
- Match the surrounding code. Comments explain why something is the way it is,
  not what the line does.
