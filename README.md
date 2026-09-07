# Decodedly — Blocks Network agent (Dockerized)

Hides a secret message inside ordinary-looking cover text using a
reverse-engineered Vigenère key, and reveals it again. Runs as a Blocks
Network agent, in a Docker container.

## What's here

| File                 | Purpose                                                                 |
| -------------------- | ------------------------------------------------------------------------ |
| `handler.ts`         | The hide/reveal cipher logic — what the agent actually does              |
| `agent-card.json`    | Agent metadata + input/output schema, read by the Blocks Network         |
| `trigger.ts`         | Test script: sends a hide, then a reveal, checks the round trip          |
| `package.json`       | Node dependencies (`@blocks-network/sdk`, `tsx`, etc.)                   |
| `Dockerfile`         | Builds an image with the Blocks CLI + this project                       |
| `docker-compose.yml` | Runs that image as a long-lived service                                  |
| `.env`               | Holds `BLOCKS_API_KEY` — empty until you log in (see below)              |

## One-time setup (run on your host, not in Docker)

`blocks login` is an OAuth browser flow, so it can't run headlessly inside a
container. Do this once, from this folder, on your host machine:

```bash
npm install -g @blocks-network/cli    # or the curl installer — see Blocks docs
blocks login --write-env              # opens a browser, writes BLOCKS_API_KEY into .env
blocks register                       # registers the agent as private + free
```

`blocks register` reads `agent-card.json` in this folder and opens your
agent's dashboard page. After this, `.env` contains a real `BLOCKS_API_KEY`
and the agent exists on Blocks Network as private + free — the container's
job from here on is just to keep it running.

## Run it in Docker

```bash
docker compose up -d --build
docker compose logs -f      # confirm it connected — Ctrl+C to stop watching logs
```

The agent only opens an *outbound* connection to Blocks Network, so there's
nothing to expose or map — no `ports:` needed.

## Test it

`trigger.ts` calls the already-running agent over the network, so run it
inside the same container rather than installing Node locally:

```bash
docker compose exec decodedly npx tsx trigger.ts
```

Expected output: a `hide` task (prints the derived key), a `reveal` task
using that key, and `Round trip: OK ✅`.

## Stopping / restarting / rebuilding

```bash
docker compose down          # stop
docker compose up -d         # restart
docker compose up -d --build # rebuild after editing handler.ts or agent-card.json
```

If you change `agent-card.json` (description, tags, io/inputs) after the
first `blocks register`, re-run `blocks register` (or `blocks publish` if
you've already made it public) on the host so the registry picks up the
change — card edits don't sync automatically, per the Blocks docs.

## Adding the catalog icon

`identity.iconUrl` in `agent-card.json` is just a URL — Blocks doesn't host
images for you, so `icon.png` (included here, 512×512) needs to live
somewhere with a real public `https://` address first. `agent-card.json`
currently has a placeholder (`https://REPLACE-ME/icon.png`) so it's obvious
it still needs filling in.

Easiest option if this project ends up in a GitHub repo (probably will,
eventually): push it, then point `iconUrl` at the raw file, e.g.
`https://raw.githubusercontent.com/<you>/<repo>/main/icon.png`. Uploading it
to rilhia.com works just as well — any stable public URL does.

Once you've updated `iconUrl`:

```bash
blocks register   # or `blocks publish` if you've already gone public —
                   # card edits only sync when one of these runs
```

## Design note: two inputs, not one + a mode field

`agent-card.json` declares two separate inputs — `hide` and `reveal` —
rather than one input with a `mode` field inside its payload. Which
operation runs is determined by which input part the caller sends, not a
value inside it.

This follows from a real constraint: `io.inputs[].example` is a single
object, not an array, so one input can only ever show one example in
Blocks' in-browser "try it" widget. A `mode`-switched design means whichever
operation *isn't* the baked-in example has no accurate example shown at
all. Two inputs means two schemas and two accurate examples, and no
conditional-requirement logic needed in the handler — `hide` requires
`secretMessage`+`coverText`, `reveal` requires `coverText`+`key`, each
enforced directly by its own JSON Schema.

The `reveal` example's `key` isn't placeholder text — it's the real key
that the `hide` example's payload produces, so trying both examples as
shown actually round-trips correctly.

## Troubleshooting: `blocks` not found

Two separate places this can bite you, both from the same cause: the Blocks
CLI installer downloads the real binary to `~/.blocks/bin/blocks` and edits
your shell profile (`.zshrc`/`.bashrc`/`.profile`) to add it to `PATH` — but
that edit only takes effect somewhere that actually sources the profile.

- **On your host, right after installing:** open a new terminal (or run
  `source ~/.zshrc`) before trying `blocks` again — a terminal you already
  had open won't see the edit.
- **Inside Docker:** `CMD` never sources a shell profile at all, which is
  why the `Dockerfile` sets `PATH` explicitly with an `ENV` instruction
  instead of relying on the installer's profile edit, and runs
  `blocks --version` right after install so a broken CLI install fails the
  `docker build` immediately instead of failing confusingly later at
  `docker compose up`.

If you ever see this again inside the container, check what's actually
happening with:

```bash
docker compose run --rm decodedly sh -c "which blocks; ls -la /root/.blocks/bin; echo PATH=\$PATH"
```

## Going public

Still a host-side CLI action, not something the container does:

```bash
blocks publish --billing-mode free --listing public --accept-terms
```
