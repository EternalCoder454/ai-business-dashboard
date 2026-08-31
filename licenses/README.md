# Licensing across the studio

Three product lines, three different answers. Using one licence everywhere would
either strangle the mods or give away the panel.

| Line | Code | Assets | Why |
| --- | --- | --- | --- |
| Internal tools, the panel, Codex | PolyForm Strict 1.0.0 + contribution grant | Same | Readable so it can be audited. Nobody else should be running it. |
| Minecraft mods | LGPL-3.0-or-later | All rights reserved | Has to outlive the studio's attention. |
| Client websites | Client owns on payment in full | Per contract | The contract governs, not this. |
| Frontier Assembly | Not published | Not published | Ships as a binary under Epic's terms. |

---

## Internal tools and the panel

`LICENSE` at the repository root. PolyForm Strict 1.0.0 verbatim, plus a
separate Additional Grant permitting a copy solely to prepare a contribution.

Source-available, not open source. Never call it open source: that word has a
definition requiring the right to make derivative works and redistribute, and
this deliberately withholds both.

Note that Strict permits **noncommercial purposes only**. That is correct for a
tool nobody else should run and wrong for anything a commercial user needs.

## Minecraft mods

**Code: LGPL-3.0-or-later. Assets: all rights reserved.**

This is the one line where the studio deliberately gives up control, and it is
worth being clear about why.

A mod that cannot be forked dies when the studio stops updating it. Every
Minecraft version bump orphans mods whose authors moved on, and the ones that
survive are the ones somebody else was allowed to pick up. Keeping a
no-derivatives licence on a mod means choosing that it dies with the studio's
attention. That is a worse outcome than someone else maintaining it.

**Why LGPL rather than MIT.** Both let it live on. LGPL adds one thing that
matters here: a fork has to stay open under the same terms. Someone can continue
the mod, and cannot take it closed. MIT is the choice if adoption matters more
than that, and a closed fork would be acceptable.

**Why LGPL rather than GPL.** Minecraft's own copyright is effectively all
rights reserved, and plain GPL requires everything linked to it to be open too,
which Minecraft cannot be. LGPL-3.0 is the standard fix and what most modding
libraries use.

**Assets stay reserved.** Textures, models, and sounds are not covered by the
code licence and do not need to be. A fork can continue the code and cannot
ship the studio's art, which keeps the identity while letting the work survive.
Say this explicitly in the repository, because the default assumption is that
one LICENSE file covers everything.

**Getting the text.** Copy the canonical LGPL-3.0 from
<https://www.gnu.org/licenses/lgpl-3.0.txt>, alongside the GPL-3.0 text it
refers to. Do not retype or summarise a licence.

**What you keep anyway.** Trademark is separate from copyright, so the mod's
name and the studio's name are not licensed by LGPL and a fork should not be
using them. The Mojang disclaimer and a real contact route still have to be on
every listing regardless of licence.

## Client websites

The contract governs. IP transfers to the client once payment clears in full,
third-party assets are licensed rather than owned, and the studio keeps
portfolio rights. Nothing in this directory applies.

## Frontier Assembly

Not source-available. Epic's terms cover the engine, including the Release Form
before shipping and quarterly royalty reports even in quarters that owe nothing.

---

## Before applying any of this

Check what the code links against first. Linking copyleft code means the
combined work inherits those terms, and a restrictive licence over a work that
includes copyleft code is a violation rather than protection.

None of this is legal advice. It is a defensible default configuration. Anything
with real money attached should be read by an attorney before it is relied on.
