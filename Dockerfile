FROM node:22-slim

# The Blocks CLI provides `blocks run`, which starts the agent and opens its
# connection to Blocks Network. Installed globally, separate from the
# project's own dependencies below.
#
# The CLI's postinstall step downloads the real binary to ~/.blocks/bin and
# tries to add that to PATH via ~/.profile — but Docker's CMD never sources
# shell profile files, so that edit is invisible at container runtime. Add
# it to the image's actual PATH explicitly, and fail the build immediately
# (rather than failing confusingly later at `docker compose up`) if the
# binary still isn't resolvable.
RUN npm install -g @blocks-network/cli
ENV PATH="/root/.blocks/bin:${PATH}"
RUN blocks --version

WORKDIR /app

# Install project dependencies first so this layer is cached unless
# package.json changes.
COPY package.json ./
RUN npm install

# Project files. agent-card.json + handler.ts are what blocks run executes;
# trigger.ts is only used for testing (see README), via `docker compose exec`.
COPY agent-card.json handler.ts trigger.ts ./

# The agent opens a single outbound connection to Blocks Network — no ports
# to expose or publish.
CMD ["blocks", "run"]
